import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Pagination } from '@mui/material';
import { writeBatch, doc, collection, getDocs, setDoc, increment, query, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import { procesarInfoCentro, buscarCentroFlexible } from '../../utils/centerUtils';
import { auth } from '../../utils/firebaseConfig';

const ITEMS_PER_PAGE = 10;

/**
 * Componente para gestionar las asignaciones existentes
 * @param {Object} props - Propiedades del componente
 * @param {Array} props.assignments - Lista de asignaciones
 * @param {Array} props.availablePlazas - Lista de centros disponibles
 * @param {Function} props.onReasignar - Función para reasignar una asignación
 * @param {Function} props.onEliminar - Función para eliminar una asignación
 * @param {Function} props.showNotification - Función para mostrar notificaciones
 * @param {Object} props.db - Referencia a la base de datos Firestore
 * @param {Function} props.recargarDatos - Función para recargar los datos
 * @returns {JSX.Element} Componente de gestión de asignaciones
 */
const AssignmentManager = ({
  assignments,
  availablePlazas: initialAvailablePlazas,
  onReasignar,
  onEliminar,
  showNotification,
  db,
  recargarDatos
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroEstadoDetallado, setFiltroEstadoDetallado] = useState('');
  const [estadisticas, setEstadisticas] = useState({
    total: 0,
    asignadas: 0,
    reasignadas: 0,
    pendientes: 0,
    noAsignables: 0
  });
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [historialAsignaciones, setHistorialAsignaciones] = useState([]);
  const [showReasignacionModal, setShowReasignacionModal] = useState(false);
  const [asignacionSeleccionada, setAsignacionSeleccionada] = useState(null);
  const [centroSeleccionado, setCentroSeleccionado] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [historialSolicitudes, setHistorialSolicitudes] = useState([]);
  const [busquedaCentros, setBusquedaCentros] = useState('');
  const [modoForzado, setModoForzado] = useState(false);
  const [availablePlazas, setAvailablePlazas] = useState(initialAvailablePlazas);
  const [historialReasignaciones, setHistorialReasignaciones] = useState([]);
  const [asignacionParaReasignar, setAsignacionParaReasignar] = useState(null);
  const [centroSeleccionadoReasignacion, setCentroSeleccionadoReasignacion] = useState(null);
  const [modoForzadoReasignacion, setModoForzadoReasignacion] = useState(false);
  const [searchTermCentros, setSearchTermCentros] = useState('');
  const [asignaciones, setAsignaciones] = useState(assignments);

  // Actualizar asignaciones cuando cambien las assignments
  useEffect(() => {
    setAsignaciones(assignments);
  }, [assignments]);

  // Actualizar availablePlazas cuando cambie initialAvailablePlazas
  useEffect(() => {
    setAvailablePlazas(initialAvailablePlazas);
  }, [initialAvailablePlazas]);

  // Cargar el historial de asignaciones si es necesario
  useEffect(() => {
    const cargarHistorialAsignaciones = async () => {
      try {
        setCargandoHistorial(true);
        const historialSnapshot = await getDocs(collection(db, "historialAsignaciones"));
        const historial = historialSnapshot.docs.map(doc => ({
          id: doc.id,
          docId: doc.id,
          ...doc.data(),
          esHistorial: true
        }));
        
        console.log(`Cargadas ${historial.length} asignaciones del historial`);
        setHistorialAsignaciones(historial);
      } catch (error) {
        console.error("Error al cargar historial de asignaciones:", error);
      } finally {
        setCargandoHistorial(false);
      }
    };
    
    // Cargar historial solo si tenemos la referencia a la base de datos
    if (db) {
      cargarHistorialAsignaciones();
    }
  }, [db]);

  // Registrar el total de asignaciones recibidas
  useEffect(() => {
    console.log(`AssignmentManager: Recibidas ${assignments.length} asignaciones totales`);
    console.log(`AssignmentManager: Disponibles ${historialAsignaciones.length} asignaciones históricas`);
  }, [assignments, historialAsignaciones]);

  // Procesar y filtrar asignaciones
  const asignacionesProcesadas = useMemo(() => {
    // Combinar asignaciones regulares con historial si está disponible
    const todasLasAsignaciones = [...assignments];
    if (historialAsignaciones.length > 0) {
      // Añadir asignaciones del historial que tengan REASIGNADO como estado
      const asignacionesReasignadas = historialAsignaciones.filter(
        a => a.estado === 'REASIGNADO' || a.estado === 'REASIGNADA'
      );
      todasLasAsignaciones.push(...asignacionesReasignadas);
    }
    
    // Filtrar centros disponibles (solo los que tienen plazas)
    const centrosDisponibles = availablePlazas.filter(centro => 
      centro.plazasDisponibles > 0 && centro.estado === 'ACTIVO'
    );
    
    console.log(`Procesando ${todasLasAsignaciones.length} asignaciones (incluyendo historial)`);
    console.log(`Centros disponibles: ${centrosDisponibles.length}`);
    
    // Crear un mapa para eliminar duplicados por orden
    const asignacionesPorOrden = new Map();
    
    // Registrar los estados de las asignaciones para diagnóstico
    const estadosConteo = {};
    
    // Procesar asignaciones en lotes para mejor rendimiento
    const batchSize = 1000;
    for (let i = 0; i < todasLasAsignaciones.length; i += batchSize) {
      const batch = todasLasAsignaciones.slice(i, i + batchSize);
      batch.forEach(asignacion => {
      // Normalizar el estado
      const estado = (asignacion.estado || 'SIN_ESTADO').toUpperCase();
      estadosConteo[estado] = (estadosConteo[estado] || 0) + 1;
      
      // Determinar la clave única (preferir orden numérico)
      const orden = asignacion.order || asignacion.numeroOrden || asignacion.orden;
      
      if (orden) {
        // Si ya existe esta orden y la asignación actual es una reasignación, reemplazarla
        if (estado === 'REASIGNADO' || estado === 'REASIGNADA') {
          asignacionesPorOrden.set(orden.toString(), asignacion);
        } 
        // Si no existe, agregarla
        else if (!asignacionesPorOrden.has(orden.toString())) {
          asignacionesPorOrden.set(orden.toString(), asignacion);
        }
      } else {
        // Si no tiene orden, usar id o cualquier identificador único
        const id = asignacion.id || asignacion.docId;
        if (id) {
          if (estado === 'REASIGNADO' || estado === 'REASIGNADA') {
            asignacionesPorOrden.set(`id-${id}`, asignacion);
          } else if (!asignacionesPorOrden.has(`id-${id}`)) {
            asignacionesPorOrden.set(`id-${id}`, asignacion);
          }
        }
      }
    });
    }
    
    // Convertir el mapa a un array
    const asignacionesArray = Array.from(asignacionesPorOrden.values());
    
    // Mostrar diagnóstico de estados en consola
    console.log('Estados de asignaciones:', estadosConteo);
    console.log(`Asignaciones únicas después de eliminar duplicados: ${asignacionesArray.length}`);

    // Procesar cada asignación con la información del centro
    const asignacionesProcesadas = asignacionesArray.map(asignacion => {
      // Normalizar la estructura de datos para manejar diferentes formatos
      const normalizado = {
        ...asignacion,
        id: asignacion.id || asignacion.docId,
        docId: asignacion.docId || asignacion.id,
        estado: (asignacion.estado || 'SIN_ESTADO').toUpperCase(),
        order: asignacion.order || asignacion.numeroOrden || asignacion.orden,
        numeroOrden: asignacion.numeroOrden || asignacion.order || asignacion.orden,
        centro: asignacion.centro || asignacion.centroAsignado || asignacion.nombreCentro,
        nombreCentro: asignacion.nombreCentro || asignacion.centroAsignado || asignacion.centro,
        centroId: asignacion.centroId || asignacion.id,
        centroPrevio: asignacion.centroPrevio || asignacion.centroOriginal
      };
      
      // Buscar información del centro
      const centro = buscarCentroFlexible(
        centrosDisponibles, 
        normalizado.centroId || normalizado.nombreCentro || normalizado.centro
      );
      const centroInfo = procesarInfoCentro(centro, asignacionesArray);
      
      return {
        ...normalizado,
        centroInfo,
        plazasTotal: centroInfo?.plazasTotal || asignacion.plazasTotal || 0,
        plazasDisponibles: centroInfo?.plazasDisponibles || 0,
        plazasOcupadas: centroInfo?.plazasOcupadas || 0
      };
    });
    
    // Actualizar estadísticas
    const stats = {
      total: asignacionesProcesadas.length,
      asignadas: asignacionesProcesadas.filter(a => a.estado === 'ASIGNADA').length,
      reasignadas: asignacionesProcesadas.filter(a => a.estado === 'REASIGNADA' || a.estado === 'REASIGNADO').length,
      pendientes: asignacionesProcesadas.filter(a => a.estado === 'PENDIENTE_REASIGNACION').length,
      noAsignables: asignacionesProcesadas.filter(a => a.estado === 'NO_ASIGNABLE' || a.noAsignable).length
    };
    
    setEstadisticas(stats);
    
    return asignacionesProcesadas;
  }, [assignments, availablePlazas, historialAsignaciones]);

  // Filtrar asignaciones
  const asignacionesFiltradas = useMemo(() => {
    return asignacionesProcesadas.filter(asignacion => {
      if (!asignacion) return false;

      // Filtro por término de búsqueda (ignorar mayúsculas/minúsculas)
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        (asignacion.nombreCentro && asignacion.nombreCentro.toLowerCase().includes(searchLower)) ||
        (asignacion.centro && asignacion.centro.toLowerCase().includes(searchLower)) ||
        (asignacion.order && asignacion.order.toString().includes(searchTerm)) ||
        (asignacion.numeroOrden && asignacion.numeroOrden.toString().includes(searchTerm));

      // Filtro por estado principal
      const estadoAsignacion = (asignacion.estado || '').toUpperCase();
      const filtroEstadoUpper = filtroEstado.toUpperCase();
      const filtroEstadoDetalladoUpper = filtroEstadoDetallado.toUpperCase();
      
      // Si buscamos reasignadas, incluir tanto REASIGNADA como REASIGNADO
      const matchesEstado = !filtroEstado || 
        (filtroEstadoUpper === 'REASIGNADA' && (estadoAsignacion === 'REASIGNADA' || estadoAsignacion === 'REASIGNADO')) ||
        (filtroEstadoUpper === 'REASIGNADO' && (estadoAsignacion === 'REASIGNADA' || estadoAsignacion === 'REASIGNADO')) ||
        estadoAsignacion === filtroEstadoUpper;

      // Filtro por estado detallado
      const matchesEstadoDetallado = !filtroEstadoDetallado || 
        estadoAsignacion === filtroEstadoDetalladoUpper;

      return matchesSearch && matchesEstado && matchesEstadoDetallado;
    });
  }, [asignacionesProcesadas, searchTerm, filtroEstado, filtroEstadoDetallado]);

  // Paginación
  const totalPages = Math.ceil(asignacionesFiltradas.length / ITEMS_PER_PAGE);
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const paginatedData = asignacionesFiltradas.slice(indexOfFirstItem, indexOfLastItem);

  // Función para cargar todos los datos (asignaciones y historial)
  const cargarTodosLosDatos = () => {
    recargarDatos();
    
    // También cargar el historial si tenemos acceso a la base de datos
    if (db) {
      const cargarHistorialAsignaciones = async () => {
        try {
          setCargandoHistorial(true);
          const historialSnapshot = await getDocs(collection(db, "historialAsignaciones"));
          const historial = historialSnapshot.docs.map(doc => ({
            id: doc.id,
            docId: doc.id,
            ...doc.data(),
            esHistorial: true
          }));
          
          console.log(`Recargadas ${historial.length} asignaciones del historial`);
          setHistorialAsignaciones(historial);
          showNotification && showNotification('Datos actualizados correctamente', 'success');
        } catch (error) {
          console.error("Error al cargar historial de asignaciones:", error);
          showNotification && showNotification('Error al cargar el historial', 'error');
        } finally {
          setCargandoHistorial(false);
        }
      };
      
      cargarHistorialAsignaciones();
    }
  };

  // Función para cargar el historial de solicitudes
  const cargarHistorialSolicitudes = async (orden) => {
    try {
      setCargandoHistorial(true);
      const historialSnapshot = await getDocs(collection(db, "historialSolicitudes"));
      const historial = historialSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(item => item.orden === orden)
        .sort((a, b) => new Date(b.fechaHistorico) - new Date(a.fechaHistorico));

      // Crear un mapa de centros para acceso rápido
      const centrosMap = new Map(availablePlazas.map(centro => [centro.id, centro]));

      // Obtener los centros para cada solicitud de manera más eficiente
      const historialConCentros = historial.map(solicitud => {
        const centrosIds = solicitud.centrosIds || solicitud.centrosSeleccionados || [];
        const centros = centrosIds
          .map(id => {
            const centro = centrosMap.get(id);
            if (!centro) return null;
            return {
              id: centro.id,
              nombre: centro.centro || centro.nombre || 'Centro sin nombre',
              localidad: centro.localidad || 'Localidad no disponible',
              municipio: centro.municipio || centro.localidad || 'Municipio no disponible',
              departamento: centro.departamento || 'Departamento no disponible',
              plazasDisponibles: centro.plazasDisponibles || 0,
              plazasTotal: centro.plazasTotal || 0,
              codigo: centro.codigo || '',
              area: centro.area || ''
            };
          })
          .filter(Boolean);

        return {
          ...solicitud,
          centros,
          estado: solicitud.estado || 'PENDIENTE',
          fechaHistorico: solicitud.fechaHistorico || new Date().toISOString()
        };
      });
      
      setHistorialSolicitudes(historialConCentros);
    } catch (error) {
      console.error('Error al cargar historial de solicitudes:', error);
      showNotification('Error al cargar el historial de solicitudes', 'error');
    } finally {
      setCargandoHistorial(false);
    }
  };

  // Función para manejar la reasignación
  const handleReasignar = async (asignacion) => {
    if (!asignacion) {
      showNotification && showNotification('Por favor, selecciona una asignación primero', 'error');
      return;
    }

    try {
      // Establecer la asignación seleccionada
      setAsignacionParaReasignar(asignacion);
      
      // Mostrar el modal inmediatamente
      setShowReasignacionModal(true);
      
      // Cargar el historial de solicitudes para obtener los centros seleccionados
      const solicitudesRef = collection(db, "historialSolicitudes");
      const solicitudesQuery = await getDocs(solicitudesRef);
      const solicitud = solicitudesQuery.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .find(item => item.orden === (asignacion.order || asignacion.numeroOrden));

      if (solicitud) {
        // Obtener los centros seleccionados
        const centrosIds = solicitud.centrosIds || solicitud.centrosSeleccionados || [];
        
        // Crear un mapa de centros para acceso rápido
        const centrosMap = new Map(availablePlazas.map(centro => [centro.id, centro]));
        
        // Obtener los centros completos con su información
        const centrosCompletos = centrosIds.map((centroId, index) => {
          // Buscar el centro en availablePlazas
          const centro = availablePlazas.find(c => c.id === centroId);
          
          if (!centro) {
            // Si no se encuentra el centro, buscar en la colección de centros
            const centroEncontrado = availablePlazas.find(c => c.docId === centroId);
            if (!centroEncontrado) {
          return {
                id: centroId,
                nombre: `Opción ${index + 1}`,
                centro: `Opción ${index + 1}`,
                plazasTotal: 0,
                plazas: 0,
                localidad: '',
                municipio: '',
                prioridad: index + 1,
                plazasDisponiblesActualizadas: 0,
                sinPlazas: true,
                noEncontrado: true
              };
            }
          return {
              ...centroEncontrado,
              nombre: centroEncontrado.nombre || centroEncontrado.centro,
              prioridad: index + 1,
              plazasDisponiblesActualizadas: Math.max(0, parseInt(centroEncontrado.plazasTotal || centroEncontrado.plazas || '0', 10) - parseInt(centroEncontrado.plazasOcupadas || centroEncontrado.asignadas || '0', 10)),
              sinPlazas: (Math.max(0, parseInt(centroEncontrado.plazasTotal || centroEncontrado.plazas || '0', 10) - parseInt(centroEncontrado.plazasOcupadas || centroEncontrado.asignadas || '0', 10)) <= 0)
            };
          }
          
          return {
            ...centro,
            nombre: centro.nombre || centro.centro,
            prioridad: index + 1,
            plazasDisponiblesActualizadas: Math.max(0, parseInt(centro.plazasTotal || centro.plazas || '0', 10) - parseInt(centro.plazasOcupadas || centro.asignadas || '0', 10)),
            sinPlazas: (Math.max(0, parseInt(centro.plazasTotal || centro.plazas || '0', 10) - parseInt(centro.plazasOcupadas || centro.asignadas || '0', 10)) <= 0)
          };
        });

        // Actualizar la asignación con los centros completos
        setAsignacionParaReasignar(prev => ({
          ...prev,
          centrosCompletos,
          centrosIdsOriginales: centrosIds
        }));
      }
      
      // Cargar el historial de reasignaciones
      const reasignacionesRef = collection(db, "historialReasignaciones");
      const reasignacionesQuery = await getDocs(reasignacionesRef);
      const historial = reasignacionesQuery.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(item => item.orden === (asignacion.order || asignacion.numeroOrden))
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      
      setHistorialReasignaciones(historial);
    } catch (error) {
      console.error('Error al cargar el historial de reasignaciones:', error);
      showNotification('Error al cargar el historial de reasignaciones', 'error');
    }
  };

  // Función para manejar el botón de reasignación
  const handleClickReasignar = (asignacion) => {
    if (!asignacion) return;
    
    // Verificar si la asignación es reasignable
    const esNoAsignable = asignacion.noAsignable === true || asignacion.estado === "NO_ASIGNABLE";
    
    if (esNoAsignable) {
      showNotification('Esta asignación está marcada como no asignable y no se puede reasignar', 'warning');
      return;
    }
    
    // Llamar a la función de reasignación
    handleReasignar(asignacion);
  };

  // Función para recuperar una solicitud
  const handleRecuperarSolicitud = async (orden) => {
    try {
      // Buscar la solicitud en el historial
      const historialSnapshot = await getDocs(collection(db, "historialSolicitudes"));
      const solicitud = historialSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .find(item => item.orden === orden && item.estado === "REASIGNACION_PENDIENTE");

      if (solicitud) {
        // Crear una nueva solicitud pendiente
        const nuevaSolicitud = {
          orden: orden,
          centrosIds: [solicitud.centroAnterior],
          timestamp: new Date().toISOString(),
          reasignacion: true,
          estado: "PENDIENTE_REASIGNACION"
        };

        const solicitudRef = doc(collection(db, "solicitudesPendientes"));
        await setDoc(solicitudRef, nuevaSolicitud);

        showNotification('Solicitud recuperada correctamente', 'success');
      } else {
        showNotification('No se encontró la solicitud en el historial', 'warning');
      }
    } catch (error) {
      console.error('Error al recuperar solicitud:', error);
      showNotification('Error al recuperar la solicitud', 'error');
    }
  };

  // Optimizar el filtrado de centros
  const centrosFiltrados = useMemo(() => {
    if (!busquedaCentros) return availablePlazas;
    
    const busqueda = busquedaCentros.toLowerCase();
    return availablePlazas.filter(centro => {
      const nombre = (centro.nombre || '').toLowerCase();
      const localidad = (centro.localidad || '').toLowerCase();
      const municipio = (centro.municipio || '').toLowerCase();
      
      return nombre.includes(busqueda) ||
             localidad.includes(busqueda) ||
             municipio.includes(busqueda);
    });
  }, [availablePlazas, busquedaCentros]);

  // Optimizar el manejo de eventos
  const handleClickCentro = useCallback((centro) => {
    if (centro.plazasDisponibles > 0) {
      setCentroSeleccionado(centro);
    }
  }, []);

  const handleChangeBusqueda = useCallback((e) => {
    setBusquedaCentros(e.target.value);
  }, []);

  const renderModalReasignacion = () => {
    if (!asignacionParaReasignar) return null;

    // Obtener todos los centros seleccionados por orden de prioridad original
    const centrosOriginales = asignacionParaReasignar.centrosIdsOriginales || [];
    
    // Función para buscar un centro de forma más flexible
    const buscarCentroFlexible = (id) => {
      // Validación de entrada
      if (!id || typeof id !== 'string') {
        return null;
      }
      
      // 1. Búsqueda exacta por id
      let centro = availablePlazas.find(c => c.id === id);
      if (centro) return centro;
      
      // 2. Búsqueda por docId
      centro = availablePlazas.find(c => c.docId === id);
      if (centro) return centro;
      
      // 3. Búsqueda por código
      centro = availablePlazas.find(c => c.codigo === id);
      if (centro) return centro;
      
      // 4. Búsqueda caso insensitivo (por si los IDs están en mayúsculas/minúsculas diferentes)
      centro = availablePlazas.find(c => 
        (c.id && c.id.toLowerCase() === id.toLowerCase()) || 
        (c.docId && c.docId.toLowerCase() === id.toLowerCase())
      );
      if (centro) return centro;
      
      // 5. Búsqueda por prefijo del ID (primeros caracteres)
      if (id.length > 4) {
        const idPrefix = id.substring(0, 8);
        centro = availablePlazas.find(c => 
          (c.id && c.id.startsWith(idPrefix)) || 
          (c.docId && c.docId.startsWith(idPrefix))
        );
        if (centro) return centro;
      }
      
      // 6. Como último recurso, buscar por nombre o codigo en toda la colección
      for (const centro of availablePlazas) {
        if (centro.codigo && centro.codigo === id) return centro;
        if (centro.nombre && centro.nombre === id) return centro;
        if (centro.centro && centro.centro === id) return centro;
      }
      
      // No encontrado
      return null;
    };
    
    // Usar información de centros completa si está disponible
    const centrosOriginalesData = asignacionParaReasignar.centrosCompletos && 
                                  Array.isArray(asignacionParaReasignar.centrosCompletos) && 
                                  asignacionParaReasignar.centrosCompletos.length > 0
      ? asignacionParaReasignar.centrosCompletos
      : centrosOriginales.map((centroId, index) => {
        // Intentar encontrar el centro con búsqueda flexible
        const centro = buscarCentroFlexible(centroId);
        
        // Si no se encuentra el centro, crear un objeto "placeholder"
        if (!centro) {
          return {
            id: centroId,
            nombre: `Opción ${index + 1}`,
            centro: `Opción ${index + 1}`,
            plazasTotal: 0,
            plazas: 0,
            localidad: '',
            municipio: '',
            prioridad: index + 1,
            plazasDisponiblesActualizadas: 0,
            sinPlazas: true,
            noEncontrado: true
          };
        }
        
        // Procesamiento normal para centros encontrados
        return {
          ...centro,
          nombre: centro.nombre || centro.centro,
          prioridad: index + 1,
          plazasDisponiblesActualizadas: Math.max(0, parseInt(centro.plazasTotal || centro.plazas || '0', 10) - parseInt(centro.plazasOcupadas || centro.asignadas || '0', 10)),
          sinPlazas: (Math.max(0, parseInt(centro.plazasTotal || centro.plazas || '0', 10) - parseInt(centro.plazasOcupadas || centro.asignadas || '0', 10)) <= 0)
        };
      });

    return (
      <div 
        style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 1000,
          display: 'flex', 
          justifyContent: 'center',
          alignItems: 'center'
        }}
        onClick={() => {
          setShowReasignacionModal(false);
          setAsignacionParaReasignar(null);
          setCentroSeleccionadoReasignacion(null);
          setModoForzadoReasignacion(false);
          setSearchTermCentros('');
        }}
      >
        <div 
          style={{ 
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            width: '90%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}
          onClick={e => e.stopPropagation()}
        >
          <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
            Reasignación - Orden #{asignacionParaReasignar.order || asignacionParaReasignar.numeroOrden}
          </h3>
          
          <div style={{
            backgroundColor: '#e8f4fd',
            border: '1px solid #bedcf3',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '15px',
            color: '#0d4c8c'
          }}>
            <strong>Centro actual:</strong> {asignacionParaReasignar.centro || asignacionParaReasignar.centerName || asignacionParaReasignar.nombreCentro || 'Centro desconocido'}
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ color: '#004d40', borderBottom: '2px solid #26a69a', paddingBottom: '8px', marginBottom: '12px' }}>
              Opciones seleccionadas por el usuario (en orden de prioridad): {centrosOriginalesData.length}
            </h4>
            
            {centrosOriginalesData.length > 0 ? (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: '10px',
                maxHeight: '250px',
                overflow: 'auto',
                padding: '10px',
                border: '1px solid #26a69a',
                borderRadius: '5px',
                backgroundColor: '#f5f5f5'
              }}>
                {centrosOriginalesData.map((centro, index) => {
                  return (
                    <div key={`original-${centro.id}-${index}`} style={{
                      padding: '10px',
                      borderRadius: '5px',
                      border: '1px solid #ddd',
                      backgroundColor: centro.noEncontrado 
                        ? '#fff3cd'
                        : centroSeleccionadoReasignacion === centro.id 
                          ? '#e3f2fd' 
                          : centro.sinPlazas 
                            ? '#ffebee' 
                            : 'white',
                      cursor: centro.noEncontrado 
                        ? 'not-allowed' 
                        : (centro.sinPlazas && !modoForzadoReasignacion) 
                          ? 'not-allowed' 
                          : 'pointer',
                      opacity: centro.noEncontrado 
                        ? 0.8 
                        : (centro.sinPlazas && !modoForzadoReasignacion) 
                          ? 0.7 
                          : 1,
                      position: 'relative',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      marginBottom: '8px'
                    }} onClick={() => {
                      if (!centro.noEncontrado) {
                        setCentroSeleccionadoReasignacion(centro.id);
                      }
                    }}>
                      <div style={{ 
                        position: 'absolute', 
                        top: '8px', 
                        left: '8px',
                        backgroundColor: centro.noEncontrado ? '#ffc107' : '#26a69a',
                        color: centro.noEncontrado ? '#856404' : 'white',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        fontWeight: 'bold',
                        fontSize: '14px'
                      }}>
                        {centro.prioridad}
                      </div>
                      
                      <div style={{ 
                        fontWeight: 'bold', 
                        fontSize: '16px',
                        marginLeft: '30px',
                        color: centro.noEncontrado ? '#856404' : 
                               centro.sinPlazas ? '#d32f2f' : '#1a237e'
                      }}>
                        {centro.nombre || centro.centro || `Opción ${centro.prioridad}`}
                        
                        {centro.sinPlazas && !centro.noEncontrado && (
                          <span style={{
                            backgroundColor: '#f44336',
                            color: 'white',
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            marginLeft: '8px'
                          }}>
                            Sin plazas
                          </span>
                        )}
                      </div>
                      
                      {!centro.noEncontrado ? (
                        <>
                          <div style={{ fontSize: '14px', color: '#666', marginTop: '3px', marginLeft: '30px' }}>
                            {centro.localidad && `${centro.localidad}`}
                            {centro.municipio && centro.municipio !== centro.localidad && ` - ${centro.municipio}`}
                            {!centro.localidad && !centro.municipio && "Sin información de ubicación"}
                          </div>
                          
                          <div style={{ 
                            fontSize: '14px', 
                            marginTop: '5px',
                            marginLeft: '30px',
                            color: centro.sinPlazas ? '#d32f2f' : '#388e3c',
                            fontWeight: 'bold'
                          }}>
                            Plazas: <strong>{centro.plazasDisponiblesActualizadas || 0}</strong> disponibles 
                            de {centro.plazasTotal || centro.plazas || 0}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: '13px', color: '#856404', marginTop: '5px', marginLeft: '30px' }}>
                          Este centro ya no existe en la base de datos actual
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#666', padding: '10px', textAlign: 'center', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                No se encontraron las opciones originales del usuario.
              </div>
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ color: '#0d47a1', borderBottom: '2px solid #2196f3', paddingBottom: '8px', marginBottom: '12px' }}>
              Todos los centros disponibles:
            </h4>
            
            <input
              type="text"
              placeholder="Buscar por nombre, localidad o municipio..."
              value={searchTermCentros}
              onChange={(e) => setSearchTermCentros(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                marginBottom: '12px',
                border: '1px solid #2196f3',
                borderRadius: '4px'
              }}
            />
            
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              gap: '10px',
              maxHeight: '250px',
              overflow: 'auto',
              padding: '10px',
              border: '1px solid #2196f3',
              borderRadius: '5px',
              backgroundColor: '#f5f5f5'
            }}>
              {availablePlazas
                .filter(centro => 
                  centro.id !== asignacionParaReasignar.centerId &&
                  (searchTermCentros === '' || 
                   (centro.nombre && centro.nombre.toLowerCase().includes(searchTermCentros.toLowerCase())) ||
                   (centro.centro && centro.centro.toLowerCase().includes(searchTermCentros.toLowerCase())) ||
                   (centro.localidad && centro.localidad.toLowerCase().includes(searchTermCentros.toLowerCase())) ||
                   (centro.municipio && centro.municipio.toLowerCase().includes(searchTermCentros.toLowerCase())))
                )
                .map((centro, index) => {
                  const esCentroPrioritario = centrosOriginales.includes(centro.id);
                  const prioridadIndex = centrosOriginales.findIndex(id => id === centro.id);
                  
                  const esCentroPrioritarioDocId = centro.docId && centrosOriginales.includes(centro.docId);
                  const prioridadIndexDocId = centro.docId ? centrosOriginales.findIndex(id => id === centro.docId) : -1;
                  
                  const esPrioritario = esCentroPrioritario || esCentroPrioritarioDocId;
                  const prioridad = prioridadIndex !== -1 ? prioridadIndex + 1 : 
                                    prioridadIndexDocId !== -1 ? prioridadIndexDocId + 1 : 0;
                  
                  const plazasTotal = parseInt(centro.plazasTotal || centro.plazas || '0', 10);
                  const plazasOcupadas = parseInt(centro.plazasOcupadas || centro.asignadas || '0', 10);
                  const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
                  const sinPlazas = plazasDisponibles <= 0;
                  
                  return (
                    <div key={`todos-${centro.id}-${index}`} style={{
                      padding: '10px',
                      borderRadius: '5px',
                      border: esPrioritario ? '2px solid #26a69a' : '1px solid #ddd',
                      backgroundColor: centroSeleccionadoReasignacion === centro.id 
                        ? '#e3f2fd' 
                        : sinPlazas
                          ? '#ffebee'
                          : esPrioritario
                            ? '#e0f2f1'
                            : 'white',
                      cursor: sinPlazas && !modoForzadoReasignacion ? 'not-allowed' : 'pointer',
                      opacity: sinPlazas && !modoForzadoReasignacion ? 0.7 : 1
                    }} onClick={() => {
                      setCentroSeleccionadoReasignacion(centro.id);
                    }}>
                      <div style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <div style={{ fontWeight: 'bold' }}>
                          {centro.nombre || centro.centro}
                        </div>
                        
                        {esPrioritario && (
                          <span style={{
                            backgroundColor: '#26a69a',
                            color: 'white',
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            Opción {prioridad}
                          </span>
                        )}
                        
                        {sinPlazas && (
                          <span style={{
                            backgroundColor: '#f44336',
                            color: 'white',
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            Sin plazas
                          </span>
                        )}
                      </div>
                      
                      <div style={{ fontSize: '13px', color: '#666' }}>
                        {centro.localidad && `${centro.localidad}`}
                        {centro.municipio && centro.municipio !== centro.localidad && ` - ${centro.municipio}`}
                      </div>
                      
                      <div style={{ 
                        fontSize: '13px', 
                        marginTop: '5px',
                        color: sinPlazas ? '#d32f2f' : '#388e3c',
                        fontWeight: 'bold'
                      }}>
                        Plazas: <strong>{plazasDisponibles}</strong> disponibles 
                        de {plazasTotal}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
          
          <div style={{
            backgroundColor: '#fffde7',
            border: '1px solid #ffd54f',
            borderRadius: '4px',
            padding: '10px',
            marginBottom: '15px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <input
              type="checkbox"
              id="modo-forzado"
              checked={modoForzadoReasignacion}
              onChange={() => setModoForzadoReasignacion(!modoForzadoReasignacion)}
            />
            <label htmlFor="modo-forzado" style={{ cursor: 'pointer' }}>
              <strong>Modo forzado:</strong> Permitir asignar a centros sin plazas disponibles (sobreocupación)
            </label>
          </div>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            gap: '10px',
            borderTop: '1px solid #eee',
            paddingTop: '15px'
          }}>
            <button 
              onClick={() => {
                setShowReasignacionModal(false);
                setAsignacionParaReasignar(null);
                setCentroSeleccionadoReasignacion(null);
                setModoForzadoReasignacion(false);
                setSearchTermCentros('');
              }}
              style={{
                padding: '8px 15px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button 
              onClick={marcarReasignacionNoAsignable}
              style={{
                padding: '8px 15px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: '#f44336',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              No se puede reasignar
            </button>
            <button 
              onClick={realizarReasignacion}
              disabled={!centroSeleccionadoReasignacion}
              style={{
                padding: '8px 15px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: centroSeleccionadoReasignacion ? '#ff9800' : '#cccccc',
                color: 'white',
                cursor: centroSeleccionadoReasignacion ? 'pointer' : 'not-allowed'
              }}
            >
              Reasignar
            </button>
          </div>
        </div>
      </div>
    );
  };

  const marcarReasignacionNoAsignable = async () => {
    if (!asignacionParaReasignar) return;

    try {
      // Actualizar el estado de la asignación en la base de datos
      await updateDoc(doc(db, "asignaciones", asignacionParaReasignar.id), {
        estado: "NO_ASIGNABLE",
        fechaActualizacion: serverTimestamp(),
        usuarioActualizacion: auth.currentUser?.email || "Desconocido"
      });

      // Actualizar el estado local
      setAsignaciones(prevAsignaciones => 
        prevAsignaciones.map(a => 
          a.id === asignacionParaReasignar.id 
            ? { ...a, estado: "NO_ASIGNABLE" }
            : a
        )
      );

      // Cerrar el modal
      setShowReasignacionModal(false);
      setAsignacionParaReasignar(null);
      setCentroSeleccionadoReasignacion(null);
      setModoForzadoReasignacion(false);
      setSearchTermCentros('');

      // Mostrar mensaje de éxito
      alert("La asignación ha sido marcada como no asignable.");
    } catch (error) {
      console.error("Error al marcar como no asignable:", error);
      alert("Hubo un error al marcar la asignación como no asignable.");
    }
  };

  const realizarReasignacion = async () => {
    if (!asignacionParaReasignar || !centroSeleccionadoReasignacion) return;

    try {
      // Encontrar el centro de destino
      const centroDestino = availablePlazas.find(c => c.id === centroSeleccionadoReasignacion);
      if (!centroDestino) {
        alert("No se encontró el centro de destino seleccionado.");
        return;
      }

      // Verificar si hay plazas disponibles (a menos que esté en modo forzado)
      const plazasDisponibles = parseInt(centroDestino.plazasTotal || centroDestino.plazas || '0', 10) - 
                               parseInt(centroDestino.plazasOcupadas || centroDestino.asignadas || '0', 10);
      
      if (plazasDisponibles <= 0 && !modoForzadoReasignacion) {
        alert("No hay plazas disponibles en el centro seleccionado.");
        return;
      }

      // Actualizar el centro de origen (restar una plaza)
      const centroOrigen = availablePlazas.find(c => c.id === asignacionParaReasignar.centerId);
      if (centroOrigen) {
        await updateDoc(doc(db, "centros", centroOrigen.id), {
          plazasOcupadas: increment(-1),
          asignadas: increment(-1)
        });
      }

      // Actualizar el centro de destino (sumar una plaza)
      await updateDoc(doc(db, "centros", centroDestino.id), {
        plazasOcupadas: increment(1),
        asignadas: increment(1)
      });

      // Actualizar la asignación
      await updateDoc(doc(db, "asignaciones", asignacionParaReasignar.id), {
        centerId: centroDestino.id,
        centro: centroDestino.nombre || centroDestino.centro,
        estado: "REASIGNADA",
        fechaActualizacion: serverTimestamp(),
        usuarioActualizacion: auth.currentUser?.email || "Desconocido"
      });

      // Actualizar el estado local
      setAsignaciones(prevAsignaciones => 
        prevAsignaciones.map(a => 
          a.id === asignacionParaReasignar.id 
            ? { 
                ...a, 
                centerId: centroDestino.id,
                centro: centroDestino.nombre || centroDestino.centro,
                estado: "REASIGNADA"
              }
            : a
        )
      );

      // Actualizar availablePlazas
      setAvailablePlazas(prevPlazas => 
        prevPlazas.map(p => {
          if (p.id === centroOrigen?.id) {
            return {
              ...p,
              plazasOcupadas: (parseInt(p.plazasOcupadas || '0', 10) - 1).toString(),
              asignadas: (parseInt(p.asignadas || '0', 10) - 1).toString()
            };
          }
          if (p.id === centroDestino.id) {
            return {
              ...p,
              plazasOcupadas: (parseInt(p.plazasOcupadas || '0', 10) + 1).toString(),
              asignadas: (parseInt(p.asignadas || '0', 10) + 1).toString()
            };
          }
          return p;
        })
      );

      // Cerrar el modal
      setShowReasignacionModal(false);
      setAsignacionParaReasignar(null);
      setCentroSeleccionadoReasignacion(null);
      setModoForzadoReasignacion(false);
      setSearchTermCentros('');

      // Mostrar mensaje de éxito
      alert("La reasignación se ha realizado con éxito.");
    } catch (error) {
      console.error("Error al realizar la reasignación:", error);
      alert("Hubo un error al realizar la reasignación.");
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      {/* Filtros */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '20px',
        flexWrap: 'wrap'
      }}>
        <input
          type="text"
          placeholder="Buscar asignación..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', flex: '1', minWidth: '200px' }}
        />
        
        <select
          value={filtroEstado}
          onChange={(e) => {
            setFiltroEstado(e.target.value);
            setFiltroEstadoDetallado(''); // Resetear el filtro detallado
          }}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
        >
          <option value="">Todos los estados</option>
          <option value="ASIGNADA">Asignada</option>
          <option value="REASIGNADA">Reasignada</option>
          <option value="PENDIENTE_REASIGNACION">Pendiente de reasignación</option>
          <option value="NO_ASIGNABLE">No asignable</option>
          <option value="REASIGNACION_NO_VIABLE">Reasignación no viable</option>
        </select>

        {filtroEstado && (
          <select
            value={filtroEstadoDetallado}
            onChange={(e) => setFiltroEstadoDetallado(e.target.value)}
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
          >
            <option value="">Todos los subestados</option>
            {filtroEstado === 'REASIGNADA' && (
              <>
                <option value="REASIGNADA">Reasignada</option>
                <option value="REASIGNADO">Reasignado</option>
              </>
            )}
            {filtroEstado === 'PENDIENTE_REASIGNACION' && (
              <>
                <option value="PENDIENTE_REASIGNACION">Pendiente</option>
                <option value="PENDIENTE_APROBACION">Pendiente de aprobación</option>
              </>
            )}
          </select>
        )}
      </div>

      <div style={{ 
        marginBottom: '15px', 
        padding: '10px', 
        backgroundColor: '#f9f9f9', 
        borderRadius: '5px', 
        fontSize: '14px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div>
          <span style={{ fontWeight: 'bold' }}>Total asignaciones:</span> {estadisticas.total}
        </div>
        <div>
          <span style={{ fontWeight: 'bold', color: '#2e7d32' }}>Asignadas:</span> {estadisticas.asignadas}
        </div>
        <div>
          <span style={{ fontWeight: 'bold', color: '#1b5e20' }}>Reasignadas:</span> {estadisticas.reasignadas}
        </div>
        <div>
          <span style={{ fontWeight: 'bold', color: '#0d47a1' }}>Pendientes:</span> {estadisticas.pendientes}
        </div>
        <div>
          <span style={{ fontWeight: 'bold', color: '#c62828' }}>No asignables:</span> {estadisticas.noAsignables}
        </div>
        {filtroEstado && (
          <div>
            <span style={{ fontWeight: 'bold' }}>Filtradas:</span> {asignacionesFiltradas.length}
            <span style={{ fontStyle: 'italic', marginLeft: '5px' }}>({filtroEstado})</span>
          </div>
        )}
      </div>

      {/* Botón para recargar datos */}
      <div style={{ marginBottom: '15px' }}>
        <button
          onClick={cargarTodosLosDatos}
          disabled={cargandoHistorial}
          style={{
            padding: '8px 16px',
            backgroundColor: cargandoHistorial ? '#95a5a6' : '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: cargandoHistorial ? 'not-allowed' : 'pointer'
          }}
        >
          {cargandoHistorial ? 'Actualizando...' : 'Actualizar datos'}
        </button>
      </div>

      {/* Tabla de asignaciones */}
      <div style={{ border: '1px solid #ddd', borderRadius: '5px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '10px' }}>Orden</th>
              <th style={{ padding: '10px' }}>Centro</th>
              <th style={{ padding: '10px' }}>Estado</th>
              <th style={{ padding: '10px' }}>Plazas</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((asignacion, idx) => {
              const esNoAsignable = asignacion.noAsignable === true || asignacion.estado === "NO_ASIGNABLE";
              const esReasignacionNoViable = asignacion.estado === "REASIGNACION_NO_VIABLE";
              const esReasignada = asignacion.estado === "REASIGNADA" || asignacion.estado === "REASIGNADO";
              const esPendienteReasignacion = asignacion.estado === "PENDIENTE_REASIGNACION";
              const centro = availablePlazas.find(c => c.id === asignacion.centroId);
              const plazasDisponibles = centro?.plazasDisponibles || 0;
              const plazasTotal = centro?.plazasTotal || 0;
              const plazasOcupadas = centro?.plazasOcupadas || 0;
              const porcentajeOcupacion = plazasTotal > 0 ? Math.round((plazasOcupadas / plazasTotal) * 100) : 0;
              const colorOcupacion = porcentajeOcupacion >= 100 ? '#e74c3c' : 
                                   porcentajeOcupacion >= 80 ? '#f39c12' : '#2ecc71';

              // Crear una clave única usando múltiples propiedades
              const rowKey = `asignacion-${asignacion.id || asignacion.docId || ''}-${asignacion.order || asignacion.numeroOrden || ''}-${idx}`;

              return (
                <tr key={rowKey} style={{
                  borderBottom: '1px solid #eee',
                  backgroundColor: esNoAsignable ? '#ffebee' : 
                                   esReasignacionNoViable ? '#fff8e1' :
                                   esReasignada ? '#e8f5e9' :
                                   esPendienteReasignacion ? '#e3f2fd' : ''
                }}>
                  <td style={{ padding: '10px' }}>{asignacion.order || asignacion.numeroOrden}</td>
                  <td style={{ padding: '10px' }}>
                    <div style={{ fontWeight: 'bold' }}>
                      {asignacion.nombreCentro || asignacion.centro || asignacion.centroAsignado || 'Centro sin nombre'}
                    </div>
                    {!esNoAsignable && asignacion.centroInfo?.localidad && (
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        {asignacion.centroInfo.localidad}
                        {asignacion.centroInfo.municipio && asignacion.centroInfo.municipio !== asignacion.centroInfo.localidad && 
                          ` - ${asignacion.centroInfo.municipio}`}
                      </div>
                    )}
                    {esReasignada && (asignacion.centroPrevio || asignacion.centroOriginal) && (
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#666', 
                        marginTop: '3px',
                        backgroundColor: 'rgba(0,0,0,0.05)',
                        padding: '3px 6px',
                        borderRadius: '3px'
                      }}>
                        <span style={{ fontStyle: 'italic' }}>Previamente en:</span> {asignacion.centroPrevio || asignacion.centroOriginal}
                      </div>
                    )}
                    {esPendienteReasignacion && asignacion.centroDestino && (
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#666', 
                        marginTop: '3px',
                        backgroundColor: 'rgba(0,0,0,0.05)',
                        padding: '3px 6px',
                        borderRadius: '3px'
                      }}>
                        <span style={{ fontStyle: 'italic' }}>Pendiente reasignar a:</span> {asignacion.centroDestino}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      backgroundColor: esNoAsignable ? '#ffcdd2' : 
                                     esReasignacionNoViable ? '#fff3e0' : 
                                     esReasignada ? '#c8e6c9' :
                                     esPendienteReasignacion ? '#bbdefb' :
                                     asignacion.estado === 'ASIGNADA' ? '#e8f5e9' : '#e3f2fd',
                      color: esNoAsignable ? '#c62828' : 
                             esReasignacionNoViable ? '#ef6c00' : 
                             esReasignada ? '#1b5e20' :
                             esPendienteReasignacion ? '#0d47a1' :
                             asignacion.estado === 'ASIGNADA' ? '#2e7d32' : '#1565c0',
                    }}>
                      {asignacion.estado || 'Sin estado'}
                    </span>
                    {(asignacion.fechaReasignacion || asignacion.fechaHistorico) && (
                      <div style={{ fontSize: '11px', color: '#666', marginTop: '3px' }}>
                        {new Date(asignacion.fechaReasignacion || asignacion.fechaHistorico).toLocaleDateString()}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px' }}>
                    {!esNoAsignable ? (
                      <div>
                        <div style={{ 
                          fontWeight: 'bold',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          marginBottom: '3px'
                        }}>
                          <span style={{ 
                            color: plazasDisponibles === 0 ? '#d32f2f' : '#388e3c', 
                            marginRight: '6px' 
                          }}>
                            {plazasDisponibles} disponibles
                          </span>
                          <span style={{ color: '#666' }}>
                            / {plazasTotal} totales
                          </span>
                        </div>
                        
                        <div style={{ 
                          width: '100%', 
                          height: '6px', 
                          backgroundColor: '#e0e0e0', 
                          borderRadius: '3px',
                          marginBottom: '5px'
                        }}>
                          <div style={{ 
                            width: `${porcentajeOcupacion}%`, 
                            height: '100%', 
                            backgroundColor: colorOcupacion,
                            borderRadius: '3px'
                          }}></div>
                        </div>
                        
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          {plazasOcupadas} ocupadas ({porcentajeOcupacion}%)
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: '#d32f2f', fontWeight: 'bold', fontSize: '13px' }}>
                        Sin plazas
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    {/* Botones de acción según el estado */}
                    {!esNoAsignable ? (
                      <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                        <button 
                          onClick={() => handleClickReasignar(asignacion)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#ff9800',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                          title="Reasignar esta asignación"
                        >
                          Reasignar
                        </button>
                        {/* Solo mostrar botón de eliminar para asignaciones normales */}
                        {!esReasignada && !esReasignacionNoViable && (
                          <button 
                            onClick={() => onEliminar(asignacion)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#e74c3c',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                            title="Eliminar esta asignación"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    ) : (
                      <span style={{ color: '#999', fontSize: '12px' }}>
                        No disponible
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {paginatedData.length === 0 && (
          <div style={{
            padding: '30px',
            textAlign: 'center',
            color: '#666',
            backgroundColor: '#f9f9f9'
          }}>
            No se encontraron asignaciones con los filtros seleccionados
          </div>
        )}

        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
          <Pagination
            count={totalPages}
            page={currentPage}
            onChange={(_, page) => setCurrentPage(page)}
            color="primary"
          />
        </div>
      </div>

      {/* Modal de Reasignación */}
      {showReasignacionModal && asignacionParaReasignar && (
        renderModalReasignacion()
      )}

      {historialSolicitudes.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Centros seleccionados para la orden #{historialSolicitudes[0]?.orden}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {historialSolicitudes[0]?.centros?.map((centro, index) => (
              <div key={`${centro.id}-${index}`} className="bg-white rounded-lg shadow p-4 border border-gray-200">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium text-gray-900">{centro.nombre}</h4>
                    <p className="text-sm text-gray-600">{centro.localidad}</p>
                    {centro.municipio && centro.municipio !== centro.localidad && (
                      <p className="text-sm text-gray-600">Municipio: {centro.municipio}</p>
                    )}
                    {centro.departamento && (
                      <p className="text-sm text-gray-600">Departamento: {centro.departamento}</p>
                    )}
            </div>
                  <div className="text-right">
                    <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      centro.plazasDisponibles > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {centro.plazasDisponibles} / {centro.plazasTotal} plazas
                      </div>
                        </div>
                            </div>
                            {centro.codigo && (
                  <p className="text-xs text-gray-500 mt-2">Código: {centro.codigo}</p>
                )}
                {centro.area && (
                  <p className="text-xs text-gray-500">Área: {centro.area}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
      )}

      {historialReasignaciones.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Historial de Reasignaciones</h3>
          <div className="space-y-2">
            {historialReasignaciones.map((historial, index) => (
              <div key={index} className="bg-white p-4 rounded-lg shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">Orden #{historial.orden}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(historial.fecha).toLocaleString()}
                    </p>
              </div>
                  <span className={`px-2 py-1 rounded text-sm ${
                    historial.estadoNuevo === 'REASIGNADA' ? 'bg-blue-100 text-blue-800' :
                    historial.estadoNuevo === 'CANCELADA' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {historial.estadoNuevo}
                  </span>
            </div>

                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Centro Origen</p>
                    <p className="text-sm">{historial.centroOrigen}</p>
                    </div>
                  <div>
                    <p className="text-sm font-medium text-gray-500">Centro Destino</p>
                    <p className="text-sm">{historial.centroDestino}</p>
              </div>
            </div>

                {historial.comentario && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-gray-500">Comentario</p>
                    <p className="text-sm">{historial.comentario}</p>
            </div>
                )}

                <div className="mt-2 flex justify-between items-center text-sm text-gray-500">
                  <span>Usuario: {historial.usuario}</span>
                  <span>Estado anterior: {historial.estadoAnterior}</span>
            </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AssignmentManager; 