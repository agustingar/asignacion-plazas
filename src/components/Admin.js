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
  const handleReasignar = async (assignment) => {
    try {
      // Validar la asignación
      if (!assignment) {
        showNotification("Error: Asignación no válida", "error");
        return;
      }
      
      // Guardar la asignación actual para usarla después
      setAsignacionActual(assignment);
      
      // Preparar los centros disponibles para mostrar en el modal
      const centrosConPlazas = availablePlazas
        .filter(plaza => plaza && plaza.plazasDisponibles > 0)
        .sort((a, b) => {
          // Primero ordenar por municipio
          if (a.municipio && b.municipio) {
            const compMunicipio = a.municipio.localeCompare(b.municipio);
            if (compMunicipio !== 0) return compMunicipio;
          }
          
          // Luego por nombre
          return (a.nombre || a.centro || "").localeCompare(b.nombre || b.centro || "");
        });
      
      setCentrosDisponibles(centrosConPlazas);
      setCentrosSeleccionadosReasignacion([]);
      setSearchTermReasignacion('');
      
      // Mostrar el modal
      setMostrarModalReasignacion(true);
    } catch (error) {
      console.error("Error al preparar reasignación:", error);
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
          
          {/* Botón para procesar siguiente */}
          <div style={{ marginBottom: '15px', textAlign: 'center' }}>
            <button
              onClick={async () => {
                try {
                  // Validar que hay solicitudes pendientes
                  if (!solicitudes || solicitudes.length === 0) {
                    showNotification("No hay solicitudes pendientes para procesar", "warning");
                    return;
                  }
                  
                  // Validar que availablePlazas es un array válido
                  if (!Array.isArray(availablePlazas) || availablePlazas.length === 0) {
                    showNotification("La lista de plazas disponibles no es válida", "error");
                    return;
                  }
                  
                  // Mostrar mensaje de procesamiento
                  setInternalProcessingMessage("Procesando siguiente solicitud...");
                  
                  // Obtener la siguiente solicitud a procesar (la primera en orden)
                  const solicitudAProcesorOrdenada = [...solicitudes].sort((a, b) => 
                    Number(a.orden || 0) - Number(b.orden || 0)
                  )[0];
                  
                  if (!solicitudAProcesorOrdenada) {
                    showNotification("Error al encontrar la siguiente solicitud", "error");
                    setInternalProcessingMessage("");
                    return;
                  }
                  
                  console.log("Procesando solicitud:", solicitudAProcesorOrdenada);
                  setInternalProcessingMessage(`Procesando solicitud ${solicitudAProcesorOrdenada.orden || "desconocida"}...`);
                  
                  // Dar tiempo para que la UI se actualice
                  setTimeout(async () => {
                    try {
                      // Importar la función procesarSolicitud directamente
                      const { procesarSolicitud } = await import('../utils/assignmentUtils');
                      
                      // Procesar esta solicitud específica
                      const resultado = await procesarSolicitud(
                        solicitudAProcesorOrdenada, 
                        availablePlazas, 
                        db
                      );
                      
                      console.log("Resultado procesamiento individual:", resultado);
                      
                      // Si fue exitoso, eliminar la solicitud de la lista de pendientes
                      if (resultado.success && solicitudAProcesorOrdenada.docId) {
                        try {
                          setInternalProcessingMessage("Eliminando solicitud procesada...");
                          await deleteDoc(doc(db, "solicitudesPendientes", solicitudAProcesorOrdenada.docId));
                          console.log(`Solicitud con ID ${solicitudAProcesorOrdenada.docId} eliminada correctamente`);
                        } catch (error) {
                          console.error("Error al eliminar solicitud procesada:", error);
                          throw new Error(`Error al eliminar solicitud: ${error.message}`);
                        }
                      }
                      
                      // Recargar datos desde Firebase
                      setInternalProcessingMessage("Actualizando datos...");
                      const datosRecargados = await cargarDatosDesdeFirebase();
                      
                      if (!datosRecargados) {
                        throw new Error("Error al recargar los datos");
                      }
                      
                      // Mostrar notificación según resultado
                      setInternalProcessingMessage("");
                      if (resultado.success) {
                        showNotification(`Solicitud ${solicitudAProcesorOrdenada.orden} procesada correctamente`, "success");
                      } else if (resultado.noAsignable) {
                        showNotification(`No se pudo asignar la solicitud: ${resultado.message}`, "warning");
                      } else {
                        throw new Error(resultado.message || "Error desconocido");
                      }
                    } catch (error) {
                      console.error("Error en el procesamiento asíncrono:", error);
                      setInternalProcessingMessage("");
                      showNotification(`Error en el procesamiento: ${error.message}`, "error");
                    }
                  }, 500);
                } catch (error) {
                  console.error("Error al procesar solicitud:", error);
                  setInternalProcessingMessage("");
                  showNotification(`Error al procesar solicitud: ${error.message}`, "error");
                }
              }}
              style={{
                padding: '12px 20px',
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: internalProcessingMessage ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                width: '280px',
                position: 'relative',
                boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
              }}
              disabled={loadingProcess || internalProcessingMessage !== ""}
            >
              {internalProcessingMessage ? (
                <span className="processing-btn">
                  <span className="processing-indicator"></span>
                  {internalProcessingMessage}
                </span>
              ) : 'Procesar Siguiente Solicitud'}
            </button>
          </div>
        </div>
      </div>
      
      {processingMessage && (
        <div style={{ 
          marginTop: '15px', 
          padding: '10px',
          backgroundColor: '#f8f9fa',
          borderRadius: '5px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
        }}>
          {processingMessage}
        </div>
      )}
      
      {/* Lista de solicitudes pendientes - con buscador */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '20px', 
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ margin: 0 }}>Solicitudes Pendientes</h2>
          <button
            onClick={async () => {
              try {
                setInternalProcessingMessage("Recargando datos...");
                const success = await cargarDatosDesdeFirebase();
                
                if (success) {
                  showNotification("Datos recargados correctamente", "success");
                } else {
                  showNotification("Error al recargar datos", "error");
                }
                
                setInternalProcessingMessage("");
              } catch (error) {
                console.error("Error al recargar datos:", error);
                setInternalProcessingMessage("");
                showNotification(`Error: ${error.message}`, "error");
              }
            }}
            style={{
              padding: '8px 15px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: internalProcessingMessage ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
            disabled={internalProcessingMessage !== ""}
          >
            <span>🔄</span> Recargar Datos
          </button>
        </div>
        
        {/* Botón para procesar siguiente */}
        <div style={{ marginBottom: '15px', textAlign: 'center' }}>
          <button
            onClick={async () => {
              try {
                // Validar que hay solicitudes pendientes
                if (!solicitudes || solicitudes.length === 0) {
                  showNotification("No hay solicitudes pendientes para procesar", "warning");
                  return;
                }
                
                // Validar que availablePlazas es un array válido
                if (!Array.isArray(availablePlazas) || availablePlazas.length === 0) {
                  showNotification("La lista de plazas disponibles no es válida", "error");
                  return;
                }
                
                // Mostrar mensaje de procesamiento
                setInternalProcessingMessage("Procesando siguiente solicitud...");
                
                // Obtener la siguiente solicitud a procesar (la primera en orden)
                const solicitudAProcesorOrdenada = [...solicitudes].sort((a, b) => 
                  Number(a.orden || 0) - Number(b.orden || 0)
                )[0];
                
                if (!solicitudAProcesorOrdenada) {
                  showNotification("Error al encontrar la siguiente solicitud", "error");
                  setInternalProcessingMessage("");
                  return;
                }
                
                console.log("Procesando solicitud:", solicitudAProcesorOrdenada);
                setInternalProcessingMessage(`Procesando solicitud ${solicitudAProcesorOrdenada.orden || "desconocida"}...`);
                
                // Dar tiempo para que la UI se actualice
                setTimeout(async () => {
                  try {
                    // Importar la función procesarSolicitud directamente
                    const { procesarSolicitud } = await import('../utils/assignmentUtils');
                    
                    // Procesar esta solicitud específica
                    const resultado = await procesarSolicitud(
                      solicitudAProcesorOrdenada, 
                      availablePlazas, 
                      db
                    );
                    
                    console.log("Resultado procesamiento individual:", resultado);
                    
                    // Si fue exitoso, eliminar la solicitud de la lista de pendientes
                    if (resultado.success && solicitudAProcesorOrdenada.docId) {
                      try {
                        setInternalProcessingMessage("Eliminando solicitud procesada...");
                        await deleteDoc(doc(db, "solicitudesPendientes", solicitudAProcesorOrdenada.docId));
                        console.log(`Solicitud con ID ${solicitudAProcesorOrdenada.docId} eliminada correctamente`);
                      } catch (error) {
                        console.error("Error al eliminar solicitud procesada:", error);
                        throw new Error(`Error al eliminar solicitud: ${error.message}`);
                      }
                    }
                    
                    // Recargar datos desde Firebase
                    setInternalProcessingMessage("Actualizando datos...");
                    const datosRecargados = await cargarDatosDesdeFirebase();
                    
                    if (!datosRecargados) {
                      throw new Error("Error al recargar los datos");
                    }
                    
                    // Mostrar notificación según resultado
                    setInternalProcessingMessage("");
                    if (resultado.success) {
                      showNotification(`Solicitud ${solicitudAProcesorOrdenada.orden} procesada correctamente`, "success");
                    } else if (resultado.noAsignable) {
                      showNotification(`No se pudo asignar la solicitud: ${resultado.message}`, "warning");
                    } else {
                      throw new Error(resultado.message || "Error desconocido");
                    }
                  } catch (error) {
                    console.error("Error en el procesamiento asíncrono:", error);
                    setInternalProcessingMessage("");
                    showNotification(`Error en el procesamiento: ${error.message}`, "error");
                  }
                }, 500);
              } catch (error) {
                console.error("Error al procesar solicitud:", error);
                setInternalProcessingMessage("");
                showNotification(`Error al procesar solicitud: ${error.message}`, "error");
              }
            }}
            style={{
              padding: '12px 20px',
              backgroundColor: '#27ae60',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: internalProcessingMessage ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              width: '280px',
              position: 'relative',
              boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
            }}
            disabled={loadingProcess || internalProcessingMessage !== ""}
          >
            {internalProcessingMessage ? (
              <span className="processing-btn">
                <span className="processing-indicator"></span>
                {internalProcessingMessage}
              </span>
            ) : 'Procesar Siguiente Solicitud'}
          </button>
        </div>
        
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
      </div>
    </div>
  );
};

export default Admin; 