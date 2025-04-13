import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Pagination, TableCell, Button, Tooltip } from '@mui/material';
import { deleteDoc, doc, setDoc, collection, query, where, getDocs, writeBatch, updateDoc, increment } from 'firebase/firestore';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import DeleteIcon from '@mui/icons-material/Delete';

// Función para generar un ID único para uso interno
const generateUniqueId = () => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

const ITEMS_PER_PAGE = 10;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

/**
 * Componente para gestionar las solicitudes pendientes
 * @param {Object} props - Propiedades del componente
 * @param {Array} props.solicitudes - Lista de solicitudes
 * @param {Array} props.availablePlazas - Lista de centros disponibles
 * @param {Array} props.assignments - Lista de asignaciones
 * @param {Function} props.onProcesarSolicitud - Función para procesar una solicitud
 * @param {boolean} props.isLoading - Indica si está cargando
 * @param {Function} [props.showNotification] - Función opcional para mostrar notificaciones
 * @param {Object} props.db - Referencia a la base de datos Firestore
 * @param {Function} props.recargarDatos - Función para recargar datos
 * @returns {JSX.Element} Componente de gestión de solicitudes
 */
const RequestManager = ({ 
  solicitudes = [], 
  availablePlazas = [], 
  assignments = [],
  onProcesarSolicitud,
  isLoading,
  showNotification,
  db,
  recargarDatos
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [notificacion, setNotificacion] = useState({ mensaje: '', tipo: '', dashboard: '' });
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState(null);
  const [solicitudReasignar, setSolicitudReasignar] = useState(null);
  const [solicitudAsignar, setSolicitudAsignar] = useState(null);
  const [centroSeleccionado, setCentroSeleccionado] = useState(null);
  const [dashboardMessage, setDashboardMessage] = useState('');
  const [confirmEliminar, setConfirmEliminar] = useState(null);
  const mountedRef = useRef(true);
  const notificationTimeoutRef = useRef(null);
  const lastNotificationRef = useRef(null);
  const isInitialLoadRef = useRef(true);
  const dataLoadTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const lastSolicitudesRef = useRef([]);

  // Función para mostrar notificaciones de manera segura
  const mostrarNotificacion = useCallback((mensaje, tipo = 'info', dashboard = '') => {
    if (!mountedRef.current) return;

    if (lastNotificationRef.current === mensaje) return;
    lastNotificationRef.current = mensaje;

    setNotificacion({ mensaje, tipo, dashboard });
    setDashboardMessage(dashboard);
    if (showNotification) {
      showNotification(mensaje, tipo, dashboard);
    }

    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }

    if (tipo === 'success' || tipo === 'info') {
      notificationTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setNotificacion({ mensaje: '', tipo: '', dashboard: '' });
          setDashboardMessage('');
          lastNotificationRef.current = null;
        }
      }, 3000);
    }
  }, [showNotification]);

  // Función para cargar datos con reintentos
  const cargarDatosConReintentos = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      if (recargarDatos) {
        await recargarDatos();
        retryCountRef.current = 0;
        setError(null);
      }
    } catch (error) {
      console.error('Error al cargar datos:', error);
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1;
        const delay = RETRY_DELAY * retryCountRef.current;
        mostrarNotificacion(`Error al cargar datos. Reintentando en ${delay/1000} segundos...`, 'error');
        setTimeout(cargarDatosConReintentos, delay);
      } else {
        setError('No se pudo cargar los datos después de varios intentos');
        mostrarNotificacion('Error al cargar los datos. Por favor, intente más tarde.', 'error');
      }
    }
  }, [recargarDatos, mostrarNotificacion]);

  // Verificar y mostrar información sobre solicitudes recibidas
  useEffect(() => {
    mountedRef.current = true;
    isInitialLoadRef.current = true;

    // Verificar si las solicitudes han cambiado
    const solicitudesActuales = JSON.stringify(solicitudes);
    if (solicitudesActuales !== JSON.stringify(lastSolicitudesRef.current)) {
      lastSolicitudesRef.current = solicitudes;
      
      const loadData = () => {
        if (mountedRef.current && isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
          console.log(`RequestManager: Recibidas ${solicitudes.length} solicitudes`);
          
          // Verificar solicitudes incompletas
          const solicitudesIncompletas = solicitudes.filter(s => !s.dni || !s.timestamp);
          if (solicitudesIncompletas.length > 0) {
            console.log('Solicitudes incompletas encontradas:', solicitudesIncompletas.map(s => s.id));
            mostrarNotificacion(
              `Se encontraron ${solicitudesIncompletas.length} solicitudes incompletas`,
              'warning',
              'Hay solicitudes incompletas que necesitan revisión'
            );
          }

          if (solicitudes.length === 0) {
            mostrarNotificacion('No hay solicitudes pendientes disponibles', 'info', 'No hay solicitudes pendientes');
          } else {
            mostrarNotificacion(
              `${solicitudes.length} solicitudes pendientes disponibles`,
              'info',
              `${solicitudes.length} solicitudes pendientes`
            );
          }
        }
      };

      // Retrasar la carga inicial para evitar problemas de sincronización
      dataLoadTimeoutRef.current = setTimeout(loadData, 100);
    }

    // Intentar cargar datos si hay un error
    if (error) {
      cargarDatosConReintentos();
    }

    return () => {
      mountedRef.current = false;
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
      if (dataLoadTimeoutRef.current) {
        clearTimeout(dataLoadTimeoutRef.current);
      }
    };
  }, [solicitudes, mostrarNotificacion, error, cargarDatosConReintentos]);

  // Crear mapa de centros para búsqueda eficiente y detectar duplicados
  const centrosMap = useMemo(() => {
    if (!mountedRef.current) return new Map();
    
    const map = new Map();
    const idsDuplicados = new Set();
    console.log("Procesando availablePlazas para centrosMap:", availablePlazas);
    
    // Examinar la estructura de los primeros 5 centros para depuración
    console.log("Estructura de centros (muestra):");
    availablePlazas.slice(0, 5).forEach((centro, index) => {
      if (!centro) {
        console.log(`Centro ${index}: null o indefinido`);
        return;
      }
      
      console.log(`Centro ${index} - ID: ${centro.id || centro.docId || 'No ID'}, Propiedades disponibles:`, 
        Object.keys(centro).join(', '));
      console.log(`Centro ${index} - Valores:`, {
        id: centro.id,
        docId: centro.docId,
        nombre: centro.nombre,
        centro: centro.centro,
        nombreCentro: centro.nombreCentro,
        codigo: centro.codigo,
        localidad: centro.localidad,
        municipio: centro.municipio
      });
    });
    
    // Primera pasada: detectar duplicados
    availablePlazas.forEach(centro => {
      if (!centro) return;
      if (centro.id && map.has(centro.id)) {
        idsDuplicados.add(centro.id);
        console.warn(`ID duplicado detectado: ${centro.id}, Nombre: ${centro.nombre || 'Sin nombre'}`);
      }
    });
    
    // Segunda pasada: mapear con manejo de duplicados
    availablePlazas.forEach(centro => {
      if (!centro) return;
      
      // Agregar atributo tempId si no existe
      if (!centro.tempId) {
        centro.tempId = generateUniqueId();
      }
      
      // Normalizar nombre - asegurarse de que todos los centros tengan un nombre adecuado
      if (!centro.nombre || centro.nombre.trim() === '') {
        // Buscar el nombre en diferentes propiedades
        centro.nombre = centro.centro || centro.nombreCentro || (centro.codigo ? `Centro ${centro.codigo}` : `Centro ${centro.id || centro.docId || 'sin ID'}`);
        console.log(`Nombre normalizado para centro: ${centro.id || centro.docId || 'sin ID'} -> "${centro.nombre}"`);
      }
      
      if (centro.id) {
        // Si es un ID duplicado, usar un ID compuesto para el mapa
        const mapKey = idsDuplicados.has(centro.id) ? 
          `${centro.id}-${centro.tempId}` : 
          centro.id;
        
        map.set(centro.id, centro); // Mantener el mapeo original por ID
      }
      
      if (centro.docId && centro.docId !== centro.id) {
        map.set(centro.docId, centro);
      }
    });
    
    console.log(`Mapa de centros creado con ${map.size} entradas, IDs duplicados: ${idsDuplicados.size}`);
    return map;
  }, [availablePlazas]);

  // Procesar y filtrar solicitudes
  const solicitudesProcesadas = useMemo(() => {
    if (!mountedRef.current) return [];

    // Log de solicitudes recibidas para diagnóstico
    console.log('RequestManager: Solicitudes recibidas:', solicitudes);
    
    // Identificar solicitudes incompletas pero incluirlas de todos modos
    const incompletas = solicitudes.filter(s => !s.dni || !s.timestamp);
    if (incompletas.length > 0) {
      console.log('Solicitudes incompletas que serán incluidas:', incompletas);
    }

    const procesadas = solicitudes
      .map(solicitud => {
        // Obtener centrosIds y eliminar duplicados
        const centrosIdsOriginal = solicitud.centrosIds || solicitud.centrosSeleccionados || [];
        
        // Contamos las ocurrencias de cada ID para mostrar duplicados
        const conteoIds = {};
        centrosIdsOriginal.forEach(id => {
          conteoIds[id] = (conteoIds[id] || 0) + 1;
        });
        
        const centrosIds = [...new Set(centrosIdsOriginal)]; // Eliminar duplicados
        
        if (centrosIdsOriginal.length !== centrosIds.length) {
          console.log(`Se eliminaron ${centrosIdsOriginal.length - centrosIds.length} centros duplicados en solicitud ${solicitud.orden || solicitud.numeroOrden}`);
        }
        
        console.log(`Procesando solicitud ${solicitud.orden || solicitud.numeroOrden}, centrosIds únicos:`, centrosIds);
        
        // Si la solicitud ya está asignada, usar la información de la asignación
        if (solicitud.asignacion) {
          const centroAsignado = {
            id: solicitud.asignacion.centroId,
            docId: solicitud.asignacion.centroId,
            tempId: generateUniqueId(),
            nombre: solicitud.asignacion.centroNombre,
            localidad: solicitud.asignacion.centroLocalidad,
            municipio: solicitud.asignacion.centroMunicipio,
            plazasDisponibles: 0,
            plazasTotal: 0,
            codigo: solicitud.asignacion.centroId,
            asignado: true
          };
          
          // Procesar los centros con IDs únicos
        const centros = centrosIds
          .map(id => {
            const centro = centrosMap.get(id);
              const ocurrencias = conteoIds[id];
              
            if (!centro) {
                console.log(`No se encontró centro para ID: ${id} en solicitud:`, solicitud);
                
                // Intentar buscar el centro por código - búsqueda más exhaustiva
                const centroPorCodigo = availablePlazas.find(c => c.codigo === id);
                if (centroPorCodigo) {
                  console.log(`Encontrado centro por código ${id}:`, centroPorCodigo);
                  return {
                    id: centroPorCodigo.id || id,
                    docId: centroPorCodigo.docId || id,
                    tempId: generateUniqueId(),
                    nombre: centroPorCodigo.nombre || centroPorCodigo.centro || centroPorCodigo.nombreCentro || `Centro con código ${id}`,
                    localidad: centroPorCodigo.localidad || centroPorCodigo.municipio || 'No disponible',
                    municipio: centroPorCodigo.municipio || centroPorCodigo.localidad || 'No disponible',
                    plazasDisponibles: centroPorCodigo.plazasDisponibles || 0,
                    plazasTotal: centroPorCodigo.plazasTotal || 0,
                    codigo: centroPorCodigo.codigo || id,
                    ocurrencias: ocurrencias
                  };
                }
                
                return {
                  id: id,
                  docId: id,
                  tempId: generateUniqueId(),
                  nombre: `Centro con código ${id}`,
                  localidad: 'No disponible',
                  municipio: 'No disponible',
                  plazasDisponibles: 0,
                  plazasTotal: 0,
                  codigo: id,
                  ocurrencias: ocurrencias
                };
              }
              
            return {
              id: centro.id || centro.docId,
                docId: centro.docId || centro.id,
                tempId: generateUniqueId(),
                nombre: centro.nombre || centro.centro || centro.nombreCentro || `Centro con código ${id}`,
                localidad: centro.localidad || centro.municipio || 'No disponible',
                municipio: centro.municipio || centro.localidad || 'No disponible',
              plazasDisponibles: centro.plazasDisponibles || 0,
                plazasTotal: centro.plazasTotal || 0,
                codigo: centro.codigo || id,
                ocurrencias: ocurrencias
            };
          })
          .filter(Boolean);

        return {
          ...solicitud,
            id: solicitud.id || solicitud.docId,
            docId: solicitud.docId || solicitud.id,
            tempId: generateUniqueId(),
            centros: centros,
            centrosIdsSinDuplicados: centrosIds,
            centrosIdsOriginal,
            conteoIds,
            fecha: solicitud.fechaAsignacion || solicitud.fecha,
            estado: 'asignada',
            incompleta: false,
            centroAsignado: centroAsignado // Mantener la referencia al centro asignado
          };
        }
        
        // Procesar los centros con IDs únicos
        const centros = centrosIds
          .map(id => {
            const centro = centrosMap.get(id);
            const ocurrencias = conteoIds[id];
            
            if (!centro) {
              console.log(`No se encontró centro para ID: ${id} en solicitud:`, solicitud);
              
              // Intentar buscar el centro por código - búsqueda más exhaustiva
              const centroPorCodigo = availablePlazas.find(c => c.codigo === id);
              if (centroPorCodigo) {
                console.log(`Encontrado centro por código ${id}:`, centroPorCodigo);
                return {
                  id: centroPorCodigo.id || id,
                  docId: centroPorCodigo.docId || id,
                  tempId: generateUniqueId(),
                  nombre: centroPorCodigo.nombre || centroPorCodigo.centro || centroPorCodigo.nombreCentro || `Centro con código ${id}`,
                  localidad: centroPorCodigo.localidad || centroPorCodigo.municipio || 'No disponible',
                  municipio: centroPorCodigo.municipio || centroPorCodigo.localidad || 'No disponible',
                  plazasDisponibles: centroPorCodigo.plazasDisponibles || 0,
                  plazasTotal: centroPorCodigo.plazasTotal || 0,
                  codigo: centroPorCodigo.codigo || id,
                  ocurrencias: ocurrencias
                };
              }
              
              return {
                id: id,
                docId: id,
                tempId: generateUniqueId(),
                nombre: `Centro con código ${id}`,
                localidad: 'No disponible',
                municipio: 'No disponible',
                plazasDisponibles: 0,
                plazasTotal: 0,
                codigo: id,
                ocurrencias: ocurrencias
              };
            }
            
            return {
              id: centro.id || centro.docId,
              docId: centro.docId || centro.id,
              tempId: generateUniqueId(),
              nombre: centro.nombre || centro.centro || centro.nombreCentro || `Centro con código ${id}`,
              localidad: centro.localidad || centro.municipio || 'No disponible',
              municipio: centro.municipio || centro.localidad || 'No disponible',
              plazasDisponibles: centro.plazasDisponibles || 0,
              plazasTotal: centro.plazasTotal || 0,
              codigo: centro.codigo || id,
              ocurrencias: ocurrencias
            };
          })
          .filter(Boolean);

        // Marcar si la solicitud está incompleta
        const esIncompleta = !solicitud.asignacion && (!solicitud.dni || !solicitud.timestamp || centros.length === 0);
        
        console.log(`Solicitud ${solicitud.orden || solicitud.numeroOrden} procesada con ${centros.length} centros, incompleta: ${esIncompleta}`);
        
        return {
          ...solicitud,
          id: solicitud.id || solicitud.docId,
          docId: solicitud.docId || solicitud.id,
          tempId: generateUniqueId(),
          centros,
          centrosIdsSinDuplicados: centrosIds,
          centrosIdsOriginal,
          conteoIds,
          fecha: solicitud.fechaAsignacion || solicitud.fecha,
          estado: solicitud.estado || 'pendiente',
          incompleta: esIncompleta
        };
      });
    
    const ordenadas = procesadas.sort((a, b) => {
      const ordenA = parseInt(a.orden || a.numeroOrden || 0, 10);
      const ordenB = parseInt(b.orden || b.numeroOrden || 0, 10);
      return ordenA - ordenB;
    });
    
    console.log('Solicitudes procesadas:', ordenadas.length);
    return ordenadas;
  }, [solicitudes, centrosMap]);

  // Filtrar solicitudes por término de búsqueda
  const solicitudesFiltradas = useMemo(() => {
    if (!mountedRef.current) return [];
    if (!searchTerm) return solicitudesProcesadas;
    
    const searchLower = searchTerm.toLowerCase();
    return solicitudesProcesadas.filter(solicitud => 
      (solicitud.orden && solicitud.orden.toString().includes(searchTerm)) ||
      (solicitud.numeroOrden && solicitud.numeroOrden.toString().includes(searchTerm)) ||
      solicitud.centros?.some(c => 
        (c.nombre && c.nombre.toLowerCase().includes(searchLower)) ||
        (c.localidad && c.localidad.toLowerCase().includes(searchLower))
      )
    );
  }, [solicitudesProcesadas, searchTerm]);

  // Paginación
  const totalPages = Math.ceil(solicitudesFiltradas.length / ITEMS_PER_PAGE);
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const paginatedData = solicitudesFiltradas.slice(indexOfFirstItem, indexOfLastItem);

  // Función para procesar una solicitud
  const handleProcesarSolicitud = useCallback(async (solicitud) => {
    if (!mountedRef.current) return;

    // Verificación más permisiva para solicitudes incompletas, pero con advertencia
    if (!solicitud.centros || solicitud.centros.length === 0) {
      // Verificar si es una solicitud que contiene centrosIds pero no centros procesados
      if (solicitud.centrosIds && solicitud.centrosIds.length > 0) {
        // Solicitud con centrosIds pero centros no procesados - podemos continuar
        console.log("Solicitud con centrosIds pero sin centros procesados:", solicitud);
        
        // Intentamos encontrar los centros directamente para procesarlos
        const centrosProcesados = solicitud.centrosIds.map(id => {
          const centro = centrosMap.get(id);
          if (!centro) return null;
          
          return {
            id: centro.id || centro.docId,
            nombre: centro.nombre || 'Sin nombre',
            localidad: centro.localidad || 'Sin localidad',
            municipio: centro.municipio || centro.localidad || 'Sin municipio',
            plazasDisponibles: centro.plazasDisponibles || 0,
            plazasTotal: centro.plazasTotal || 0
          };
        }).filter(Boolean);
        
        if (centrosProcesados.length === 0) {
          mostrarNotificacion('No se pudieron encontrar los centros seleccionados', 'error');
          return;
        }
        
        // Actualizar la solicitud con centros procesados
        solicitud = {
          ...solicitud,
          centros: centrosProcesados,
          incompleta: false // Marcamos como completa para procesar
        };
        
        mostrarNotificacion('Procesando solicitud con centros recuperados', 'info');
      } else {
      mostrarNotificacion('La solicitud no tiene centros seleccionados', 'error');
      return;
      }
    }

    setProcesando(true);
    try {
      if (onProcesarSolicitud) {
        await onProcesarSolicitud(solicitud);
        mostrarNotificacion('Solicitud procesada correctamente', 'success');
        await cargarDatosConReintentos();
      } else {
        mostrarNotificacion('No se ha configurado una función para procesar solicitudes', 'error');
      }
    } catch (error) {
      console.error('Error al procesar la solicitud:', error);
      mostrarNotificacion(`Error al procesar la solicitud: ${error.message || 'Error desconocido'}`, 'error');
      setError(error);
    } finally {
      if (mountedRef.current) {
        setProcesando(false);
      }
    }
  }, [onProcesarSolicitud, cargarDatosConReintentos, mostrarNotificacion, centrosMap]);

  // Función para manejar la apertura del modal de asignación
  const handleMostrarAsignacion = useCallback((solicitud) => {
    // Verificar si la solicitud tiene centros procesados o necesita procesar los centrosIds
    if ((!solicitud.centros || solicitud.centros.length === 0) && solicitud.centrosIds && solicitud.centrosIds.length > 0) {
      console.log("Modal Asignación: Procesando centros para solicitud:", solicitud);
      
      // Eliminar duplicados de centrosIds
      const centrosIdsSinDuplicados = [...new Set(solicitud.centrosIds)];
      
      // Procesar los centros antes de mostrar el modal
      const centrosProcesados = centrosIdsSinDuplicados.map(id => {
        const centro = centrosMap.get(id);
        if (!centro) {
          console.log(`Modal Asignación: No se encontró centro para ID: ${id}`);
          
          // Intentar buscar el centro por código - búsqueda más exhaustiva
          const centroPorCodigo = availablePlazas.find(c => c.codigo === id);
          if (centroPorCodigo) {
            console.log(`Modal Asignación: Encontrado centro por código ${id}:`, centroPorCodigo);
            return {
              id: centroPorCodigo.id || id,
              docId: centroPorCodigo.docId || id,
              tempId: generateUniqueId(),
              nombre: centroPorCodigo.nombre || centroPorCodigo.centro || centroPorCodigo.nombreCentro || `Centro con código ${id}`,
              localidad: centroPorCodigo.localidad || centroPorCodigo.municipio || 'No disponible',
              municipio: centroPorCodigo.municipio || centroPorCodigo.localidad || 'No disponible',
              plazasDisponibles: centroPorCodigo.plazasDisponibles || 0,
              plazasTotal: centroPorCodigo.plazasTotal || 0,
              codigo: centroPorCodigo.codigo || id
            };
          }
          
          return {
            id: id,
            docId: id,
            tempId: generateUniqueId(),
            nombre: `Centro con código ${id}`,
            localidad: 'No disponible',
            municipio: 'No disponible',
            plazasDisponibles: 0,
            plazasTotal: 0,
            codigo: id // Usar el ID como código
          };
        }
        
        console.log(`Modal Asignación: Centro encontrado para ID ${id}:`, centro);
        console.log(`Modal Asignación: Nombre del centro: ${centro.nombre || centro.centro || centro.nombreCentro || 'No disponible'}`);
        
        // Asegurar que tengamos un nombre para el centro, probando diferentes propiedades
        const nombreCentro = centro.nombre || centro.centro || centro.nombreCentro || `Centro con código ${id}`;
        
        return {
          id: centro.id || centro.docId,
          docId: centro.docId || centro.id,
          tempId: generateUniqueId(),
          nombre: nombreCentro,
          localidad: centro.localidad || centro.municipio || 'No disponible',
          municipio: centro.municipio || centro.localidad || 'No disponible',
          plazasDisponibles: centro.plazasDisponibles || 0,
          plazasTotal: centro.plazasTotal || 0,
          codigo: centro.codigo || id
        };
      }).filter(Boolean);
      
      // Crear una copia de la solicitud con los centros procesados
      solicitud = {
        ...solicitud,
        centros: centrosProcesados,
        centrosIdsSinDuplicados,
        incompleta: false // Marcar como completa ahora que hemos procesado los centros
      };
      
      console.log("Modal Asignación: Solicitud procesada con centros:", solicitud);
    }
    
    setSolicitudAsignar(solicitud);
    setCentroSeleccionado(null);
  }, [centrosMap]);

  // Función para asignar centro a la solicitud
  const handleAsignar = async () => {
    if (!solicitudAsignar || !centroSeleccionado) {
      console.error('Datos faltantes:', { solicitudAsignar, centroSeleccionado });
      return;
    }

    setProcesando(true);
    try {
      console.log('Iniciando asignación:', {
        solicitudId: solicitudAsignar.id,
        centroId: centroSeleccionado.docId || centroSeleccionado.id,
        centroNombre: centroSeleccionado.nombre,
        plazasDisponibles: centroSeleccionado.plazasDisponibles,
        plazasTotal: centroSeleccionado.plazasTotal,
        plazasOcupadas: centroSeleccionado.plazasAsignadas
      });

      // Verificar si el centro tiene plazas disponibles
      const plazasDisponibles = centroSeleccionado.plazasDisponibles || 
                               (centroSeleccionado.plazasTotal - (centroSeleccionado.plazasAsignadas || 0));

      if (plazasDisponibles <= 0) {
        const confirmar = window.confirm(
          `El centro ${centroSeleccionado.nombre} no tiene plazas disponibles. ¿Desea forzar la asignación?`
        );
        if (!confirmar) {
          mostrarNotificacion('Asignación cancelada', 'info');
          setProcesando(false);
          return;
        }
      }

      // Crear una nueva asignación
      const nuevaAsignacion = {
        centerId: centroSeleccionado.docId,
        centro: centroSeleccionado.nombre,
        id: centroSeleccionado.docId,
        localidad: centroSeleccionado.localidad,
        municipio: centroSeleccionado.municipio,
        order: solicitudAsignar.orden || solicitudAsignar.numeroOrden,
        timestamp: Date.now(),
        plazasDisponibles: (centroSeleccionado.plazasDisponibles || 0) - 1,
        plazasTotal: centroSeleccionado.plazasTotal || 0,
        plazasOcupadas: (centroSeleccionado.plazasAsignadas || 0) + 1,
        nombre: centroSeleccionado.nombre,
        codigo: centroSeleccionado.codigo,
        departamento: centroSeleccionado.departamento,
        nombreCentro: centroSeleccionado.nombre
      };

      console.log('Creando asignación:', nuevaAsignacion);

      // Crear la asignación en la colección asignaciones
      const asignacionRef = doc(collection(db, 'asignaciones'));
      await setDoc(asignacionRef, nuevaAsignacion);

      // Crear la solicitud en la colección solicitudesAsignadas
      const solicitudAsignadaRef = doc(collection(db, 'solicitudesAsignadas'));
      const solicitudAsignadaData = {
        id: solicitudAsignar.id || '',
        docId: solicitudAsignar.docId || solicitudAsignar.id || '',
        orden: solicitudAsignar.orden || solicitudAsignar.numeroOrden || '',
        centrosIds: solicitudAsignar.centrosIds || [],
        timestamp: solicitudAsignar.timestamp || new Date(),
        estado: 'asignada',
        asignacion: nuevaAsignacion,
        fechaAsignacion: new Date(),
        incompleta: false,
        dni: solicitudAsignar.dni || '',
        nombre: solicitudAsignar.nombre || '',
        apellidos: solicitudAsignar.apellidos || '',
        email: solicitudAsignar.email || '',
        telefono: solicitudAsignar.telefono || '',
        fecha: solicitudAsignar.fecha || new Date()
      };

      console.log('Creando solicitud asignada:', solicitudAsignadaData);
      await setDoc(solicitudAsignadaRef, solicitudAsignadaData);

      // Eliminar la solicitud de la colección solicitudesPendientes
      const solicitudPendienteRef = doc(db, 'solicitudesPendientes', solicitudAsignar.id);
      await deleteDoc(solicitudPendienteRef);

      // Actualizar el centro
      const centroRef = doc(db, 'centros', centroSeleccionado.docId);
      const centroActual = {
        plazasDisponibles: (centroSeleccionado.plazasDisponibles || 0) - 1,
        plazasAsignadas: (centroSeleccionado.plazasAsignadas || 0) + 1
      };
      
      console.log('Actualizando centro:', {
        id: centroSeleccionado.docId,
        nombre: centroSeleccionado.nombre,
        ...centroActual
      });
      
      await updateDoc(centroRef, centroActual);

      // Mostrar notificación de éxito
      mostrarNotificacion(
        `Solicitud ${solicitudAsignar.orden || solicitudAsignar.numeroOrden} asignada a ${centroSeleccionado.nombre}`,
        'success'
      );
      
      // Cerrar el modal
      setSolicitudAsignar(null);
      setCentroSeleccionado(null);
      
      // Recargar los datos
      await cargarDatosConReintentos();
    } catch (error) {
      console.error('Error detallado al asignar:', {
        error,
        solicitud: solicitudAsignar,
        centro: centroSeleccionado
      });
      mostrarNotificacion(
        `Error al asignar la solicitud: ${error.message || 'Error desconocido'}`,
        'error'
      );
    } finally {
      setProcesando(false);
    }
  };

  // Función para eliminar una solicitud pendiente
  const handleEliminarSolicitud = useCallback(async (solicitud) => {
    if (!mountedRef.current || !solicitud) return;

    setProcesando(true);
    try {
      // Intentar encontrar un ID válido para la solicitud
      const docId = solicitud.docId || solicitud.id;
      
      if (!docId) {
        console.error('Solicitud sin ID para eliminar:', solicitud);
        mostrarNotificacion('No se puede eliminar la solicitud: ID no disponible', 'error');
        setProcesando(false);
        return;
      }

      console.log(`Intentando eliminar solicitud con ID: ${docId}`, solicitud);

      // Eliminar la solicitud de Firestore
      const solicitudRef = doc(db, "solicitudesPendientes", docId);
      await deleteDoc(solicitudRef);
      
      // Registrar en historial
      const historialRef = doc(collection(db, "historialSolicitudes"));
      await setDoc(historialRef, {
        orden: solicitud.orden || solicitud.numeroOrden,
        estado: "ELIMINADA_MANUALMENTE",
        mensaje: "Solicitud eliminada manualmente por el administrador",
        fechaHistorico: new Date().toISOString(),
        timestamp: Date.now()
      });
      
      // Si la solicitud tiene una asignación, eliminar también la asignación
      if (solicitud.asignacion) {
        try {
          const asignacionRef = doc(db, "asignaciones", solicitud.asignacion.id);
          await deleteDoc(asignacionRef);
          
          // Registrar la eliminación de la asignación en elementosBorrados
          const elementosBorradosRef = doc(collection(db, "elementosBorrados"));
          await setDoc(elementosBorradosRef, {
            id: solicitud.asignacion.id,
            tipo: "asignacion",
            fechaBorrado: new Date().toISOString(),
            timestamp: Date.now()
          });
        } catch (error) {
          console.error('Error al eliminar asignación:', error);
          // Continuar con el proceso aunque falle la eliminación de la asignación
        }
      }
      
      mostrarNotificacion(`Solicitud #${solicitud.orden || solicitud.numeroOrden} eliminada correctamente`, 'success');
      
      // Recargar datos
      await cargarDatosConReintentos();
      
      // Cerrar modal de confirmación
      setConfirmEliminar(null);
    } catch (error) {
      console.error('Error al eliminar la solicitud:', error);
      mostrarNotificacion(`Error al eliminar la solicitud: ${error.message || 'Error desconocido'}`, 'error');
      setError(error);
    } finally {
      if (mountedRef.current) {
        setProcesando(false);
      }
    }
  }, [db, mostrarNotificacion, cargarDatosConReintentos]);

  // Función para manejar la reasignación
  const handleReasignar = useCallback(async () => {
    if (!solicitudReasignar || !centroSeleccionado) {
      mostrarNotificacion('Por favor, seleccione un centro para reasignar', 'error', 'Error: Centro no seleccionado');
      return;
    }

    // Verificar si es una solicitud incompleta pero con centrosIds
    let solicitudProcesada = solicitudReasignar;
    if (solicitudReasignar.incompleta && solicitudReasignar.centrosIds && solicitudReasignar.centrosIds.length > 0) {
      console.log("Reasignación: Solicitud incompleta con centrosIds:", solicitudReasignar);
      
      // En este caso solo recuperamos el ID de la solicitud, ya que el centro a utilizar es el seleccionado manualmente
      solicitudProcesada = {
        ...solicitudReasignar,
        incompleta: false // Marcamos como completa para procesar
      };
      
      mostrarNotificacion('Reasignando solicitud recuperada', 'info');
    }

    setProcesando(true);
    try {
      if (onProcesarSolicitud) {
        // Verificar que el centro tenga plazas disponibles
        if (centroSeleccionado.plazasDisponibles <= 0) {
          // Preguntar si se quiere forzar la asignación a pesar de no tener plazas disponibles
          if (window.confirm(`El centro ${centroSeleccionado.nombre} no tiene plazas disponibles. ¿Desea forzar la asignación de todas formas?`)) {
            console.log("Forzando reasignación aunque no hay plazas disponibles");
            // Continuar con la asignación forzada
          } else {
            mostrarNotificacion(`Reasignación cancelada para centro sin plazas disponibles`, 'info');
            setProcesando(false);
            return;
          }
        }

        // Crear una nueva asignación
        const nuevaAsignacion = {
          centerId: centroSeleccionado.docId,
          centro: centroSeleccionado.nombre,
          id: centroSeleccionado.docId,
          localidad: centroSeleccionado.localidad,
          municipio: centroSeleccionado.municipio,
          order: solicitudReasignar.orden || solicitudReasignar.numeroOrden,
          timestamp: Date.now(),
          plazasDisponibles: (centroSeleccionado.plazasDisponibles || 0) - 1,
          plazasTotal: centroSeleccionado.plazasTotal || 0,
          plazasOcupadas: (centroSeleccionado.plazasAsignadas || 0) + 1,
          nombre: centroSeleccionado.nombre,
          codigo: centroSeleccionado.codigo,
          departamento: centroSeleccionado.departamento,
          nombreCentro: centroSeleccionado.nombre
        };

        // Crear la asignación en la colección asignaciones
        const asignacionRef = doc(collection(db, 'asignaciones'));
        await setDoc(asignacionRef, nuevaAsignacion);

        // Actualizar el centro
        const centroRef = doc(db, 'centros', centroSeleccionado.docId);
        const centroActual = {
          plazasDisponibles: (centroSeleccionado.plazasDisponibles || 0) - 1,
          plazasAsignadas: (centroSeleccionado.plazasAsignadas || 0) + 1
        };
        
        console.log('Actualizando centro:', {
          id: centroSeleccionado.docId,
          nombre: centroSeleccionado.nombre,
          ...centroActual
        });
        
        await updateDoc(centroRef, centroActual);

        // Procesar la solicitud
        await onProcesarSolicitud({
          ...solicitudProcesada,
          centros: [centroSeleccionado],
          reasignado: true,
          forzarAsignacion: centroSeleccionado.plazasDisponibles <= 0 // Indicar si es forzada
        });

        mostrarNotificacion(
          'Solicitud reasignada correctamente',
          'success',
          `Solicitud ${solicitudReasignar.orden || solicitudReasignar.numeroOrden} reasignada a ${centroSeleccionado.nombre}`
        );
        setSolicitudReasignar(null);
        setCentroSeleccionado(null);
        await cargarDatosConReintentos();
      }
    } catch (error) {
      console.error('Error al reasignar:', error);
      mostrarNotificacion(
        `Error al reasignar: ${error.message || 'Error desconocido'}`,
        'error',
        'Error en reasignación de solicitud'
      );
    } finally {
      if (mountedRef.current) {
        setProcesando(false);
      }
    }
  }, [solicitudReasignar, centroSeleccionado, onProcesarSolicitud, mostrarNotificacion, cargarDatosConReintentos, db]);

  // Función mejorada para buscar un centro por código
  const buscarCentro = useCallback((codigoCentro) => {
    if (!codigoCentro) return null;
    
    // Depurar el código del centro para asegurar su formato correcto
    const codigo = typeof codigoCentro === 'string' ? codigoCentro.trim() : codigoCentro;
    
    // Intentar encontrar el centro en el mapa usando diferentes claves
    let centro = centrosMap.get(codigo);
    
    // Si no se encuentra, intentar una búsqueda más exhaustiva
    if (!centro && availablePlazas && availablePlazas.length > 0) {
      centro = availablePlazas.find(c => 
        c.id === codigo || 
        c.docId === codigo || 
        (c.codigo && c.codigo === codigo)
      );
      
      if (centro) {
        console.log(`Centro encontrado en búsqueda secundaria: ID=${centro.id}, Nombre=${centro.nombre || centro.nombreCentro || 'No disponible'}`);
      }
    }
    
    // Si aún no se encuentra, crear un centro temporal con la información disponible
    if (!centro) {
      console.log(`Centro no encontrado para código: ${codigo}. Creando centro temporal.`);
      centro = { 
        id: codigo, 
        nombre: `Centro con código ${codigo}`,
        temporal: true 
      };
    }
    
    return centro;
  }, [centrosMap, availablePlazas]);

  // Variable para rastrear si ya estamos buscando ciertos códigos
  const codigosEnBusqueda = useRef(new Set());
  
  // Función para buscar centros no encontrados en la base de datos
  const buscarCentrosNoEncontrados = useCallback(async () => {
    // Obtener códigos de centros no encontrados
    const centrosNoEncontrados = [];
    
    // Buscar en las solicitudes procesadas
    solicitudesProcesadas.forEach(solicitud => {
      if (solicitud.centros) {
        solicitud.centros.forEach(centro => {
          if (centro.nombre && centro.nombre.startsWith('Centro con código ') && !codigosEnBusqueda.current.has(centro.codigo)) {
            centrosNoEncontrados.push(centro.codigo);
            codigosEnBusqueda.current.add(centro.codigo);
          }
        });
      }
    });
    
    if (centrosNoEncontrados.length === 0) return;
    console.log(`Buscando ${centrosNoEncontrados.length} centros no encontrados en la base de datos:`, centrosNoEncontrados);
    
    // Buscar cada centro en la base de datos
    for (const codigo of centrosNoEncontrados) {
      const centro = await buscarCentro(codigo);
      if (centro) {
        // Agregar el centro al mapa
        console.log(`Actualizando mapa con centro encontrado código ${codigo}:`, centro);
        centrosMap.set(centro.id, centro);
        if (centro.docId && centro.docId !== centro.id) {
          centrosMap.set(centro.docId, centro);
        }
        if (centro.codigo) {
          centrosMap.set(centro.codigo, centro);
        }
      }
    }
    
    // Si encontramos centros, recargar los datos
    if (cargarDatosConReintentos) {
      await cargarDatosConReintentos();
    }
  }, [solicitudesProcesadas, buscarCentro, cargarDatosConReintentos]);
  
  // Efecto para buscar centros no encontrados
  useEffect(() => {
    if (db && solicitudesProcesadas.length > 0) {
      buscarCentrosNoEncontrados();
    }
  }, [db, solicitudesProcesadas, buscarCentrosNoEncontrados]);

  // Mostrar mensaje de carga
  if (isLoading || procesando) {
    return (
      <div style={{ padding: '20px' }}>
      <div style={{ 
          padding: '20px', 
        backgroundColor: '#f5f7fa',
        borderRadius: '8px',
          marginBottom: '20px',
          textAlign: 'center'
      }}>
        <div style={{ fontSize: '36px', marginBottom: '15px' }}>⏳</div>
        <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
          {procesando ? 'Procesando solicitud...' : 'Cargando solicitudes...'}
          </div>
        </div>
        
        {/* Tabla vacía para mantener la estructura */}
        <div style={{ 
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
            Solicitudes pendientes: 0
          </div>
          <button
            onClick={cargarDatosConReintentos}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            disabled={true}
          >
            Actualizar
          </button>
        </div>
        
        {/* Tabla de solicitudes */}
        <div style={{ 
          border: '1px solid #ddd', 
          borderRadius: '5px', 
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ padding: '10px' }}>Orden</th>
                <th style={{ padding: '10px' }}>Centros</th>
                <th style={{ padding: '10px' }}>Fecha</th>
                <th style={{ padding: '10px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                  Cargando datos...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Si no hay solicitudes, mostrar tabla vacía
  if (solicitudesProcesadas.length === 0) {
    return (
      <div style={{ padding: '20px' }}>
      <div style={{ 
          padding: '20px', 
        backgroundColor: '#f5f7fa',
        borderRadius: '8px',
          marginBottom: '20px',
          textAlign: 'center'
      }}>
        <div style={{ fontSize: '36px', marginBottom: '15px' }}>📭</div>
        <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
          No hay solicitudes pendientes
        </div>
        </div>
        
        <div style={{ 
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
            Solicitudes pendientes: 0
        </div>
        <button
          onClick={cargarDatosConReintentos}
          style={{
            padding: '8px 16px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
              cursor: 'pointer'
          }}
        >
          Actualizar
        </button>
        </div>
        
        {/* Filtros */}
        <div style={{ 
          display: 'flex', 
          gap: '10px', 
          marginBottom: '20px',
          alignItems: 'center'
        }}>
          <input
            type="text"
            placeholder="Buscar por orden o centro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              flex: 1
            }}
            disabled={true}
          />
        </div>
        
        {/* Tabla de solicitudes */}
        <div style={{ 
          border: '1px solid #ddd', 
          borderRadius: '5px', 
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ padding: '10px' }}>Orden</th>
                <th style={{ padding: '10px' }}>Centros</th>
                <th style={{ padding: '10px' }}>Fecha</th>
                <th style={{ padding: '10px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                  No hay solicitudes pendientes
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* Notificación de error */}
      {error && (
        <div style={{
          padding: '10px',
          marginBottom: '20px',
          borderRadius: '4px',
          backgroundColor: '#ffebee',
          color: '#c62828',
          border: '1px solid #ef9a9a'
        }}>
          {error}
          <button
            onClick={cargarDatosConReintentos}
            style={{
              marginLeft: '10px',
              padding: '5px 10px',
              backgroundColor: '#c62828',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Notificación */}
      {notificacion.mensaje && (
        <div style={{
          padding: '10px',
          marginBottom: '20px',
          borderRadius: '4px',
          backgroundColor: notificacion.tipo === 'error' ? '#ffebee' : 
                          notificacion.tipo === 'success' ? '#e8f5e9' : '#e3f2fd',
          color: notificacion.tipo === 'error' ? '#c62828' : 
                 notificacion.tipo === 'success' ? '#2e7d32' : '#1565c0',
          border: `1px solid ${notificacion.tipo === 'error' ? '#ef9a9a' : 
                    notificacion.tipo === 'success' ? '#a5d6a7' : '#90caf9'}`
        }}>
          <div>{notificacion.mensaje}</div>
          <div style={{ marginTop: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Mensaje para Dashboard:</label>
            <input
              type="text"
              value={dashboardMessage}
              onChange={(e) => setDashboardMessage(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ddd'
              }}
            />
          </div>
        </div>
      )}

      {/* Modal de Reasignación */}
      {solicitudReasignar && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            width: '80%',
            maxWidth: '500px'
          }}>
            <h3 style={{ marginTop: 0 }}>Reasignar Solicitud</h3>
            <div style={{ marginBottom: '15px' }}>
              <strong>Solicitud:</strong> {solicitudReasignar.orden || solicitudReasignar.numeroOrden}
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Seleccionar Centro:</label>
              <select
                value={centroSeleccionado?.id || ''}
                onChange={(e) => {
                  const centro = availablePlazas.find(c => c.id === e.target.value);
                  setCentroSeleccionado(centro);
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd'
                }}
              >
                <option value="">Seleccione un centro</option>
                {availablePlazas
                  .filter(centro => centro.plazasDisponibles > 0)
                  .map(centro => (
                    <option key={`reasignar-${centro.id}-${centro.tempId || generateUniqueId()}`} value={centro.id}>
                      {centro.nombre} - {centro.localidad} ({centro.plazasDisponibles} plazas disponibles)
                    </option>
                  ))}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => {
                  setSolicitudReasignar(null);
                  setCentroSeleccionado(null);
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleReasignar}
                disabled={!centroSeleccionado || procesando}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: !centroSeleccionado || procesando ? 'not-allowed' : 'pointer',
                  opacity: !centroSeleccionado || procesando ? 0.7 : 1,
                  fontSize: '14px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
              >
                {procesando ? 'Reasignando...' : 'Reasignar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación para eliminar */}
      {confirmEliminar && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            width: '80%',
            maxWidth: '500px'
          }}>
            <h3 style={{ marginTop: 0, color: '#d32f2f' }}>Confirmar eliminación</h3>
            <div style={{ marginBottom: '15px' }}>
              <p>¿Estás seguro de que deseas eliminar la solicitud #{confirmEliminar.solicitud.orden || confirmEliminar.solicitud.numeroOrden}?</p>
              <p style={{ fontWeight: 'bold' }}>Esta acción no se puede deshacer.</p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setConfirmEliminar(null)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#9e9e9e',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleEliminarSolicitud(confirmEliminar.solicitud)}
                disabled={procesando}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#d32f2f',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: procesando ? 'not-allowed' : 'pointer',
                  opacity: procesando ? 0.7 : 1
                }}
              >
                {procesando ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Asignación */}
      {solicitudAsignar && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            width: '90%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h3 style={{ marginTop: 0 }}>Asignar Solicitud</h3>
            <div style={{ marginBottom: '15px' }}>
              <strong>Solicitud:</strong> {solicitudAsignar.orden || solicitudAsignar.numeroOrden}
            </div>

            {/* Sección para mostrar los centros seleccionados en la solicitud */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
                Centros seleccionados por el usuario ({solicitudAsignar.centros?.length || 0})
              </h4>
              <div style={{ 
                maxHeight: '300px', 
                overflowY: 'auto', 
                border: '1px solid #eee', 
                borderRadius: '5px',
                padding: '10px'
              }}>
                {solicitudAsignar.centros && solicitudAsignar.centros.length > 0 ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                    {solicitudAsignar.centros.map((centro, idx) => (
                      <div 
                        key={`centro-solicitud-${centro.tempId || idx}`} 
                        style={{ 
                          padding: '10px', 
                          borderRadius: '5px', 
                          border: '1px solid #e0e0e0',
                          backgroundColor: centroSeleccionado?.id === centro.id ? '#e3f2fd' : '#f9f9f9',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s'
                        }}
                        onClick={() => setCentroSeleccionado(centro)}
                      >
                        {centro.ocurrencias > 1 && (
                          <div style={{
                            position: 'absolute',
                            top: '-8px',
                            right: '-8px',
                            backgroundColor: '#ff9800',
                            color: 'white',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                          }}>
                            x{centro.ocurrencias}
                          </div>
                        )}
                        <div style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                          {centro.nombre || `Centro con código ${centro.id || idx}`}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          <span style={{ fontWeight: 'bold' }}>Código:</span> {centro.codigo || 'N/A'}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          <span style={{ fontWeight: 'bold' }}>Localidad:</span> {centro.localidad || 'N/A'}
                        </div>
                        <div style={{ 
                          fontSize: '12px',
                          color: centro.plazasDisponibles > 0 ? '#27ae60' : '#e74c3c', 
                          fontWeight: 'bold',
                          marginTop: '3px'
                        }}>
                          Plazas: {centro.plazasDisponibles} / {centro.plazasTotal}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ 
                    padding: '15px', 
                    textAlign: 'center', 
                    color: '#856404',
                    backgroundColor: '#fff3cd',
                    borderRadius: '5px'
                  }}>
                    No hay centros seleccionados en esta solicitud
                  </div>
                )}
              </div>
            </div>

            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: '10px', 
              marginTop: '20px',
              padding: '10px',
              borderTop: '1px solid #eee'
            }}>
              <button
                onClick={() => {
                  setSolicitudAsignar(null);
                  setCentroSeleccionado(null);
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAsignar}
                disabled={!centroSeleccionado || procesando}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: !centroSeleccionado || procesando ? 'not-allowed' : 'pointer',
                  opacity: !centroSeleccionado || procesando ? 0.7 : 1,
                  fontSize: '14px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}
              >
                {procesando ? 'Asignando...' : 'Asignar Manualmente'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ 
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
          Solicitudes pendientes: {solicitudesProcesadas.length}
        </div>
        <button
          onClick={cargarDatosConReintentos}
          style={{
            padding: '8px 16px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '20px',
        alignItems: 'center'
      }}>
        <input
          type="text"
          placeholder="Buscar por orden o centro..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            flex: 1
          }}
        />
      </div>

      {/* Tabla de solicitudes */}
      <div style={{ 
        border: '1px solid #ddd', 
        borderRadius: '5px', 
        overflow: 'hidden',
        maxHeight: '500px',
        overflowY: 'auto'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '10px' }}>Orden</th>
              <th style={{ padding: '10px' }}>Centros</th>
              <th style={{ padding: '10px' }}>Fecha</th>
              <th style={{ padding: '10px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((solicitud, index) => {
              // Usar el ID temporal único de la solicitud
              const solicitudKey = `solicitud-${solicitud.tempId}`;
              
              return (
                <tr 
                  key={solicitudKey} 
                  style={{ 
                    borderBottom: '1px solid #eee',
                    backgroundColor: solicitud.incompleta ? '#fff3cd' : ''
                  }}
                >
                <td style={{ padding: '10px' }}>
                    {solicitud.orden || solicitud.numeroOrden}
                    {solicitud.incompleta && (
                      <div style={{ 
                        color: '#856404', 
                        fontSize: '12px', 
                        marginTop: '3px',
                        fontWeight: 'bold',
                        backgroundColor: '#fff3cd',
                        padding: '2px 5px',
                        borderRadius: '3px',
                        display: 'inline-block'
                      }}>
                        Incompleta
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px' }}>
                    {solicitud.centros?.length > 0 ? (
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                        gap: '10px',
                        maxHeight: '400px',
                        overflowY: 'auto'
                      }}>
                        {solicitud.centros.map((centro, idx) => {
                          // Usar el ID temporal único del centro
                          const centroKey = `centro-${centro.tempId}`;
                          
                          return (
                            <div key={centroKey} style={{ 
                              padding: '8px', 
                              borderRadius: '5px', 
                              border: '1px solid #e0e0e0',
                              backgroundColor: '#f9f9f9',
                              position: 'relative'
                            }}>
                              {centro.ocurrencias > 1 && (
                                <div style={{
                                  position: 'absolute',
                                  top: '-8px',
                                  right: '-8px',
                                  backgroundColor: '#ff9800',
                                  color: 'white',
                                  borderRadius: '50%',
                                  width: '24px',
                                  height: '24px',
                                  display: 'flex',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                  fontSize: '12px',
                                  fontWeight: 'bold',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}>
                                  x{centro.ocurrencias}
                                </div>
                              )}
                              <div style={{ fontWeight: 'bold', color: '#2c3e50' }}>
                                {centro.nombre || `Centro con código ${centro.id || idx}`}
                              </div>
                              <div style={{ color: '#666', marginTop: '2px' }}>
                                <span style={{ fontWeight: 'bold' }}>Localidad:</span> {centro.localidad || centro.municipio || 'No disponible'}
                              </div>
                              <div style={{ color: '#666', marginTop: '2px' }}>
                                <span style={{ fontWeight: 'bold' }}>Municipio:</span> {centro.municipio || centro.localidad || 'No disponible'} 
                              </div>
                              <div style={{ color: '#666', marginTop: '2px' }}>
                                <span style={{ fontWeight: 'bold' }}>Código:</span> {centro.codigo || 'Sin código'}
                              </div>
                              <div style={{ 
                                color: centro.plazasDisponibles > 0 ? '#27ae60' : '#e74c3c', 
                                fontWeight: 'bold',
                                marginTop: '3px'
                              }}>
                        Plazas: {centro.plazasDisponibles} / {centro.plazasTotal}
                      </div>
                    </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ 
                        color: '#856404', 
                        fontStyle: 'italic',
                        padding: '10px',
                        backgroundColor: '#fff3cd',
                        borderRadius: '5px'
                      }}>
                        No hay centros seleccionados
                      </div>
                    )}
                </td>
                <td style={{ padding: '10px' }}>
                    {solicitud.fecha ? 
                      (new Date(solicitud.fecha).toString() === 'Invalid Date' ? 
                        'Fecha no disponible' : 
                        new Date(solicitud.fecha).toLocaleString()
                      ) : 
                      'Fecha no disponible'}
                </td>
                  <td style={{ padding: '10px', display: 'flex', gap: '5px' }}>
                    <Tooltip title="Asignar manualmente">
                      <span>
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          onClick={() => handleMostrarAsignacion(solicitud)}
                          disabled={procesando}
                        >
                          <PlayArrowIcon />
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip title="Eliminar solicitud">
                      <span>
                        <Button
                          variant="contained"
                          color="error"
                          size="small"
                          onClick={() => setConfirmEliminar({ solicitud, visible: true })}
                          disabled={procesando}
                        >
                          <DeleteIcon />
                        </Button>
                      </span>
                    </Tooltip>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          marginTop: '20px' 
        }}>
          <Pagination
            count={totalPages}
            page={currentPage}
            onChange={(event, page) => setCurrentPage(page)}
            color="primary"
          />
        </div>
      )}
    </div>
  );
};

export default RequestManager; 