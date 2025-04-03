import React, { useState, useMemo } from 'react';
import { writeBatch, doc, collection, serverTimestamp, onSnapshot, query, where, addDoc, updateDoc, getDocs, deleteDoc } from "firebase/firestore";
import * as XLSX from 'xlsx';

/**
 * Componente que muestra el panel de administración
 * @param {Object} props - Propiedades del componente
 * @param {Array} props.assignments - Lista de asignaciones
 * @param {Array} props.availablePlazas - Lista de centros/plazas disponibles
 * @param {Array} props.solicitudes - Lista de solicitudes pendientes
 * @param {Function} props.procesarTodasLasSolicitudes - Función para procesar todas las solicitudes
 * @param {Function} props.procesarSolicitudesPorMinuto - Función para procesar la siguiente solicitud pendiente
 * @param {Function} props.cargarDatosDesdeFirebase - Función para recargar datos desde Firebase
 * @param {Function} props.eliminarSolicitudesDuplicadas - Función para eliminar solicitudes duplicadas
 * @param {Function} props.limpiarDuplicadosHistorial - Función para limpiar duplicados del historial
 * @param {Object} props.db - Referencia a la base de datos Firestore
 * @param {boolean} props.loadingProcess - Indica si hay un proceso en curso
 * @param {string} props.processingMessage - Mensaje del proceso en curso
 * @param {Function} props.showNotification - Función para mostrar notificaciones
 * @param {Date} props.lastProcessed - Fecha del último procesamiento
 * @param {Function} props.procesarSolicitudes - Función para procesar solicitudes individualmente
 * @returns {JSX.Element} - Componente Admin
 */
const Admin = ({ 
  assignments = [], 
  availablePlazas = [], 
  solicitudes = [],
  procesarTodasLasSolicitudes,
  procesarSolicitudesPorMinuto,
  cargarDatosDesdeFirebase,
  eliminarSolicitudesDuplicadas,
  limpiarDuplicadosHistorial,
  db,
  loadingProcess,
  processingMessage,
  showNotification,
  lastProcessed,
  procesarSolicitudes
}) => {
  // Estados para el componente
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminAuthAttempted, setAdminAuthAttempted] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchTermSolicitudes, setSearchTermSolicitudes] = useState('');
  const [internalProcessingMessage, setInternalProcessingMessage] = useState("");
  const [centrosNuevos, setCentrosNuevos] = useState([]);
  const [mostrarComparacion, setMostrarComparacion] = useState(false);
  const [seleccionados, setSeleccionados] = useState({});
  const [isSincronizando, setIsSincronizando] = useState(false);
  
  // Estados para el modal de reasignación
  const [mostrarModalReasignacion, setMostrarModalReasignacion] = useState(false);
  const [asignacionActual, setAsignacionActual] = useState(null);
  const [centrosDisponibles, setCentrosDisponibles] = useState([]);
  const [centrosSeleccionadosReasignacion, setCentrosSeleccionadosReasignacion] = useState([]);
  const [searchTermReasignacion, setSearchTermReasignacion] = useState('');
  
  // Filtrar centros disponibles por término de búsqueda - Colocado antes de cualquier condición
  const centrosFiltrados = useMemo(() => {
    const termino = searchTermReasignacion?.toLowerCase()?.trim() || "";
    
    if (!termino) {
      return centrosDisponibles;
    }
    
    return centrosDisponibles.filter(centro => {
      return (
        (centro.nombre && centro.nombre.toLowerCase().includes(termino)) ||
        (centro.centro && centro.centro.toLowerCase().includes(termino)) ||
        (centro.codigo && centro.codigo.toLowerCase().includes(termino)) ||
        (centro.municipio && centro.municipio.toLowerCase().includes(termino)) ||
        (centro.localidad && centro.localidad.toLowerCase().includes(termino))
      );
    });
  }, [centrosDisponibles, searchTermReasignacion]);
  
  // Si no está autenticado, mostrar formulario de login
  if (!isAdminAuthenticated) {
    return (
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '20px',
        fontFamily: 'Arial, sans-serif',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        flexDirection: 'column'
      }}>
        <h1 style={{ marginBottom: '30px', color: '#2c3e50' }}>Panel de Administración</h1>
        
        <div style={{ 
          backgroundColor: 'white', 
          padding: '30px', 
          borderRadius: '10px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '400px'
        }}>
          <h2 style={{ textAlign: 'center', marginBottom: '25px' }}>Autenticación Requerida</h2>
          
          {adminAuthAttempted && (
            <div style={{
              backgroundColor: '#f8d7da',
              color: '#721c24',
              padding: '10px',
              borderRadius: '5px',
              marginBottom: '15px',
              textAlign: 'center'
            }}>
              Contraseña incorrecta. Inténtalo de nuevo.
            </div>
          )}
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Contraseña de Administrador:
            </label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '16px'
              }}
              placeholder="Ingrese la contraseña"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (adminPassword === 'SoyAdmin') {
                    setIsAdminAuthenticated(true);
                  } else {
                    setAdminAuthAttempted(true);
                  }
                }
              }}
            />
          </div>
          
          <button
            onClick={() => {
              if (adminPassword === 'SoyAdmin') {
                setIsAdminAuthenticated(true);
              } else {
                setAdminAuthAttempted(true);
              }
            }}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Acceder
          </button>
          
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <a 
              href="/"
              style={{
                color: '#3498db',
                textDecoration: 'none'
              }}
            >
              Volver a la página principal
            </a>
          </div>
        </div>
      </div>
    );
  }
  
  // Funciones del componente
  const handleReasignar = async (asignacion) => {
    try {
      // Validar que la asignación tenga los datos necesarios
      if (!asignacion) {
        throw new Error('La asignación no puede ser nula');
      }

      // Debug: Mostrar los datos de la asignación
      console.log('Datos de asignación recibida:', asignacion);

      // Obtener el número de orden de cualquiera de las posibles propiedades
      const numeroOrden = asignacion.numeroOrden || asignacion.order || asignacion.orden;
      if (!numeroOrden) {
        console.error('Propiedades disponibles en la asignación:', Object.keys(asignacion));
        throw new Error('No se encontró el número de orden en la asignación');
      }

      // Obtener el centro de cualquiera de las posibles propiedades
      const centro = asignacion.centro || asignacion.nombreCentro || asignacion.centerName || asignacion.centre;
      if (!centro) {
        console.error('Propiedades disponibles en la asignación:', Object.keys(asignacion));
        throw new Error('No se encontró el centro en la asignación');
      }

      // Obtener la solicitud original del historial
      const historialRef = collection(db, 'historialSolicitudes');
      const q = query(historialRef, where('numeroOrden', '==', numeroOrden));
      const historialSnapshot = await getDocs(q);
      
      let solicitudOriginal;
      if (historialSnapshot.empty) {
        // Si no se encuentra en el historial, crear una nueva solicitud basada en la asignación actual
        console.log('No se encontró la solicitud original en el historial, creando una nueva...');
        solicitudOriginal = {
          numeroOrden: numeroOrden,
          centros: [centro], // Usar el centro actual como primera opción
          estado: "PENDIENTE",
          fechaCreacion: new Date().toISOString(),
          timestamp: Date.now()
        };
      } else {
        solicitudOriginal = historialSnapshot.docs[0].data();
      }

      // Obtener todos los centros disponibles
      const centrosRef = collection(db, 'centros');
      const centrosSnapshot = await getDocs(centrosRef);
      
      // Obtener las asignaciones actuales
      const asignacionesRef = collection(db, 'asignaciones');
      const asignacionesSnapshot = await getDocs(asignacionesRef);
      
      // Crear un mapa de centros ocupados
      const centrosOcupados = new Map();
      asignacionesSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.centro && data.numeroOrden !== numeroOrden) {
          centrosOcupados.set(data.centro, true);
        }
      });

      // Preparar centros disponibles
      const centrosDisponibles = centrosSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(centro => {
          // Excluir el centro actual y los centros ocupados
          return centro.nombre !== centro && !centrosOcupados.has(centro.nombre);
        });

      // Ordenar centros según la prioridad original
      const centrosOrdenados = centrosDisponibles.sort((a, b) => {
        // Obtener la posición en la lista de prioridades original
        const posA = solicitudOriginal.centros.indexOf(a.nombre);
        const posB = solicitudOriginal.centros.indexOf(b.nombre);
        
        // Si ambos centros están en la lista original, ordenar por su posición
        if (posA !== -1 && posB !== -1) {
          return posA - posB;
        }
        // Si solo uno está en la lista, ponerlo primero
        if (posA !== -1) return -1;
        if (posB !== -1) return 1;
        // Si ninguno está en la lista, mantener el orden alfabético
        return a.nombre.localeCompare(b.nombre);
      });

      // Guardar la asignación actual y los centros disponibles
      setAsignacionActual(asignacion);
      setCentrosDisponibles(centrosOrdenados);
      setCentrosSeleccionadosReasignacion([]);
      setSearchTermReasignacion('');
      setMostrarModalReasignacion(true);
    } catch (error) {
      console.error('Error al preparar reasignación:', error);
      showNotification(`Error al preparar reasignación: ${error.message}`, "error");
    }
  };
  
  // Función para realizar la reasignación con los centros seleccionados
  const confirmarReasignacion = async () => {
    try {
      if (!asignacionActual) {
        showNotification("Error: No hay asignación seleccionada", "error");
        return;
      }
      
      if (centrosSeleccionadosReasignacion.length === 0) {
        showNotification("Por favor, seleccione al menos un centro", "warning");
        return;
      }
      
      // Mostrar mensaje de procesamiento
      setInternalProcessingMessage("Procesando reasignación...");
      
      // Usar id si docId no está disponible
      const asignacionId = asignacionActual.docId || asignacionActual.id;
      
      // Validar y extraer identificador
      if (!asignacionId) {
        console.warn("Advertencia: La asignación no tiene identificador válido:", asignacionActual);
        showNotification("Error: La asignación no tiene un identificador válido", "error");
        setInternalProcessingMessage("");
        return;
      }
      
      // Asegurar que hay un número de orden válido
      if (!asignacionActual.order && !asignacionActual.numeroOrden) {
        showNotification("Error: No se pudo obtener el número de orden", "error");
        setInternalProcessingMessage("");
        return;
      }
      
      const ordenAsignacion = asignacionActual.numeroOrden || asignacionActual.order;
      
      // Crear una solicitud pendiente con los centros seleccionados por el usuario
      const nuevaSolicitud = {
        orden: ordenAsignacion,
        centrosIds: centrosSeleccionadosReasignacion,
        timestamp: serverTimestamp()
      };
      
      console.log("Nueva solicitud a crear:", nuevaSolicitud);
      
      // Usar writeBatch para la transacción
      const batch = writeBatch(db);
      
      // Añadir la nueva solicitud pendiente
      const solicitudRef = doc(collection(db, "solicitudesPendientes"));
      batch.set(solicitudRef, nuevaSolicitud);
      
      // Eliminar la asignación existente
      const asignacionRef = doc(db, "asignaciones", asignacionId);
      batch.delete(asignacionRef);
      
      // Crear registro de historial
      const ahora = new Date();
      const historialData = {
        orden: ordenAsignacion,
        estado: "REASIGNANDO",
        mensaje: "Reasignación manual desde el panel de administración",
        fechaHistorico: ahora.toISOString(),
        timestamp: ahora.getTime()
      };
      
      // Agregar centroAnterior solo si hay un centerId o centro válido
      if (asignacionActual.centerId) {
        historialData.centroAnterior = asignacionActual.centerId;
      } else if (asignacionActual.centro && typeof asignacionActual.centro === 'string') {
        historialData.centroAnterior = asignacionActual.centro;
      }
      
      console.log("Datos de historial a crear:", historialData);
      
      // Añadir al historial
      const historialRef = doc(collection(db, "historialSolicitudes"));
      batch.set(historialRef, historialData);
      
      // Ejecutar todos los cambios
      await batch.commit();
      
      // Cerrar el modal
      setMostrarModalReasignacion(false);
      setAsignacionActual(null);
      
      // Limpiar mensaje de procesamiento
      setInternalProcessingMessage("");
      
      // Recargar datos
      await cargarDatosDesdeFirebase();
      showNotification(`Asignación para orden ${ordenAsignacion} movida a solicitudes pendientes con nuevos centros`, "success");
    } catch (error) {
      console.error("Error al reasignar:", error);
      setInternalProcessingMessage("");
      showNotification(`Error al reasignar: ${error.message}`, "error");
    }
  };
  
  // Función para manejar la selección/deselección de un centro en el modal
  const toggleSeleccionCentro = (centroId) => {
    setCentrosSeleccionadosReasignacion(prevSelected => {
      // Si ya está seleccionado, lo quitamos
      if (prevSelected.includes(centroId)) {
        return prevSelected.filter(id => id !== centroId);
      }
      
      // Si no está seleccionado, lo añadimos al final
      return [...prevSelected, centroId];
    });
  };
  
  // Función para mover un centro hacia arriba en la lista de preferencias
  const moverCentroArriba = (index) => {
    if (index <= 0) return; // Ya está en la primera posición
    
    setCentrosSeleccionadosReasignacion(prevSelected => {
      const newOrder = [...prevSelected];
      // Intercambiar posiciones
      [newOrder[index], newOrder[index - 1]] = [newOrder[index - 1], newOrder[index]];
      return newOrder;
    });
  };
  
  // Función para mover un centro hacia abajo en la lista de preferencias
  const moverCentroAbajo = (index) => {
    setCentrosSeleccionadosReasignacion(prevSelected => {
      if (index >= prevSelected.length - 1) return prevSelected; // Ya está en la última posición
      
      const newOrder = [...prevSelected];
      // Intercambiar posiciones
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      return newOrder;
    });
  };
  
  // Función para buscar información del centro
  const encontrarCentro = (assignment) => {
    // Para debug: verificar qué campos tiene la asignación
    if (process.env.NODE_ENV === 'development') {
      console.log('Datos de asignación:', {
        id: assignment.id,
        docId: assignment.docId,
        centerId: assignment.centerId,
        nombreCentro: assignment.nombreCentro,
        centerName: assignment.centerName,
        centro: assignment.centro,
        centre: assignment.centre,
        municipality: assignment.municipio,
        order: assignment.order || assignment.numeroOrden
      });
    }
    
    // Validar que la asignación no sea undefined o null
    if (!assignment) {
      console.warn("encontrarCentro: assignment es undefined o null");
      return {
        id: "desconocido",
        nombre: "Centro desconocido",
        plazas: 0,
        asignadas: 0,
        municipio: "",
        localidad: ""
      };
    }
    
    // Buscar info del centro para mostrar plazas disponibles
    let centroInfo = null;
    
    try {
      // 1. Intentar usar la referencia guardada si existe
      if (assignment.centroAsociado) {
        centroInfo = assignment.centroAsociado;
      } 
      // 2. Intentar buscar por id
      else if (assignment.centerId && availablePlazas && Array.isArray(availablePlazas)) {
        centroInfo = availablePlazas.find(c => c && c.id === assignment.centerId);
      }
      // 3. Intentar buscar por nombre
      if (!centroInfo && assignment.nombreCentro && assignment.nombreCentro !== "Centro no encontrado" && availablePlazas && Array.isArray(availablePlazas)) {
        // Normalizar para búsqueda
        const nombreBusqueda = assignment.nombreCentro.toLowerCase();
        
        // Buscar por nombre exacto
        centroInfo = availablePlazas.find(c => 
          (c && c.nombre && c.nombre.toLowerCase() === nombreBusqueda) || 
          (c && c.centro && c.centro.toLowerCase() === nombreBusqueda)
        );
        
        // Si no se encuentra, intentar buscar sin acentos y en minúsculas
        if (!centroInfo) {
          try {
            const nombreNormalizado = nombreBusqueda
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            centroInfo = availablePlazas.find(c => {
              if (!c || (!c.nombre && !c.centro)) return false;
              
              const nombreCentroNormalizado = (c.nombre || c.centro || "")
                .toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              
              return nombreCentroNormalizado === nombreNormalizado;
            });
          } catch (error) {
            console.error("Error al normalizar nombre:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error en la búsqueda de centro:", error);
    }
    
    // 5. Crear objeto por defecto si no se encontró
    if (!centroInfo) {
      centroInfo = {
        id: assignment.centerId || "desconocido",
        nombre: assignment.nombreCentro || assignment.centerName || "Centro desconocido",
        plazas: 0,
        plazasTotal: 0,
        asignadas: 0,
        plazasOcupadas: 0,
        plazasDisponibles: 0,
        municipio: assignment.municipio || '',
        localidad: assignment.localidad || ''
      };
    } else {
      // Estandarizar propiedades para asegurar cálculos consistentes
      centroInfo.plazasTotal = centroInfo.plazasTotal || centroInfo.plazas || 0;
      centroInfo.plazasOcupadas = centroInfo.plazasOcupadas || centroInfo.asignadas || 0;
      centroInfo.plazasDisponibles = Math.max(0, centroInfo.plazasTotal - centroInfo.plazasOcupadas);
    }
    
    return centroInfo;
  };
  
  // Función para contar asignaciones para un centro específico
  const contarAsignacionesPorCentro = (centroId, nombreCentro) => {
    if (!centroId && !nombreCentro) return 0;
    
    // Contar todas las coincidencias por ID y por nombre
    return assignments.filter(a => {
      const aId = a.centerId || a.id || "";
      const aNombre = a.nombreCentro || a.centerName || a.centro || "";
      
      // Coincidencia por ID
      if (centroId && aId === centroId) return true;
      
      // Coincidencia por nombre exacto
      if (nombreCentro && aNombre.toLowerCase() === nombreCentro.toLowerCase()) return true;
      
      // Coincidencia con normalización
      try {
        if (nombreCentro && aNombre) {
          const normalizado1 = aNombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          const normalizado2 = nombreCentro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (normalizado1 === normalizado2) return true;
        }
      } catch (error) {
        console.error("Error al comparar nombres normalizados:", error);
      }
      
      return false;
    }).length;
  };
  
  // Función para comparar centros del archivo con los existentes
  const compararCentros = async (file) => {
    try {
      setInternalProcessingMessage("Analizando archivo...");
      
      // Obtener centros existentes
      const centrosExistentesSnapshot = await getDocs(collection(db, "centros"));
      
      // Crear mapas de búsqueda para comparación rápida
      const centrosExistentesPorCodigo = {};
      const centrosExistentesPorNombre = {};
      
      centrosExistentesSnapshot.forEach(doc => {
        const centro = doc.data();
        if (centro.codigo) {
          centrosExistentesPorCodigo[centro.codigo.toLowerCase()] = {
            ...centro,
            docId: doc.id
          };
        }
        if (centro.centro) {
          // Normalizar nombre para búsqueda
          const nombreNormalizado = centro.centro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          centrosExistentesPorNombre[nombreNormalizado] = {
            ...centro,
            docId: doc.id
          };
        }
      });
      
      // Procesar archivo según su tipo
      let centrosDelArchivo = [];
      const fileName = file.name.toLowerCase();
      
      if (fileName.endsWith('.xlsx')) {
        // Procesar Excel
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Obtener la primera hoja
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // Convertir a JSON
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        
        // Buscar encabezados (pueden estar en diferentes posiciones)
        let headerRow = -1;
        for (let i = 0; i < Math.min(20, jsonData.length); i++) {
          const row = jsonData[i];
          if (Array.isArray(row) && row.some(cell => 
            typeof cell === 'string' && 
            (cell.toLowerCase().includes('codigo') || 
             cell.toLowerCase().includes('centro') || 
             cell.toLowerCase().includes('municipio') ||
             cell.toLowerCase().includes('cod') ||
             cell.toLowerCase().includes('cent'))
          )) {
            headerRow = i;
            break;
          }
        }
        
        if (headerRow === -1) {
          throw new Error("No se encontró una fila de encabezado válida en el Excel. Prueba con otro archivo o formato.");
        }
        
        // Analizar encabezados para encontrar índices de columnas importantes
        const headers = jsonData[headerRow];
        console.log("Encabezados encontrados:", headers);
        
        const getColumnIndex = (keywords) => {
          // Primero intentar una coincidencia exacta
          let index = headers.findIndex(h => 
            typeof h === 'string' && 
            keywords.some(k => h.toUpperCase() === k.toUpperCase())
          );
          
          // Si no hay coincidencia exacta, buscar coincidencia parcial
          if (index === -1) {
            index = headers.findIndex(h => 
              typeof h === 'string' && 
              keywords.some(k => h.toUpperCase().includes(k.toUpperCase()))
            );
          }
          
          return index;
        };
        
        const codigoIdx = getColumnIndex(['CODIGO', 'CÓDIGO', 'COD', 'CODCENTRO', 'CODIGO_CENTRO']);
        const centroIdx = getColumnIndex(['CENTRO', 'CENT', 'NOMBRE', 'NOMBRE_CENTRO', 'NOMBRECENTRO', 'NOM_CENTRO']);
        const municipioIdx = getColumnIndex(['MUNICIPIO', 'MUN', 'LOCALIDAD', 'LOCAL', 'CIUDAD']);
        const plazasIdx = getColumnIndex(['PLAZAS', 'PLAZA', 'PLAZ', 'NUM_PLAZAS', 'PLAZAS_DISPONIBLES']);
        
        console.log("Índices de columnas:", { 
          codigo: codigoIdx, 
          centro: centroIdx, 
          municipio: municipioIdx, 
          plazas: plazasIdx 
        });
        
        if (codigoIdx === -1 && centroIdx === -1) {
          throw new Error("No se encontraron las columnas necesarias (código o centro). Se necesita al menos una de estas columnas.");
        }
        
        // Procesar filas de datos
        for (let i = headerRow + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!Array.isArray(row)) continue;
          
          const codigo = codigoIdx !== -1 && codigoIdx < row.length ? (row[codigoIdx]?.toString().trim() || "") : "";
          const centro = centroIdx !== -1 && centroIdx < row.length ? (row[centroIdx]?.toString().trim() || "") : "";
          const municipio = municipioIdx !== -1 && municipioIdx < row.length ? (row[municipioIdx]?.toString().trim() || "") : "";
          
          // Extraer plazas si está disponible
          let plazas = 1;
          if (plazasIdx !== -1 && plazasIdx < row.length && row[plazasIdx] !== undefined) {
            const plazasValue = parseFloat(row[plazasIdx]);
            if (!isNaN(plazasValue) && plazasValue > 0) {
              plazas = plazasValue;
            }
          }
          
          // Solo necesitamos al menos un código o nombre de centro
          if ((codigo && codigo.length > 0) || (centro && centro.length > 0)) {
            centrosDelArchivo.push({
              codigo: codigo,
              centro: centro || codigo, // Si no hay centro, usamos el código como nombre
              municipio: municipio,
              plazas: plazas
            });
          }
        }
      } else {
        // Procesar CSV
        const text = await file.text();
        const lines = text.split('\n')
          .map(line => line.replace(/"/g, '').trim())
          .filter(Boolean);
        
        // Detectar el tipo de separador (punto y coma, coma o tabulador)
        let separator = ';';
        const firstLine = lines[0];
        if (firstLine) {
          if (firstLine.includes('\t')) {
            separator = '\t';
            console.log("Formato detectado: CSV con separador de tabulaciones");
          } else if (firstLine.includes(',') && !firstLine.includes(';')) {
            separator = ',';
            console.log("Formato detectado: CSV con separador de comas");
          } else {
            console.log("Formato detectado: CSV con separador de punto y coma");
          }
        }
        
        // Buscar encabezados
        let headerRow = -1;
        for (let i = 0; i < Math.min(20, lines.length); i++) {
          const line = lines[i].toLowerCase();
          if (line.includes('codigo') || 
              line.includes('centro') || 
              line.includes('municipio') || 
              line.includes('cod') || 
              line.includes('cent')) {
            headerRow = i;
            break;
          }
        }
        
        if (headerRow === -1) {
          throw new Error("No se encontró una línea de encabezado válida en el CSV. Prueba con otro archivo o formato.");
        }
        
        // Analizar encabezados
        const headers = lines[headerRow].split(separator);
        console.log("Encabezados CSV encontrados:", headers);
        
        const getColumnIndex = (keywords) => {
          // Primero intentar una coincidencia exacta
          let index = headers.findIndex(h => 
            typeof h === 'string' && 
            keywords.some(k => h.toUpperCase() === k.toUpperCase())
          );
          
          // Si no hay coincidencia exacta, buscar coincidencia parcial
          if (index === -1) {
            index = headers.findIndex(h => 
              typeof h === 'string' && 
              keywords.some(k => h.toUpperCase().includes(k.toUpperCase()))
            );
          }
          
          return index;
        };
        
        const codigoIdx = getColumnIndex(['CODIGO', 'CÓDIGO', 'COD', 'CODCENTRO', 'CODIGO_CENTRO']);
        const centroIdx = getColumnIndex(['CENTRO', 'CENT', 'NOMBRE', 'NOMBRE_CENTRO', 'NOMBRECENTRO', 'NOM_CENTRO']);
        const municipioIdx = getColumnIndex(['MUNICIPIO', 'MUN', 'LOCALIDAD', 'LOCAL', 'CIUDAD']);
        const plazasIdx = getColumnIndex(['PLAZAS', 'PLAZA', 'PLAZ', 'NUM_PLAZAS', 'PLAZAS_DISPONIBLES']);
        
        console.log("Índices de columnas CSV:", { 
          codigo: codigoIdx, 
          centro: centroIdx, 
          municipio: municipioIdx, 
          plazas: plazasIdx 
        });
        
        if (codigoIdx === -1 && centroIdx === -1) {
          throw new Error("No se encontraron las columnas necesarias (código o centro). Se necesita al menos una de estas columnas.");
        }
        
        // Procesar líneas de datos
        for (let i = headerRow + 1; i < lines.length; i++) {
          const parts = lines[i].split(separator);
          
          const codigo = codigoIdx !== -1 && codigoIdx < parts.length ? (parts[codigoIdx]?.trim() || "") : "";
          const centro = centroIdx !== -1 && centroIdx < parts.length ? (parts[centroIdx]?.trim() || "") : "";
          const municipio = municipioIdx !== -1 && municipioIdx < parts.length ? (parts[municipioIdx]?.trim() || "") : "";
          
          // Extraer plazas si está disponible
          let plazas = 1;
          if (plazasIdx !== -1 && plazasIdx < parts.length && parts[plazasIdx] !== undefined) {
            const plazasValue = parseFloat(parts[plazasIdx]);
            if (!isNaN(plazasValue) && plazasValue > 0) {
              plazas = plazasValue;
            }
          }
          
          // Solo necesitamos al menos un código o nombre de centro
          if ((codigo && codigo.length > 0) || (centro && centro.length > 0)) {
            centrosDelArchivo.push({
              codigo: codigo,
              centro: centro || codigo, // Si no hay centro, usamos el código como nombre
              municipio: municipio,
              plazas: plazas
            });
          }
        }
      }
      
      console.log(`Se encontraron ${centrosDelArchivo.length} centros en el archivo`);
      
      // Identificar centros nuevos (no existentes en la base de datos)
      const nuevos = centrosDelArchivo.filter(centro => {
        const codigoNormalizado = centro.codigo.toLowerCase();
        const nombreNormalizado = centro.centro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        return !centrosExistentesPorCodigo[codigoNormalizado] && 
               !centrosExistentesPorNombre[nombreNormalizado];
      });
      
      // Actualizar estado con los centros nuevos
      setCentrosNuevos(nuevos);
      
      // Inicializar selección (todos seleccionados por defecto)
      const seleccionInicial = {};
      nuevos.forEach((centro, index) => {
        seleccionInicial[index] = true;
      });
      setSeleccionados(seleccionInicial);
      
      setMostrarComparacion(true);
      setInternalProcessingMessage("");
      
      return {
        total: centrosDelArchivo.length,
        nuevos: nuevos.length
      };
    } catch (error) {
      console.error("Error al comparar centros:", error);
      showNotification(`Error al analizar archivo: ${error.message}`, "error");
      setInternalProcessingMessage("");
      return null;
    }
  };
  
  // Función para añadir centros seleccionados a la base de datos
  const añadirCentrosSeleccionados = async () => {
    try {
      setInternalProcessingMessage("Añadiendo centros seleccionados...");
      
      // Filtrar solo los centros seleccionados
      const centrosAñadir = centrosNuevos.filter((_, index) => seleccionados[index]);
      
      if (centrosAñadir.length === 0) {
        showNotification("No hay centros seleccionados para añadir", "warning");
        setInternalProcessingMessage("");
        return;
      }
      
      // Obtener ID para nuevos centros
      const centrosSnapshot = await getDocs(collection(db, "centros"));
      let nextId = centrosSnapshot.size + 1;
      
      // Añadir los centros en batches
      const BATCH_SIZE = 100;
      let procesados = 0;
      
      for (let i = 0; i < centrosAñadir.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const lote = centrosAñadir.slice(i, Math.min(i + BATCH_SIZE, centrosAñadir.length));
        
        for (const centro of lote) {
          const docRef = doc(collection(db, "centros"));
          batch.set(docRef, {
            id: (nextId++).toString(),
            codigo: centro.codigo,
            centro: centro.centro,
            nombre: centro.centro,
            localidad: centro.municipio,
            municipio: centro.municipio,
            plazas: centro.plazas,
            plazasTotal: centro.plazas,
            asignadas: 0,
            plazasOcupadas: 0,
            plazasDisponibles: centro.plazas,
            docId: docRef.id,
            timestamp: serverTimestamp()
          });
          procesados++;
        }
        
        await batch.commit();
        setInternalProcessingMessage(`Añadiendo centros: ${procesados}/${centrosAñadir.length}`);
      }
      
      // Recargar datos
      await cargarDatosDesdeFirebase();
      
      showNotification(`Se han añadido ${procesados} centros correctamente`, "success");
      setMostrarComparacion(false);
      setCentrosNuevos([]);
      setSeleccionados({});
      setInternalProcessingMessage("");
    } catch (error) {
      console.error("Error al añadir centros:", error);
      showNotification(`Error al añadir centros: ${error.message}`, "error");
      setInternalProcessingMessage("");
    }
  };
  
  // Añadir botón y sección de importación de centros
  const renderSeccionImportacionCentros = () => {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '20px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        marginBottom: '20px'
      }}>
        <h3 style={{ marginTop: 0, color: '#2c3e50', marginBottom: '15px' }}>
          Importación y Comparación de Centros
        </h3>
        
        {!mostrarComparacion ? (
          <div>
            <p style={{ marginBottom: '20px' }}>
              Selecciona un archivo Excel o CSV para comparar con los centros existentes y añadir los nuevos.
            </p>
            
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
              <input
                type="file"
                id="fileInput"
                accept=".csv,.xlsx"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    const file = e.target.files[0];
                    await compararCentros(file);
                  }
                }}
              />
              <button
                onClick={() => document.getElementById('fileInput').click()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Seleccionar Archivo
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>Centros Nuevos Encontrados: {centrosNuevos.length}</h4>
              <div>
                <button
                  onClick={() => {
                    const nuevoEstado = {};
                    centrosNuevos.forEach((_, idx) => { nuevoEstado[idx] = true; });
                    setSeleccionados(nuevoEstado);
                  }}
                  style={{
                    padding: '5px 10px',
                    backgroundColor: '#2ecc71',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    marginRight: '10px',
                    fontSize: '12px'
                  }}
                >
                  Seleccionar Todos
                </button>
                <button
                  onClick={() => {
                    const nuevoEstado = {};
                    centrosNuevos.forEach((_, idx) => { nuevoEstado[idx] = false; });
                    setSeleccionados(nuevoEstado);
                  }}
                  style={{
                    padding: '5px 10px',
                    backgroundColor: '#e74c3c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Deseleccionar Todos
                </button>
              </div>
            </div>
            
            <div style={{ 
              maxHeight: '400px', 
              overflowY: 'auto', 
              border: '1px solid #eee',
              borderRadius: '5px',
              marginBottom: '15px'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Selec.</th>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Código</th>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Centro</th>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Municipio</th>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Plazas</th>
                  </tr>
                </thead>
                <tbody>
                  {centrosNuevos.map((centro, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px' }}>
                        <input
                          type="checkbox"
                          checked={seleccionados[index] || false}
                          onChange={() => {
                            setSeleccionados(prev => ({
                              ...prev,
                              [index]: !prev[index]
                            }));
                          }}
                        />
                      </td>
                      <td style={{ padding: '8px' }}>{centro.codigo}</td>
                      <td style={{ padding: '8px' }}>{centro.centro}</td>
                      <td style={{ padding: '8px' }}>{centro.municipio}</td>
                      <td style={{ padding: '8px' }}>{centro.plazas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button
                onClick={() => {
                  setMostrarComparacion(false);
                  setCentrosNuevos([]);
                  setSeleccionados({});
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f1f1f1',
                  color: '#333',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              
              <button
                onClick={añadirCentrosSeleccionados}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#2ecc71',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
                disabled={internalProcessingMessage !== ""}
              >
                {internalProcessingMessage ? (
                  <span className="processing-btn">
                    <span className="processing-indicator"></span>
                    Procesando...
                  </span>
                ) : (
                  `Añadir ${Object.values(seleccionados).filter(Boolean).length} centros seleccionados`
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  const sincronizarHistorialSolicitudes = async () => {
    try {
      setIsSincronizando(true);
      setInternalProcessingMessage("Sincronizando historial de solicitudes...");
      
      // Obtener todas las asignaciones actuales
      const asignacionesRef = collection(db, "asignaciones");
      const asignacionesSnapshot = await getDocs(asignacionesRef);
      const asignacionesActuales = new Set();
      
      asignacionesSnapshot.forEach(doc => {
        const data = doc.data();
        if (data && data.order) {
          asignacionesActuales.add(data.order);
        }
      });
      
      // Obtener todas las solicitudes del historial
      const historialRef = collection(db, "historialSolicitudes");
      const historialSnapshot = await getDocs(historialRef);
      const solicitudesPendientesRef = collection(db, "solicitudesPendientes");
      
      let solicitudesRestauradas = 0;
      let errores = 0;
      
      // Procesar cada solicitud del historial
      for (const doc of historialSnapshot.docs) {
        const solicitud = doc.data();
        
        // Si la solicitud no está asignada actualmente
        if (solicitud.orden && !asignacionesActuales.has(solicitud.orden)) {
          try {
            // Crear una nueva solicitud pendiente
            const nuevaSolicitud = {
              ...solicitud,
              estado: "PENDIENTE",
              fechaCreacion: new Date().toISOString(),
              timestamp: Date.now(),
              intentosFallidos: 0
            };
            
            // Eliminar campos que no deben estar en solicitudes pendientes
            delete nuevaSolicitud.centroAsignado;
            delete nuevaSolicitud.centroId;
            delete nuevaSolicitud.fechaHistorico;
            
            await addDoc(solicitudesPendientesRef, nuevaSolicitud);
            solicitudesRestauradas++;
          } catch (error) {
            console.error(`Error al restaurar solicitud ${solicitud.orden}:`, error);
            errores++;
          }
        }
      }
      
      setInternalProcessingMessage("");
      showNotification(
        `Sincronización completada. ${solicitudesRestauradas} solicitudes restauradas a pendientes. ${errores} errores.`,
        "success"
      );
      
      // Recargar datos
      await cargarDatosDesdeFirebase();
    } catch (error) {
      console.error("Error en sincronización:", error);
      showNotification("Error al sincronizar historial: " + error.message, "error");
    } finally {
      setIsSincronizando(false);
    }
  };
  
  // Renderizar el panel de administración
  return (
    <div style={{
      maxWidth: '1280px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Estilos para la animación del spinner */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          
          .processing-btn {
            position: relative;
            padding-left: 30px; /* Espacio para el spinner */
            display: inline-flex;
            align-items: center;
          }
          
          .processing-indicator {
            position: absolute;
            left: 10px;
            width: 15px;
            height: 15px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            border-top-color: white;
            animation: spin 1s linear infinite;
          }
          
          /* Estilos para el modal */
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
          }
          
          .modal-content {
            background-color: white;
            border-radius: 8px;
            padding: 25px;
            width: 90%;
            max-width: 800px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
          }
          
          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
          }
          
          .modal-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
          }
          
          .modal-body {
            margin-bottom: 20px;
          }
          
          .modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
          }
          
          .search-box {
            width: 100%;
            padding: 12px 15px;
            border: 1px solid #ddd;
            border-radius: 6px;
            margin-bottom: 15px;
            font-size: 16px;
          }
          
          .centros-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
          }
          
          .centro-card {
            border: 1px solid #eee;
            border-radius: 6px;
            padding: 15px;
            cursor: pointer;
            transition: all 0.2s;
          }
          
          .centro-card:hover {
            background-color: #f7f9fc;
          }
          
          .centro-card.selected {
            background-color: #e3f2fd;
            border-color: #2196f3;
          }
          
          .selected-centros {
            margin-top: 20px;
            border: 1px solid #e1e1e1;
            border-radius: 6px;
            padding: 15px;
            background-color: #f9f9f9;
          }
          
          .centro-selected-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px;
            margin-bottom: 5px;
            background-color: white;
            border-radius: 4px;
            border: 1px solid #eee;
          }
        `}
      </style>
      
      <h2 style={{ marginBottom: '10px', color: '#333' }}>Panel de Administración</h2>
      
      {/* Sección de importación de centros */}
      {renderSeccionImportacionCentros()}
      
      {/* Acciones administrativas */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '20px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        marginBottom: '20px'
      }}>
        <h3 style={{ marginTop: 0, color: '#2c3e50', marginBottom: '15px' }}>Acciones Administrativas</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
          <button
            onClick={async () => {
              // Primero eliminar duplicados en solicitudes
              await eliminarSolicitudesDuplicadas();
              // Luego eliminar duplicados en historial
              await limpiarDuplicadosHistorial();
              showNotification("Duplicados eliminados correctamente", "success");
            }}
            style={{
              padding: '15px 20px',
              backgroundColor: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}
            disabled={loadingProcess}
          >
            <span>🗑️</span> Eliminar Duplicados
          </button>
          
          {/* Botón para reasignar plazas por orden */}
          <button
            onClick={() => procesarTodasLasSolicitudes({respetarAsignacionesExistentes: false})}
            style={{
              padding: '15px 20px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: assignments.length > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              opacity: assignments.length > 0 ? 1 : 0.6
            }}
            disabled={assignments.length === 0 || loadingProcess}
          >
            <span>🔄</span> Reasignar Plazas por Orden
          </button>
          
          <div className="button-group">
            <button 
              onClick={procesarSolicitudesPorMinuto}
              disabled={loadingProcess || isSincronizando}
              className="admin-button"
            >
              {loadingProcess ? "Procesando..." : "Procesar Siguiente Solicitud"}
            </button>
            
            <button 
              onClick={sincronizarHistorialSolicitudes}
              disabled={loadingProcess || isSincronizando}
              className="admin-button"
              style={{
                backgroundColor: '#3498db',
                color: 'white',
                padding: '10px 15px',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                marginLeft: '10px'
              }}
            >
              {isSincronizando ? "Sincronizando..." : "Sincronizar Historial"}
            </button>
          </div>
        </div>
      </div>
      
      {processingMessage && (
        <div style={{ 
          marginTop: '15px', 
          padding: '15px', 
          backgroundColor: '#f8f9fa',
          borderRadius: '5px', 
          fontStyle: 'italic',
          marginBottom: '20px',
          textAlign: 'center',
          border: '1px solid #e9ecef',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong>Estado:</strong> {processingMessage || internalProcessingMessage}
          </div>
          <button
            onClick={async () => {
              setInternalProcessingMessage("Recargando datos...");
              const success = await cargarDatosDesdeFirebase();
              setInternalProcessingMessage(success ? "Datos recargados correctamente" : "Error al recargar datos");
              
              // Limpiar mensaje después de un tiempo
              setTimeout(() => {
                setInternalProcessingMessage("");
              }, 2000);
            }}
            style={{
              padding: '5px 10px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            🔄 Recargar datos
          </button>
        </div>
      )}
      
      {/* Sección de asignaciones actuales */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '20px', 
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        marginBottom: '20px'
      }}>
        <h2>Asignaciones Actuales</h2>
        
        <div style={{ 
          marginBottom: '15px', 
          padding: '10px 15px', 
          borderRadius: '5px', 
          backgroundColor: '#e8f4f8', 
          fontSize: '14px',
          border: '1px solid #c8e1e9',
          color: '#2980b9'
        }}>
          <strong>Información:</strong> El botón "Reasignar" convierte una asignación actual en una solicitud pendiente, permitiendo que se reasigne a otro centro si hay mejor opción disponible.
        </div>
        
        {/* Buscador de asignaciones */}
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            placeholder="Buscar por número de orden o centro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              marginBottom: '10px'
            }}
          />
        </div>
        
        {assignments.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Orden</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Centro Asignado</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Plazas Disponibles</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {assignments
                .sort((a, b) => {
                  const orderA = a.numeroOrden || a.order || 0;
                  const orderB = b.numeroOrden || b.order || 0;
                  return Number(orderA) - Number(orderB);
                })
                .filter(assignment => {
                  const searchTermLower = searchTerm.toLowerCase();
                  const orderStr = (assignment.numeroOrden || assignment.order || "").toString();
                  const centerName = assignment.nombreCentro || assignment.centerName || "";
                  
                  return (
                    orderStr.includes(searchTermLower) ||
                    centerName.toLowerCase().includes(searchTermLower)
                  );
                })
                .map((assignment, index) => {
                  // Buscar info del centro
                  const centroInfo = encontrarCentro(assignment);
                  
                  // Contar manualmente las asignaciones para este centro
                  const asignacionesParaEsteCentro = contarAsignacionesPorCentro(
                    centroInfo.id, 
                    centroInfo.nombre || centroInfo.centro
                  );
                  
                  // Cálculo estandarizado de plazas
                  const plazasTotal = centroInfo.plazasTotal || centroInfo.plazas || 0;
                  
                  // Mostrar plazas disponibles sin incluir la asignación actual que estamos viendo
                  // Usar el conteo manual para mayor precisión
                  const plazasDisponibles = Math.max(0, plazasTotal - asignacionesParaEsteCentro);
                  const plazasDisponiblesSinActual = Math.max(0, plazasTotal - asignacionesParaEsteCentro + 1);
                  
                  return (
                    <tr key={assignment.docId || assignment.id || `assignment-${index}`} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px' }}>{assignment.numeroOrden || assignment.order}</td>
                      <td style={{ padding: '10px' }}>
                        {assignment.nombreCentro || assignment.centerName || 
                         (centroInfo && (centroInfo.nombre || centroInfo.centro)) || 
                         assignment.centro || assignment.centre || assignment.centerId || "Centro sin nombre"}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ 
                          padding: '5px',
                          borderRadius: '3px',
                          border: '1px solid #e6f2ff'
                        }}>
                          <div style={{ 
                            display: 'flex',
                            fontSize: '13px',
                            justifyContent: 'center',
                            gap: '5px'
                          }}>
                            <span style={{ 
                              color: plazasDisponiblesSinActual > 0 ? '#2ecc71' : '#e74c3c',
                              fontWeight: 'bold'
                            }}>
                              {plazasDisponiblesSinActual}
                            </span> 
                            <span>disponibles de</span> 
                            <span>{plazasTotal}</span>
                            {plazasTotal > 0 && (
                              <span style={{ 
                                marginLeft: '5px',
                                backgroundColor: plazasDisponiblesSinActual > 0 ? '#e8f5e9' : '#ffebee',
                                padding: '0px 5px',
                                borderRadius: '10px',
                                fontSize: '12px'
                              }}>
                                {Math.round((plazasDisponiblesSinActual / plazasTotal) * 100)}%
                              </span>
                            )}
                          </div>
                          <div style={{
                            fontSize: '11px', 
                            color: '#718096',
                            marginTop: '3px',
                            textAlign: 'center'
                          }}>
                            {asignacionesParaEsteCentro > 1 ? 
                             `(${asignacionesParaEsteCentro} asignaciones totales)` : 
                             '(1 asignación)'}
                          </div>
                          {centroInfo.municipio && (
                            <div style={{
                              fontSize: '12px', 
                              color: '#718096',
                              marginTop: '3px',
                              textAlign: 'center'
                            }}>
                              {centroInfo.municipio}
                              {centroInfo.localidad && centroInfo.localidad !== centroInfo.municipio && ` (${centroInfo.localidad})`}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <button 
                          onClick={() => handleReasignar(assignment)}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: '#f39c12',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                          disabled={loadingProcess}
                        >
                          Reasignar
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        ) : (
          <p>No hay asignaciones.</p>
        )}
      </div>
      
      {/* Lista de solicitudes pendientes - con buscador */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '20px', 
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        marginBottom: '20px'
      }}>
        <h2>Solicitudes Pendientes</h2>
        
        {/* Buscador de solicitudes */}
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            placeholder="Buscar por número de orden..."
            value={searchTermSolicitudes}
            onChange={(e) => setSearchTermSolicitudes(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              marginBottom: '10px'
            }}
          />
        </div>
        
        {solicitudes.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Orden</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Centros Solicitados</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Plazas Disponibles</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes
                .sort((a, b) => Number(a.orden) - Number(b.orden))
                .filter(solicitud => {
                  const searchTermLower = searchTermSolicitudes.toLowerCase();
                  return String(solicitud.orden).includes(searchTermLower);
                })
                .map(solicitud => {
                  return (
                    <tr key={solicitud.docId} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px' }}>{solicitud.orden}</td>
                      <td style={{ padding: '10px' }}>
                        {solicitud.centrosIds.map((centroId, index) => {
                          // Buscar información del centro seleccionado
                          let centro = availablePlazas.find(p => p.id === centroId);
                          
                          // 1. Búsqueda exacta por ID
                          if (!centro) {
                            centro = availablePlazas.find(p => p.id === centroId);
                          }
                          
                          // 2. Por nombre normalizado
                          if (!centro && typeof centroId === 'string' && centroId.length > 5) {
                            const nombreBusqueda = centroId.toLowerCase()
                              .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                            
                            centro = availablePlazas.find(c => {
                              const nombreCentro = (c.nombre || c.centro || "").toLowerCase()
                                .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                              return nombreCentro === nombreBusqueda;
                            });
                          }
                          
                          // 3. Coincidencia parcial
                          if (!centro && typeof centroId === 'string' && centroId.length > 5) {
                            const nombreParcial = centroId.toLowerCase();
                            const coincidenciaParcial = availablePlazas.find(c => 
                              (c.nombre && c.nombre.toLowerCase().includes(nombreParcial)) || 
                              (c.centro && c.centro.toLowerCase().includes(nombreParcial))
                            );
                            
                            if (coincidenciaParcial) {
                              centro = coincidenciaParcial;
                            }
                          }
                          
                          // 4. Búsqueda por código del centro
                          if (!centro && typeof centroId === 'string') {
                            centro = availablePlazas.find(c => 
                              c.codigo === centroId || 
                              c.codigoCentro === centroId
                            );
                          }
                          
                          // 5. Si sigue sin encontrarse, intentar buscar coincidencias aproximadas
                          if (!centro && typeof centroId === 'string' && centroId.length > 3) {
                            centro = availablePlazas.find(c => {
                              // Comprobar coincidencia de iniciales
                              if (c.nombre) {
                                const palabras = c.nombre.split(' ');
                                const iniciales = palabras
                                  .map(p => p.charAt(0))
                                  .filter(i => i.match(/[A-Z]/))
                                  .join('');
                                
                                return iniciales === centroId.toUpperCase();
                              }
                              return false;
                            });
                          }
                          
                          if (!centro) {
                            // Si no se encuentra, usar un objeto con propiedades mínimas y nombre más descriptivo
                            centro = { 
                              id: centroId,
                              nombre: `Centro ${centroId}`,
                              centro: `Centro ${centroId}`,
                              plazas: 0, 
                              plazasTotal: 0,
                              asignadas: 0,
                              plazasDisponibles: 0 
                            };
                          }
                          
                          // Cálculo estandarizado de plazas disponibles
                          const plazasTotal = centro.plazasTotal || centro.plazas || 0;
                          const plazasOcupadas = centro.plazasOcupadas || centro.asignadas || 0;
                          
                          // Contar manualmente para mayor precisión
                          const asignacionesParaEsteCentro = contarAsignacionesPorCentro(
                            centro.id, 
                            centro.nombre || centro.centro
                          );
                          const plazasDisponibles = Math.max(0, plazasTotal - asignacionesParaEsteCentro);
                          
                          return (
                            <div key={centroId} style={{ 
                              marginBottom: index < solicitud.centrosIds.length - 1 ? '5px' : '0',
                              padding: '5px',
                              backgroundColor: index === 0 ? '#f2f9ff' : 'transparent',
                              borderRadius: '3px',
                              border: '1px solid #e6f2ff'
                            }}>
                              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                                {centro.nombre || centro.centro || centroId || "Centro desconocido"}
                                {process.env.NODE_ENV === 'development' && !centro.nombre && !centro.centro && centroId && (
                                  <span style={{ fontSize: '10px', color: '#999', marginLeft: '5px' }}>
                                    (ID: {centroId})
                                  </span>
                                )}
                              </div>
                              <div style={{ 
                                display: 'flex',
                                marginTop: '3px',
                                fontSize: '13px',
                                justifyContent: 'center',
                                gap: '5px'
                              }}>
                                <span style={{ 
                                  color: plazasDisponibles > 0 ? '#2ecc71' : '#e74c3c',
                                  fontWeight: 'bold'
                                }}>
                                  {plazasDisponibles}
                                </span> 
                                <span>disponibles de</span> 
                                <span>{plazasTotal}</span>
                                {plazasTotal > 0 && (
                                  <span style={{ 
                                    marginLeft: '5px',
                                    backgroundColor: plazasDisponibles > 0 ? '#e8f5e9' : '#ffebee',
                                    padding: '0px 5px',
                                    borderRadius: '10px',
                                    fontSize: '12px'
                                  }}>
                                    {Math.round((plazasDisponibles / plazasTotal) * 100)}%
                                  </span>
                                )}
                              </div>
                              {asignacionesParaEsteCentro > 0 && (
                                <div style={{
                                  fontSize: '11px', 
                                  color: '#718096',
                                  marginTop: '3px',
                                  textAlign: 'center'
                                }}>
                                  ({asignacionesParaEsteCentro} 
                                  {asignacionesParaEsteCentro === 1 ? ' asignación actual' : ' asignaciones actuales'})
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <button 
                          onClick={async () => {
                            try {
                              // Mostrar mensaje de procesamiento
                              setInternalProcessingMessage(`Procesando solicitud ${solicitud.orden || "desconocida"}...`);
                              
                              // Validar solicitud de forma más robusta
                              if (!solicitud) {
                                throw new Error("La solicitud no existe");
                              }
                              
                              // Validar y establecer valores predeterminados
                              const ordenSolicitud = solicitud.orden || '';
                              const centrosIds = solicitud.centrosIds || [];
                              
                              if (!ordenSolicitud) {
                                console.warn("Procesando solicitud sin número de orden:", solicitud);
                              }
                              
                              // Verificar si hay centros seleccionados
                              if (!Array.isArray(centrosIds) || centrosIds.length === 0) {
                                throw new Error("La solicitud no tiene centros seleccionados");
                              }
                              
                              // Crear objeto de solicitud normalizado
                              const solicitudNormalizada = {
                                ...solicitud,
                                orden: ordenSolicitud,
                                centrosIds: centrosIds
                              };
                              
                              console.log("Procesando solicitud normalizada:", solicitudNormalizada);
                              
                              // Importar la función procesarSolicitud directamente
                              const { procesarSolicitud } = await import('../utils/assignmentUtils');
                              
                              // Procesar esta solicitud específica
                              const resultado = await procesarSolicitud(
                                solicitudNormalizada, 
                                availablePlazas, 
                                db
                              );
                              
                              console.log("Resultado procesamiento individual:", resultado);
                              
                              // Si fue exitoso, eliminar la solicitud de la lista de pendientes
                              if (resultado.success && solicitud.docId) {
                                try {
                                  setInternalProcessingMessage("Eliminando solicitud procesada...");
                                  await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
                                } catch (error) {
                                  console.error("Error al eliminar solicitud procesada:", error);
                                }
                              }
                              
                              // Recargar datos desde Firebase
                              setInternalProcessingMessage("Actualizando datos...");
                              await cargarDatosDesdeFirebase();
                              
                              // Mostrar notificación según resultado
                              setInternalProcessingMessage("");
                              if (resultado.success) {
                                showNotification(`Solicitud ${ordenSolicitud} procesada correctamente`, "success");
                              } else if (resultado.noAsignable) {
                                showNotification(`No se pudo asignar la solicitud: ${resultado.message}`, "warning");
                              } else {
                                throw new Error(resultado.message || "Error desconocido");
                              }
                            } catch (error) {
                              console.error("Error al procesar solicitud:", error);
                              setInternalProcessingMessage("");
                              showNotification(`Error al procesar solicitud: ${error.message}`, "error");
                            }
                          }}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: '#3498db',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                          disabled={loadingProcess || internalProcessingMessage}
                        >
                          {internalProcessingMessage && internalProcessingMessage.includes(`Procesando solicitud ${solicitud.orden || "desconocida"}`) ? (
                            <span className="processing-btn">
                              <span className="processing-indicator"></span>
                              Procesando...
                            </span>
                          ) : 'Procesar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        ) : (
          <p>No hay solicitudes pendientes.</p>
        )}
      </div>
      
      {/* Enlaces de navegación */}
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <a 
          href="/" 
          style={{
            padding: '10px 20px',
            backgroundColor: '#f8f9fa',
            color: '#333',
            textDecoration: 'none',
            borderRadius: '5px',
            fontWeight: 'bold'
          }}
        >
          Volver a la página principal
        </a>
      </div>
      
      {/* Información de estado */}
      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '5px', 
        textAlign: 'center',
        fontSize: '14px',
        color: '#666'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#2c3e50' }}>Resumen de plazas</h3>
          <button
            onClick={async () => {
              setInternalProcessingMessage("Recalculando plazas disponibles...");
              
              // Crear un mapa para contar asignaciones por centro
              const conteoAsignacionesPorCentro = {};
              
              // Contar todas las asignaciones existentes por centro
              assignments.forEach(a => {
                // Obtener todas las posibles referencias al centro
                const centroId = a.centerId || a.id;
                const nombreCentro = a.nombreCentro || a.centerName || a.centro || "";
                
                // Incrementar conteo para este centroId
                if (centroId) {
                  conteoAsignacionesPorCentro[centroId] = (conteoAsignacionesPorCentro[centroId] || 0) + 1;
                }
                
                // También buscar por nombre si existe
                if (nombreCentro && nombreCentro.length > 0) {
                  // Buscar por nombre exacto
                  const centroEncontradoPorNombre = availablePlazas.find(c => 
                    (c.nombre && c.nombre.toLowerCase() === nombreCentro.toLowerCase()) || 
                    (c.centro && c.centro.toLowerCase() === nombreCentro.toLowerCase())
                  );
                  
                  // Si se encuentra por nombre y es diferente al ID, contarlo
                  if (centroEncontradoPorNombre && centroEncontradoPorNombre.id !== centroId) {
                    conteoAsignacionesPorCentro[centroEncontradoPorNombre.id] = 
                      (conteoAsignacionesPorCentro[centroEncontradoPorNombre.id] || 0) + 1;
                  }
                  
                  // Buscar por nombre normalizado (sin acentos)
                  try {
                    const normalizado = nombreCentro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    
                    const centroEncontradoNormalizado = availablePlazas.find(c => {
                      if (!c || (!c.nombre && !c.centro)) return false;
                      
                      const nombreCentroNormalizado = (c.nombre || c.centro || "")
                        .toLowerCase()
                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                      
                      return nombreCentroNormalizado === normalizado && c.id !== centroId;
                    });
                    
                    if (centroEncontradoNormalizado) {
                      conteoAsignacionesPorCentro[centroEncontradoNormalizado.id] = 
                        (conteoAsignacionesPorCentro[centroEncontradoNormalizado.id] || 0) + 1;
                    }
                  } catch (error) {
                    console.error("Error en normalización:", error);
                  }
                }
              });
              
              console.log("Conteo de asignaciones por centro:", conteoAsignacionesPorCentro);
              
              // Verificar para cada centro si el conteo manual coincide
              availablePlazas.forEach(centro => {
                const conteoManual = contarAsignacionesPorCentro(centro.id, centro.nombre || centro.centro);
                const conteoMapa = conteoAsignacionesPorCentro[centro.id] || 0;
                
                if (conteoManual !== conteoMapa) {
                  console.warn(`Discrepancia en conteo para centro ${centro.nombre}: 
                    - Conteo mapa: ${conteoMapa}
                    - Conteo manual: ${conteoManual}`);
                  
                  // Usar el conteo mayor
                  conteoAsignacionesPorCentro[centro.id] = Math.max(conteoManual, conteoMapa);
                }
              });
              
              // Recalcular plazas disponibles para cada centro
              const updatedAvailablePlazas = availablePlazas.map(centro => {
                const plazasTotal = centro.plazasTotal || centro.plazas || 0;
                
                // Obtener asignaciones para este centro desde el mapa
                const asignacionesCentro = conteoAsignacionesPorCentro[centro.id] || 0;
                
                return {
                  ...centro,
                  asignadas: asignacionesCentro,
                  plazasOcupadas: asignacionesCentro,
                  plazasDisponibles: Math.max(0, plazasTotal - asignacionesCentro)
                };
              });
              
              // Actualizar en la base de datos
              try {
                const batch = writeBatch(db);
                
                for (const centro of updatedAvailablePlazas) {
                  if (centro.docId) {
                    batch.update(doc(db, "centros", centro.docId), {
                      asignadas: centro.asignadas,
                      plazasOcupadas: centro.plazasOcupadas,
                      plazasDisponibles: centro.plazasDisponibles
                    });
                  }
                }
                
                await batch.commit();
                setInternalProcessingMessage("Actualizando datos desde Firebase...");
                
                // Recargar datos desde Firebase para reflejar los cambios
                await cargarDatosDesdeFirebase();
                
                setInternalProcessingMessage("Plazas disponibles actualizadas correctamente");
              } catch (error) {
                console.error("Error al actualizar plazas en la BD:", error);
                setInternalProcessingMessage("Error al actualizar en la BD: " + error.message);
              }
              
              setTimeout(() => setInternalProcessingMessage(""), 2000);
            }}
            style={{
              padding: '5px 10px',
              backgroundColor: '#2ecc71',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            🔄 Recalcular plazas
          </button>
        </div>
        
        <p>
          Plazas asignadas: {assignments.length} / 
          Plazas totales: {availablePlazas.reduce((total, centro) => {
            const plazasTotal = centro.plazasTotal || centro.plazas || 0;
            return total + plazasTotal;
          }, 0)} / 
          Plazas disponibles: {availablePlazas.reduce((total, centro) => {
            const plazasTotal = centro.plazasTotal || centro.plazas || 0;
            const plazasOcupadas = centro.plazasOcupadas || centro.asignadas || 0;
            const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
            return total + plazasDisponibles;
          }, 0)}
        </p>
        
        {/* Añadir barra de progreso para visualizar ocupación */}
        {(() => {
          const totalPlazas = availablePlazas.reduce((total, centro) => {
            const plazasTotal = centro.plazasTotal || centro.plazas || 0;
            return total + plazasTotal;
          }, 0);
          
          const plazasOcupadas = assignments.length;
          const porcentajeOcupacion = totalPlazas > 0 ? Math.round((plazasOcupadas / totalPlazas) * 100) : 0;
          
          let colorBarra = '#2ecc71'; // verde
          if (porcentajeOcupacion > 75) {
            colorBarra = '#e74c3c'; // rojo
          } else if (porcentajeOcupacion > 50) {
            colorBarra = '#f39c12'; // naranja
          } else if (porcentajeOcupacion > 25) {
            colorBarra = '#3498db'; // azul
          }
          
          return (
            <div style={{ marginTop: '10px', marginBottom: '15px' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}>
                <div style={{ width: '70%', maxWidth: '500px' }}>
                  <div style={{ 
                    width: '100%', 
                    height: '10px', 
                    backgroundColor: '#ecf0f1',
                    borderRadius: '5px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${porcentajeOcupacion}%`,
                      height: '100%',
                      backgroundColor: colorBarra,
                      transition: 'width 0.5s ease'
                    }} />
                  </div>
                </div>
                <div style={{
                  fontWeight: 'bold',
                  color: colorBarra
                }}>
                  {porcentajeOcupacion}% ocupadas
                </div>
              </div>
            </div>
          );
        })()}
        
        <p>Centros disponibles: {availablePlazas.length}</p>
        <p>Última actualización: {lastProcessed && typeof lastProcessed.getTime === 'function' ? lastProcessed.toLocaleString() : 'No disponible'}</p>
      </div>

      {/* Agregar el Footer */}
      <div style={{ marginTop: '40px' }}>
        <footer style={{
          padding: '20px 15px',
          borderTop: '1px solid #ddd',
          backgroundColor: '#f8f9fa',
          textAlign: 'center',
          color: '#333',
          fontSize: '14px',
          width: '100%',
          position: 'relative',
          display: 'block'
        }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
            <p style={{ margin: '10px 0' }}>Realizado por <a href="https://ag-marketing.es" target="_blank" rel="noopener noreferrer" style={{color: '#18539E', textDecoration: 'none', fontWeight: 'bold'}}>AG-Marketing</a></p>
            <p style={{ margin: '10px 0' }}>© {new Date().getFullYear()} - Todos los derechos reservados</p>
          </div>
        </footer>
      </div>

      {/* Modal de Reasignación */}
      {mostrarModalReasignacion && (
        <div className="modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '25px',
            width: '90%',
            maxWidth: '800px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 5px 15px rgba(0, 0, 0, 0.3)',
            position: 'relative'
          }}>
            <div className="modal-header" style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              borderBottom: '1px solid #eee',
              paddingBottom: '15px'
            }}>
              <h3 style={{ margin: 0, color: '#2c3e50' }}>Reasignar Asignación</h3>
              <button 
                className="modal-close"
                onClick={() => setMostrarModalReasignacion(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '5px'
                }}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body" style={{ marginBottom: '20px' }}>
              {asignacionActual && (
                <div style={{ 
                  marginBottom: '20px',
                  padding: '15px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '5px',
                  border: '1px solid #eee'
                }}>
                  <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>
                    Orden: <span style={{ fontWeight: 'normal' }}>{asignacionActual.numeroOrden || asignacionActual.order}</span>
                  </p>
                  
                  <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>
                    Centro actual: <span style={{ fontWeight: 'normal' }}>{asignacionActual.nombreCentro || asignacionActual.centerName || 'Desconocido'}</span>
                  </p>
                  
                  <div style={{ 
                    backgroundColor: '#e3f2fd', 
                    padding: '10px 15px', 
                    borderRadius: '5px',
                    marginTop: '10px'
                  }}>
                    <p style={{ margin: '0', fontSize: '14px' }}>
                      <strong>Instrucciones:</strong> Seleccione los centros a los que desea reasignar esta plaza en orden de preferencia.
                      El primer centro seleccionado tendrá la mayor prioridad.
                    </p>
                  </div>
                </div>
              )}
              
              <h4 style={{ marginTop: '0', marginBottom: '15px' }}>Seleccione centros disponibles</h4>
              
              <input
                type="text"
                className="search-box"
                placeholder="Buscar centro por nombre, código o municipio..."
                value={searchTermReasignacion}
                onChange={(e) => setSearchTermReasignacion(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 15px',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  marginBottom: '15px',
                  fontSize: '16px'
                }}
              />
              
              {centrosSeleccionadosReasignacion.length > 0 && (
                <div className="selected-centros" style={{
                  marginBottom: '20px',
                  border: '1px solid #e1e1e1',
                  borderRadius: '6px',
                  padding: '15px',
                  backgroundColor: '#f9f9f9'
                }}>
                  <h4 style={{ marginTop: '0', marginBottom: '10px' }}>Centros seleccionados (orden de preferencia)</h4>
                  
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {centrosSeleccionadosReasignacion.map((centroId, index) => {
                      const centro = centrosDisponibles.find(c => c.id === centroId);
                      if (!centro) return null;
                      
                      return (
                        <div key={centroId} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px',
                          marginBottom: '5px',
                          backgroundColor: 'white',
                          borderRadius: '4px',
                          border: '1px solid #eee'
                        }}>
                          <div>
                            <strong style={{ display: 'block' }}>{centro.nombre || centro.centro}</strong>
                            <small>
                              {centro.municipio}
                              {centro.municipio !== centro.localidad && centro.localidad && ` - ${centro.localidad}`}
                            </small>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button
                              onClick={() => moverCentroArriba(index)}
                              disabled={index === 0}
                              style={{
                                padding: '3px 8px',
                                backgroundColor: index === 0 ? '#f0f0f0' : '#f1f8e9',
                                border: '1px solid #ddd',
                                borderRadius: '3px',
                                cursor: index === 0 ? 'default' : 'pointer',
                                color: index === 0 ? '#aaa' : '#333'
                              }}
                            >
                              ↑
                            </button>
                            
                            <button
                              onClick={() => moverCentroAbajo(index)}
                              disabled={index === centrosSeleccionadosReasignacion.length - 1}
                              style={{
                                padding: '3px 8px',
                                backgroundColor: index === centrosSeleccionadosReasignacion.length - 1 ? '#f0f0f0' : '#f1f8e9',
                                border: '1px solid #ddd',
                                borderRadius: '3px',
                                cursor: index === centrosSeleccionadosReasignacion.length - 1 ? 'default' : 'pointer',
                                color: index === centrosSeleccionadosReasignacion.length - 1 ? '#aaa' : '#333'
                              }}
                            >
                              ↓
                            </button>
                            
                            <button
                              onClick={() => toggleSeleccionCentro(centroId)}
                              style={{
                                padding: '3px 8px',
                                backgroundColor: '#ffebee',
                                border: '1px solid #ffcdd2',
                                borderRadius: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              <div style={{ 
                maxHeight: '300px', 
                overflowY: 'auto',
                marginTop: '20px',
                border: '1px solid #eee',
                borderRadius: '5px',
                padding: '10px'
              }}>
                <div className="centros-grid" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                  gap: '15px'
                }}>
                  {centrosFiltrados.map(centro => {
                    const isSelected = centrosSeleccionadosReasignacion.includes(centro.id);
                    
                    return (
                      <div
                        key={centro.id}
                        className={`centro-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleSeleccionCentro(centro.id)}
                        style={{
                          border: '1px solid #eee',
                          borderRadius: '6px',
                          padding: '15px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          backgroundColor: isSelected ? '#e3f2fd' : 'white',
                          borderColor: isSelected ? '#2196f3' : '#eee'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <h4 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>{centro.nombre || centro.centro}</h4>
                          {isSelected && (
                            <span style={{
                              backgroundColor: '#2196f3',
                              color: 'white',
                              borderRadius: '50%',
                              width: '24px',
                              height: '24px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}>
                              {centrosSeleccionadosReasignacion.indexOf(centro.id) + 1}
                            </span>
                          )}
                        </div>
                        
                        <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>
                          <strong>Código:</strong> {centro.codigo || 'N/A'}
                        </div>
                        
                        <div style={{ fontSize: '13px', color: '#666', marginBottom: '5px' }}>
                          <strong>Municipio:</strong> {centro.municipio || 'N/A'}
                          {centro.municipio !== centro.localidad && centro.localidad && ` (${centro.localidad})`}
                        </div>
                        
                        <div style={{ fontSize: '13px', color: '#666' }}>
                          <strong>Plazas disponibles:</strong> {centro.plazasDisponibles || (centro.plazas - centro.asignadas) || 0}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            <div className="modal-footer" style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              borderTop: '1px solid #eee',
              paddingTop: '15px',
              marginTop: '20px'
            }}>
              <button
                onClick={() => setMostrarModalReasignacion(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f1f1f1',
                  color: '#333',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              
              <button
                onClick={confirmarReasignacion}
                disabled={centrosSeleccionadosReasignacion.length === 0 || internalProcessingMessage !== ""}
                style={{
                  padding: '10px 20px',
                  backgroundColor: centrosSeleccionadosReasignacion.length === 0 ? '#ccc' : '#2196f3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: centrosSeleccionadosReasignacion.length === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                {internalProcessingMessage ? (
                  <span className="processing-btn">
                    <span className="processing-indicator"></span>
                    Procesando...
                  </span>
                ) : (
                  `Confirmar Reasignación`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin; 