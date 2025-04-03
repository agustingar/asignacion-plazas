import React, { useState } from 'react';
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
  const [searchTermAsignaciones, setSearchTermAsignaciones] = useState('');
  const [internalProcessingMessage, setInternalProcessingMessage] = useState('');
  const [centrosNuevos, setCentrosNuevos] = useState([]);
  const [mostrarComparacion, setMostrarComparacion] = useState(false);
  const [seleccionados, setSeleccionados] = useState({});
  // Estados para asignación manual
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState(null);
  const [centroSeleccionadoManual, setCentroSeleccionadoManual] = useState("");
  const [modalAsignacionManual, setModalAsignacionManual] = useState(false);
  // Estados para reasignación
  const [asignacionParaReasignar, setAsignacionParaReasignar] = useState(null);
  const [modalReasignacion, setModalReasignacion] = useState(false);
  const [centroSeleccionadoReasignacion, setCentroSeleccionadoReasignacion] = useState("");
  
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
      
      // Buscar en el historial si esta orden tiene centros seleccionados guardados
      const ordenAsignacion = assignment.numeroOrden || assignment.order;

      // Obtener centros seleccionados del historial
      const historialSnapshot = await getDocs(
        query(collection(db, "historialSolicitudes"), where("orden", "==", ordenAsignacion))
      );
      
      // Si no encontramos con orden, intentar con numeroOrden
      let historialData = [];
      historialSnapshot.forEach(doc => {
        historialData.push(doc.data());
      });
      
      // Si no encontramos nada, intentar buscar por numeroOrden
      if (historialData.length === 0) {
        const historialSnapshotAlt = await getDocs(
          query(collection(db, "historialSolicitudes"), where("numeroOrden", "==", ordenAsignacion))
        );
        historialSnapshotAlt.forEach(doc => {
          historialData.push(doc.data());
        });
      }
      
      // Obtener centros seleccionados del historial o usar el centro actual
      let centrosParaSolicitud = [];
      
      historialData.forEach(data => {
        if (data.centrosSeleccionados && Array.isArray(data.centrosSeleccionados)) {
          centrosParaSolicitud = data.centrosSeleccionados;
        }
      });
      
      // Si no encontramos centros en el historial, usar el centro actual como única opción
      if (centrosParaSolicitud.length === 0 && assignment.centerId) {
        centrosParaSolicitud = [assignment.centerId];
      }
      
      // Configurar estados para la reasignación
      setAsignacionParaReasignar({
        ...assignment,
        centrosIdsOriginales: centrosParaSolicitud
      });
      setCentroSeleccionadoReasignacion("");
      setModalReasignacion(true);
      
    } catch (error) {
      console.error("Error al preparar reasignación:", error);
      showNotification(`Error al preparar reasignación: ${error.message}`, "error");
    }
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
  
  // Nueva función para abrir modal de asignación manual
  const abrirModalAsignacionManual = (solicitud) => {
    setSolicitudSeleccionada(solicitud);
    setCentroSeleccionadoManual("");
    setModalAsignacionManual(true);
  };

  // Nueva función para realizar asignación manual
  const realizarAsignacionManual = async () => {
    if (!solicitudSeleccionada || !centroSeleccionadoManual) {
      showNotification("Por favor, seleccione un centro para asignar", "error");
      return;
    }

    try {
      setInternalProcessingMessage("Realizando asignación manual...");

      // Obtener información de la orden y el centro
      // Usar orden o numeroOrden, lo que esté disponible
      const ordenSolicitud = solicitudSeleccionada.orden || solicitudSeleccionada.numeroOrden;
      
      // Verificar que tenemos un número de orden válido
      if (!ordenSolicitud) {
        showNotification("Error: La solicitud no tiene un número de orden válido", "error");
        setInternalProcessingMessage("");
        return;
      }

      const centroInfo = availablePlazas.find(c => c.id === centroSeleccionadoManual);

      if (!centroInfo) {
        showNotification("Centro no encontrado", "error");
        setInternalProcessingMessage("");
        return;
      }

      // Verificar si ya existe una asignación para esta orden
      const asignacionExistente = assignments.find(a => 
        (a.order === ordenSolicitud) || (a.numeroOrden === ordenSolicitud)
      );

      // Crear batch para todas las operaciones
      const batch = writeBatch(db);

      // Si existe una asignación, eliminarla
      if (asignacionExistente && asignacionExistente.docId) {
        batch.delete(doc(db, "asignaciones", asignacionExistente.docId));
      }

      // Crear nueva asignación
      const nuevaAsignacion = {
        order: ordenSolicitud,
        numeroOrden: ordenSolicitud, // Añadir ambos campos para mayor compatibilidad
        centerId: centroInfo.id,
        centerName: centroInfo.nombre || centroInfo.centro,
        localidad: centroInfo.localidad || '',
        municipio: centroInfo.municipio || '',
        centro: centroInfo.nombre || centroInfo.centro,
        timestamp: Date.now(),
        asignacionManual: true
      };

      // Verificar que no haya campos undefined antes de guardar
      Object.keys(nuevaAsignacion).forEach(key => {
        if (nuevaAsignacion[key] === undefined) {
          console.warn(`Campo ${key} es undefined en la asignación. Se establecerá valor predeterminado.`);
          
          // Establecer valores predeterminados según el tipo de campo
          if (key.includes('Id') || key === 'order' || key === 'numeroOrden') {
            nuevaAsignacion[key] = "0"; // ID o número predeterminado como string
          } else if (key === 'timestamp') {
            nuevaAsignacion[key] = Date.now(); // Timestamp actual
          } else if (typeof nuevaAsignacion[key] === 'boolean') {
            nuevaAsignacion[key] = false; // Valor booleano predeterminado
          } else {
            nuevaAsignacion[key] = ""; // String vacío para otros campos
          }
        }
      });

      const asignacionRef = doc(collection(db, "asignaciones"));
      batch.set(asignacionRef, nuevaAsignacion);

      // Guardar en historial con todas las opciones de centros de la solicitud
      const historialData = {
        orden: ordenSolicitud,
        numeroOrden: ordenSolicitud, // Añadir ambos campos para mayor compatibilidad
        centroId: centroInfo.id,
        estado: "ASIGNADA_MANUAL",
        mensaje: `Asignación manual desde panel de administración a ${centroInfo.nombre || centroInfo.centro}`,
        fechaHistorico: new Date().toISOString(),
        timestamp: Date.now(),
        // Guardar todas las opciones de centros de la solicitud
        centrosSeleccionados: solicitudSeleccionada.centrosIds || solicitudSeleccionada.centrosSeleccionados || []
      };

      const historialRef = doc(collection(db, "historialSolicitudes"));
      batch.set(historialRef, historialData);

      // Eliminar la solicitud pendiente si existe
      if (solicitudSeleccionada.docId) {
        batch.delete(doc(db, "solicitudesPendientes", solicitudSeleccionada.docId));
      }

      // Ejecutar todas las operaciones
      await batch.commit();

      // Recargar datos
      await cargarDatosDesdeFirebase();

      showNotification(`Orden ${ordenSolicitud} asignada manualmente a ${centroInfo.nombre || centroInfo.centro}`, "success");
      setModalAsignacionManual(false);
      setSolicitudSeleccionada(null);
    } catch (error) {
      console.error("Error al realizar asignación manual:", error);
      showNotification(`Error: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };

  // Renderizar modal de asignación manual
  const renderModalAsignacionManual = () => {
    if (!solicitudSeleccionada) return null;

    // Obtener los centros seleccionados por el usuario
    const centrosIds = solicitudSeleccionada.centrosIds || 
                        solicitudSeleccionada.centrosSeleccionados || [];
    
    // Filtrar solo los centros seleccionados que existen en availablePlazas
    const centrosDisponibles = availablePlazas.filter(centro => 
      centrosIds.includes(centro.id)
    );

    // Verificar si hay solicitudes con orden menor
    const ordenActual = solicitudSeleccionada.orden || solicitudSeleccionada.numeroOrden || 0;
    const solicitudesMenorOrden = solicitudes.filter(sol => {
      const ordenSol = sol.orden || sol.numeroOrden || 0;
      return ordenSol < ordenActual;
    });

    const hayOrdenMenor = solicitudesMenorOrden.length > 0;
    const soloUnaOpcion = centrosDisponibles.length === 1;

    // Calcular plazas disponibles actualizadas para cada centro
    const centrosConPlazasActualizadas = centrosDisponibles.map(centro => {
      // Contar cuántas asignaciones existen para este centro
      const asignacionesParaCentro = assignments.filter(a => 
        a.centerId === centro.id && 
        !a.noAsignable && 
        a.estado !== "NO_ASIGNABLE" && 
        a.estado !== "REASIGNACION_NO_VIABLE"
      ).length;
      
      // Calcular plazas disponibles
      const plazasTotal = centro.plazasTotal || centro.plazas || 0;
      const plazasOcupadas = centro.plazasOcupadas || centro.asignadas || asignacionesParaCentro || 0;
      const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
      
      return {
        ...centro,
        plazasDisponiblesActualizadas: plazasDisponibles,
        plazasOcupadasActualizadas: plazasOcupadas
      };
    });

    // Verificar si hay al menos un centro con plazas disponibles
    const todosLosCentrosSinPlazas = centrosConPlazasActualizadas.every(c => c.plazasDisponiblesActualizadas <= 0);
    const hayAlMenosUnCentroConPlazas = !todosLosCentrosSinPlazas;

    return (
      <div style={{
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
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '20px',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
        }}>
          <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
            Asignación Manual - Orden #{ordenActual}
          </h3>
          
          {hayOrdenMenor && soloUnaOpcion && (
            <div style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffeeba',
              borderRadius: '4px',
              padding: '12px',
              marginBottom: '15px',
              color: '#856404'
            }}>
              <strong>¡Atención!</strong> Esta solicitud tiene menor prioridad que otras pendientes y solo tiene una opción disponible. 
              Considere procesar primero las solicitudes con número de orden menores.
            </div>
          )}

          {hayOrdenMenor && !soloUnaOpcion && (
            <div style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffeeba',
              borderRadius: '4px',
              padding: '12px',
              marginBottom: '15px',
              color: '#856404'
            }}>
              <strong>Aviso:</strong> Existen solicitudes con número de orden menor pendientes.
            </div>
          )}
          
          <p style={{ marginBottom: '20px' }}>
            Seleccione uno de los centros preferidos por el usuario para realizar la asignación manual:
          </p>
          
          <div style={{ marginBottom: '20px' }}>
            <h4>Centros seleccionados por el usuario:</h4>
            {centrosConPlazasActualizadas.length > 0 ? (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: '10px',
                maxHeight: '300px',
                overflow: 'auto',
                padding: '10px',
                border: '1px solid #eee',
                borderRadius: '5px'
              }}>
                {centrosConPlazasActualizadas.map((centro, index) => {
                  const sinPlazas = centro.plazasDisponiblesActualizadas <= 0;
                  
                  return (
                    <div key={centro.id} style={{
                      padding: '10px',
                      borderRadius: '5px',
                      border: '1px solid #ddd',
                      backgroundColor: centroSeleccionadoManual === centro.id 
                        ? '#e3f2fd' 
                        : sinPlazas 
                          ? '#ffebee' 
                          : 'white',
                      cursor: sinPlazas ? 'not-allowed' : 'pointer',
                      opacity: sinPlazas ? 0.7 : 1
                    }} onClick={() => {
                      if (!sinPlazas) setCentroSeleccionadoManual(centro.id);
                    }}>
                      <div style={{ fontWeight: 'bold' }}>
                        {index + 1}. {centro.nombre || centro.centro}
                      </div>
                      <div style={{ fontSize: '14px', color: '#666' }}>
                        {centro.localidad && `${centro.localidad}`}
                        {centro.municipio && centro.municipio !== centro.localidad && ` - ${centro.municipio}`}
                      </div>
                      <div style={{ 
                        fontSize: '14px', 
                        marginTop: '5px',
                        color: sinPlazas ? '#d32f2f' : '#388e3c',
                        fontWeight: 'bold'
                      }}>
                        Plazas: <strong>{centro.plazasDisponiblesActualizadas}</strong> disponibles 
                        de {centro.plazasTotal || centro.plazas || 0}
                        {sinPlazas && ' - SIN PLAZAS DISPONIBLES'}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#d32f2f', padding: '10px', textAlign: 'center' }}>
                No hay centros disponibles para esta solicitud.
              </div>
            )}
          </div>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            gap: '10px',
            borderTop: '1px solid #eee',
            paddingTop: '15px'
          }}>
            {todosLosCentrosSinPlazas && (
              <div style={{ 
                marginRight: 'auto', 
                color: '#d32f2f', 
                fontWeight: 'bold',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center'
              }}>
                ⚠️ No hay plazas disponibles en ningún centro seleccionado
              </div>
            )}
            <button 
              onClick={() => setModalAsignacionManual(false)}
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
            {todosLosCentrosSinPlazas && (
              <button 
                onClick={marcarNoAsignable}
                style={{
                  padding: '8px 15px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: '#f44336',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                No se puede asignar
              </button>
            )}
            <button 
              onClick={realizarAsignacionManual}
              disabled={!centroSeleccionadoManual}
              style={{
                padding: '8px 15px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: centroSeleccionadoManual ? '#2196f3' : '#cccccc',
                color: 'white',
                cursor: centroSeleccionadoManual ? 'pointer' : 'not-allowed'
              }}
            >
              Asignar
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Renderizar sección de solicitudes pendientes
  const renderSolicitudesPendientes = () => {
    // Ordenar solicitudes por número de orden (menor a mayor)
    const solicitudesOrdenadas = [...solicitudes].sort((a, b) => {
      const ordenA = a.orden || a.numeroOrden || 0;
      const ordenB = b.orden || b.numeroOrden || 0;
      return ordenA - ordenB;
    });
    
    // Filtrar solicitudes pendientes
    const solicitudesFiltradas = solicitudesOrdenadas.filter(sol => 
      !searchTermSolicitudes || 
      (sol.orden && sol.orden.toString().includes(searchTermSolicitudes)) ||
      (sol.numeroOrden && sol.numeroOrden.toString().includes(searchTermSolicitudes))
    );

    return (
      <div style={{ marginTop: '30px' }}>
        <h3>Solicitudes Pendientes</h3>
        
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            placeholder="Buscar por número de orden..."
            value={searchTermSolicitudes}
            onChange={(e) => setSearchTermSolicitudes(e.target.value)}
            style={{ 
              width: '100%',
              padding: '10px',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}
          />
        </div>
        
        {solicitudesFiltradas.length === 0 ? (
          <div style={{ 
            padding: '20px', 
            textAlign: 'center', 
            color: '#666',
            backgroundColor: '#f9f9f9',
            borderRadius: '4px'
          }}>
            No hay solicitudes pendientes
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Prioridad</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Nº Orden</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Fecha</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Centros Disponibles</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {solicitudesFiltradas.map((solicitud, idx) => {
                  // Obtener centros seleccionados
                  const centrosIds = solicitud.centrosIds || solicitud.centrosSeleccionados || [];
                  
                  // Formatear fecha correctamente, con manejo de error
                  let fechaFormateada = 'Fecha no disponible';
                  try {
                    // Verificar si el timestamp es un número (timestamp de epoch)
                    if (typeof solicitud.timestamp === 'number') {
                      const fecha = new Date(solicitud.timestamp);
                      if (!isNaN(fecha.getTime())) {
                        fechaFormateada = fecha.toLocaleDateString() + ' ' + fecha.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                      }
                    } 
                    // Verificar si es una cadena de fecha ISO
                    else if (typeof solicitud.timestamp === 'string') {
                      const fecha = new Date(solicitud.timestamp);
                      if (!isNaN(fecha.getTime())) {
                        fechaFormateada = fecha.toLocaleDateString() + ' ' + fecha.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                      }
                    }
                    // Verificar si hay una propiedad fechaSolicitud
                    else if (solicitud.fechaSolicitud) {
                      const fecha = new Date(solicitud.fechaSolicitud);
                      if (!isNaN(fecha.getTime())) {
                        fechaFormateada = fecha.toLocaleDateString() + ' ' + fecha.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                      }
                    }
                  } catch (error) {
                    console.warn("Error al formatear fecha:", error);
                  }
                  
                  // Obtener información de los centros
                  const centrosSeleccionados = centrosIds
                    .map(centroId => {
                      const centro = availablePlazas.find(p => p.id === centroId);
                      if (!centro) return null;
                      
                      // Calcular plazas disponibles
                      const plazasTotal = centro.plazasTotal || centro.plazas || 0;
                      const asignacionesParaCentro = assignments.filter(a => 
                        a.centerId === centroId && 
                        !a.noAsignable && 
                        a.estado !== "NO_ASIGNABLE" && 
                        a.estado !== "REASIGNACION_NO_VIABLE"
                      ).length;
                      const plazasOcupadas = centro.plazasOcupadas || centro.asignadas || asignacionesParaCentro || 0;
                      const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
                      
                      return {
                        ...centro,
                        plazasDisponiblesActualizadas: plazasDisponibles,
                        plazasOcupadasActualizadas: plazasOcupadas
                      };
                    })
                    .filter(Boolean);
                  
                  // Verificar si hay centros con plazas disponibles
                  const centrosConPlazas = centrosSeleccionados.filter(c => c.plazasDisponiblesActualizadas > 0);
                  const hayCentrosDisponibles = centrosConPlazas.length > 0;
                  
                  // Verificar si es la solicitud con menor número
                  const ordenActual = solicitud.orden || solicitud.numeroOrden || 0;
                  const esPrioritaria = idx === 0;
                  
                  // Determinar el estado de prioridad para estilizado
                  let prioridadEstilo = {
                    color: '#666',
                    backgroundColor: '#f5f5f5',
                    label: 'Normal'
                  };
                  
                  if (esPrioritaria) {
                    prioridadEstilo = {
                      color: 'white',
                      backgroundColor: '#4caf50',
                      label: 'Alta'
                    };
                  } else if (ordenActual <= 50) {
                    prioridadEstilo = {
                      color: 'white',
                      backgroundColor: '#ff9800',
                      label: 'Media'
                    };
                  }
                  
                  return (
                    <tr key={solicitud.docId || idx} style={{ 
                      borderBottom: '1px solid #eee',
                      backgroundColor: esPrioritaria ? '#f1f8e9' : ''
                    }}>
                      <td style={{ padding: '10px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          backgroundColor: prioridadEstilo.backgroundColor,
                          color: prioridadEstilo.color
                        }}>
                          {prioridadEstilo.label}
                        </span>
                      </td>
                      <td style={{ 
                        padding: '10px',
                        fontWeight: esPrioritaria ? 'bold' : 'normal'
                      }}>
                        {ordenActual}
                      </td>
                      <td style={{ padding: '10px' }}>
                        {fechaFormateada}
                      </td>
                      <td style={{ padding: '10px' }}>
                        {centrosSeleccionados.length > 0 ? (
                          <div>
                            <div style={{ marginBottom: '5px' }}>
                              <strong>{centrosConPlazas.length}</strong> centros con plazas de <strong>{centrosSeleccionados.length}</strong> seleccionados
                            </div>
                            <ul style={{ margin: '0', paddingLeft: '20px' }}>
                              {centrosSeleccionados.slice(0, 3).map((centro, i) => {
                                const tieneDisponibles = centro.plazasDisponiblesActualizadas > 0;
                                return (
                                  <li key={i} style={{
                                    color: tieneDisponibles ? 'inherit' : '#d32f2f',
                                    marginBottom: '4px'
                                  }}>
                                    <div>
                                      <strong>{centro.nombre || centro.centro}</strong>
                                      {tieneDisponibles ? (
                                        <span style={{ 
                                          color: '#388e3c', 
                                          fontSize: '12px',
                                          fontWeight: 'bold',
                                          marginLeft: '5px'
                                        }}>
                                          ({centro.plazasDisponiblesActualizadas} plazas)
                                        </span>
                                      ) : (
                                        <span style={{ 
                                          color: '#d32f2f', 
                                          fontSize: '12px',
                                          fontWeight: 'bold',
                                          marginLeft: '5px'
                                        }}>
                                          (Sin plazas)
                                        </span>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                              {centrosSeleccionados.length > 3 && (
                                <li>Y {centrosSeleccionados.length - 3} más...</li>
                              )}
                            </ul>
                          </div>
                        ) : (
                          <span style={{ color: '#999' }}>Sin centros seleccionados</span>
                        )}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button
                          onClick={() => abrirModalAsignacionManual(solicitud)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: hayCentrosDisponibles ? '#4caf50' : '#cccccc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: hayCentrosDisponibles ? 'pointer' : 'not-allowed',
                            marginRight: '5px'
                          }}
                          title={hayCentrosDisponibles ? "Asignar manualmente" : "No hay centros con plazas disponibles"}
                          disabled={!hayCentrosDisponibles}
                        >
                          Asignar Manual
                        </button>
                        {!hayCentrosDisponibles && (
                          <div style={{ 
                            fontSize: '11px', 
                            color: '#d32f2f', 
                            marginTop: '5px',
                            fontWeight: 'bold' 
                          }}>
                            Sin centros disponibles
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // Renderizar sección de asignaciones existentes
  const renderAsignacionesExistentes = () => {
    // Filtrar asignaciones por búsqueda
    const asignacionesFiltradas = assignments.filter(asig => 
      !searchTermAsignaciones || 
      (asig.order && asig.order.toString().includes(searchTermAsignaciones)) ||
      (asig.numeroOrden && asig.numeroOrden.toString().includes(searchTermAsignaciones)) ||
      (asig.centro && asig.centro.toLowerCase().includes(searchTermAsignaciones.toLowerCase())) ||
      (asig.nombreCentro && asig.nombreCentro.toLowerCase().includes(searchTermAsignaciones.toLowerCase()))
    );

    return (
      <div style={{ marginTop: '30px' }}>
        <h3>Asignaciones Realizadas</h3>
        
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            placeholder="Buscar por número de orden o centro..."
            value={searchTermAsignaciones}
            onChange={(e) => setSearchTermAsignaciones(e.target.value)}
            style={{ 
              width: '100%',
              padding: '10px',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}
          />
        </div>
        
        {asignacionesFiltradas.length === 0 ? (
          <div style={{ 
            padding: '20px', 
            textAlign: 'center', 
            color: '#666',
            backgroundColor: '#f9f9f9',
            borderRadius: '4px'
          }}>
            No hay asignaciones que coincidan con la búsqueda
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Nº Orden</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Centro Asignado</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Plazas</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Fecha Asignación</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {asignacionesFiltradas.map((asignacion, idx) => {
                  // Determinar el número de orden (puede estar en order o numeroOrden)
                  const numeroOrden = asignacion.order || asignacion.numeroOrden;
                  
                  // Determinar si es una asignación especial "no asignable"
                  const esNoAsignable = asignacion.noAsignable === true || asignacion.estado === "NO_ASIGNABLE";
                  const esReasignacionNoViable = asignacion.estado === "REASIGNACION_NO_VIABLE";
                  
                  // Determinar el nombre del centro
                  const nombreCentro = esNoAsignable 
                    ? "No hay plaza disponible" 
                    : asignacion.nombreCentro || asignacion.centro || asignacion.centerName || 'Centro sin nombre';
                  
                  // Obtener información completa del centro para mostrar plazas
                  const centroCompleto = !esNoAsignable ? availablePlazas.find(c => c.id === asignacion.centerId) : null;
                  
                  // Calcular plazas
                  const plazasTotal = centroCompleto ? (centroCompleto.plazasTotal || centroCompleto.plazas || 0) : 0;
                  const asignacionesParaCentro = centroCompleto ? 
                    assignments.filter(a => 
                      a.centerId === asignacion.centerId && 
                      !a.noAsignable && 
                      a.estado !== "NO_ASIGNABLE" && 
                      a.estado !== "REASIGNACION_NO_VIABLE"
                    ).length 
                    : 0;
                  const plazasOcupadas = centroCompleto ? 
                    (centroCompleto.plazasOcupadas || centroCompleto.asignadas || asignacionesParaCentro || 0) : 
                    asignacionesParaCentro;
                  const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
                  
                  // Formatear fecha
                  const fecha = new Date(asignacion.timestamp);
                  const fechaFormateada = fecha && !isNaN(fecha.getTime())
                    ? fecha.toLocaleDateString() + ' ' + fecha.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                    : 'Fecha no disponible';
                  
                  return (
                    <tr key={asignacion.docId || idx} style={{ 
                      borderBottom: '1px solid #eee',
                      backgroundColor: esNoAsignable ? '#ffebee' : esReasignacionNoViable ? '#fff8e1' : ''
                    }}>
                      <td style={{ padding: '10px' }}>{numeroOrden}</td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ 
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center'
                        }}>
                          {nombreCentro}
                          {esNoAsignable && (
                            <span style={{
                              backgroundColor: '#f44336',
                              color: 'white',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              fontSize: '11px',
                              marginLeft: '8px'
                            }}>
                              No asignable
                            </span>
                          )}
                          {esReasignacionNoViable && (
                            <span style={{
                              backgroundColor: '#ff9800',
                              color: 'white',
                              padding: '2px 6px',
                              borderRadius: '3px',
                              fontSize: '11px',
                              marginLeft: '8px'
                            }}>
                              Reasignación no viable
                            </span>
                          )}
                        </div>
                        {!esNoAsignable && (
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            {asignacion.localidad && `${asignacion.localidad}`}
                            {asignacion.municipio && asignacion.municipio !== asignacion.localidad && ` - ${asignacion.municipio}`}
                          </div>
                        )}
                        {esNoAsignable && (
                          <div style={{ fontSize: '12px', color: '#d32f2f' }}>
                            No hay plazas disponibles en ningún centro seleccionado
                          </div>
                        )}
                        {esReasignacionNoViable && (
                          <div style={{ fontSize: '12px', color: '#e65100' }}>
                            {asignacion.mensajeReasignacion || "No fue posible reasignar por falta de plazas"}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px' }}>
                        {!esNoAsignable ? (
                          <div>
                            <div style={{ 
                              color: plazasDisponibles === 0 ? '#d32f2f' : plazasDisponibles < 3 ? '#ff9800' : '#388e3c',
                              fontWeight: 'bold',
                              fontSize: '13px'
                            }}>
                              {plazasDisponibles} disponibles / {plazasTotal} totales
                            </div>
                            <div style={{ fontSize: '12px', color: '#666' }}>
                              {plazasOcupadas} plazas ocupadas
                            </div>
                          </div>
                        ) : (
                          <div style={{ color: '#d32f2f', fontWeight: 'bold', fontSize: '13px' }}>
                            Sin plazas
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px' }}>{fechaFormateada}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        {!esNoAsignable ? (
                          <button
                            onClick={() => handleReasignar(asignacion)}
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
          </div>
        )}
      </div>
    );
  };

  // Renderizar sección de resumen de plazas disponibles
  const renderResumenPlazasDisponibles = () => {
    // Calcular el total de plazas disponibles y ocupadas
    let totalPlazasDisponibles = 0;
    let totalPlazasOcupadas = 0;
    
    assignments.forEach(asignacion => {
      if (!asignacion.noAsignable) {
        const centro = availablePlazas.find(c => c.id === asignacion.centerId);
        if (centro) {
          const plazasTotal = centro.plazasTotal || centro.plazas || 0;
          const plazasOcupadas = centro.plazasOcupadas || centro.asignadas || 0;
          const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
          
          totalPlazasDisponibles += plazasDisponibles;
          totalPlazasOcupadas += plazasOcupadas;
        }
      }
    });

    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        marginTop: '30px'
      }}>
        <h3 style={{ marginBottom: '15px', color: '#2c3e50' }}>Resumen de Plazas Disponibles</h3>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <strong>Total de plazas disponibles:</strong> {totalPlazasDisponibles}
          </div>
          <div>
            <strong>Total de plazas ocupadas:</strong> {totalPlazasOcupadas}
          </div>
        </div>
      </div>
    );
  };

  // Función para realizar la reasignación después de seleccionar nuevo centro
  const realizarReasignacion = async () => {
    if (!asignacionParaReasignar || !centroSeleccionadoReasignacion) {
      showNotification("Por favor, seleccione un centro para reasignar", "error");
      return;
    }

    try {
      setInternalProcessingMessage("Realizando reasignación...");

      // Obtener información de la orden y el centro
      const ordenAsignacion = asignacionParaReasignar.order || asignacionParaReasignar.numeroOrden;
      const asignacionId = asignacionParaReasignar.docId || asignacionParaReasignar.id;
      
      // Validar datos necesarios
      if (!ordenAsignacion) {
        showNotification("Error: No se pudo obtener el número de orden", "error");
        setInternalProcessingMessage("");
        return;
      }
      
      if (!asignacionId) {
        showNotification("Error: No se pudo obtener el ID de la asignación", "error");
        setInternalProcessingMessage("");
        return;
      }

      // Obtener información del nuevo centro
      const nuevoCentroInfo = availablePlazas.find(c => c.id === centroSeleccionadoReasignacion);
      if (!nuevoCentroInfo) {
        showNotification("Error: Información del nuevo centro no encontrada", "error");
        setInternalProcessingMessage("");
        return;
      }

      // Obtener información del centro actual para guardarla como origen
      const centroActualNombre = asignacionParaReasignar.centro || 
                              asignacionParaReasignar.centerName || 
                              asignacionParaReasignar.nombreCentro || 
                              'Centro desconocido';

      // Crear batch para todas las operaciones
      const batch = writeBatch(db);

      // Eliminar la asignación existente
      const asignacionRef = doc(db, "asignaciones", asignacionId);
      batch.delete(asignacionRef);

      // Crear nueva asignación con el nuevo centro
      const nuevaAsignacion = {
        order: ordenAsignacion,
        numeroOrden: ordenAsignacion,
        centerId: nuevoCentroInfo.id,
        centerName: nuevoCentroInfo.nombre || nuevoCentroInfo.centro,
        centro: nuevoCentroInfo.nombre || nuevoCentroInfo.centro,
        nombreCentro: nuevoCentroInfo.nombre || nuevoCentroInfo.centro,
        localidad: nuevoCentroInfo.localidad || '',
        municipio: nuevoCentroInfo.municipio || '',
        timestamp: Date.now(),
        asignacionManual: true,
        reasignado: true,
        centroOriginal: centroActualNombre,     // Guardar el nombre del centro original
        centroPrevio: centroActualNombre        // Guardar también en centroPrevio para compatibilidad
      };

      // Validar y asegurar que no hay campos undefined
      Object.keys(nuevaAsignacion).forEach(key => {
        if (nuevaAsignacion[key] === undefined) {
          console.warn(`Campo ${key} es undefined en la asignación. Se establecerá valor predeterminado.`);
          
          // Establecer valores predeterminados según el tipo
          if (key.includes('Id') || key === 'order' || key === 'numeroOrden') {
            nuevaAsignacion[key] = "0";
          } else if (key === 'timestamp') {
            nuevaAsignacion[key] = Date.now();
          } else if (typeof nuevaAsignacion[key] === 'boolean') {
            nuevaAsignacion[key] = false;
          } else {
            nuevaAsignacion[key] = "";
          }
        }
      });

      // Crear nueva asignación
      const nuevaAsignacionRef = doc(collection(db, "asignaciones"));
      batch.set(nuevaAsignacionRef, nuevaAsignacion);

      // Registrar en historial
      const ahora = new Date();
      const historialData = {
        orden: ordenAsignacion,
        numeroOrden: ordenAsignacion,
        centroId: nuevoCentroInfo.id,
        estado: "REASIGNADO",
        mensaje: `Reasignación manual desde panel de administración de ${centroActualNombre} a ${nuevoCentroInfo.nombre || nuevoCentroInfo.centro}`,
        fechaHistorico: ahora.toISOString(),
        timestamp: ahora.getTime(),
        centroOriginal: centroActualNombre,
        centroAsignado: nuevoCentroInfo.nombre || nuevoCentroInfo.centro
      };

      // Guardar centro anterior
      if (asignacionParaReasignar.centerId) {
        historialData.centroIdAnterior = asignacionParaReasignar.centerId;
      }

      const historialRef = doc(collection(db, "historialSolicitudes"));
      batch.set(historialRef, historialData);

      // Ejecutar todas las operaciones
      await batch.commit();

      // Recargar datos
      await cargarDatosDesdeFirebase();

      showNotification(`Asignación #${ordenAsignacion} reasignada de ${centroActualNombre} a ${nuevoCentroInfo.nombre || nuevoCentroInfo.centro}`, "success");
      setModalReasignacion(false);
      setAsignacionParaReasignar(null);
      setCentroSeleccionadoReasignacion("");
    } catch (error) {
      console.error("Error al realizar reasignación:", error);
      showNotification(`Error al reasignar: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };

  // Función para marcar una solicitud como no asignable
  const marcarNoAsignable = async () => {
    if (!solicitudSeleccionada) {
      showNotification("Error: No hay solicitud seleccionada", "error");
      return;
    }

    try {
      setInternalProcessingMessage("Procesando solicitud no asignable...");
      
      // Obtener datos de la solicitud
      const ordenSolicitud = solicitudSeleccionada.orden || solicitudSeleccionada.numeroOrden;
      const docId = solicitudSeleccionada.docId;
      
      if (!ordenSolicitud) {
        showNotification("Error: La solicitud no tiene número de orden", "error");
        setInternalProcessingMessage("");
        return;
      }
      
      if (!docId) {
        showNotification("Error: La solicitud no tiene identificador", "error");
        setInternalProcessingMessage("");
        return;
      }
      
      // Usar batch para operaciones atómicas
      const batch = writeBatch(db);
      
      // MODIFICACIÓN: Crear una entrada en asignaciones para que el usuario pueda ver su estado
      const nuevaAsignacion = {
        order: ordenSolicitud,
        numeroOrden: ordenSolicitud,
        noAsignable: true,  // Nuevo campo para identificar estas asignaciones especiales
        estado: "NO_ASIGNABLE",
        centro: "No hay plaza disponible",
        centerName: "No hay plaza disponible",
        nombreCentro: "No hay plaza disponible",
        mensaje: "No hay plazas disponibles en ninguno de los centros seleccionados",
        timestamp: Date.now(),
        asignacionManual: true
      };
      
      const asignacionRef = doc(collection(db, "asignaciones"));
      batch.set(asignacionRef, nuevaAsignacion);
      
      // Crear registro en historial
      const ahora = new Date();
      const historialData = {
        orden: ordenSolicitud,
        numeroOrden: ordenSolicitud,
        estado: "NO_ASIGNABLE",
        mensaje: "No hay plazas disponibles en ninguno de los centros seleccionados",
        fechaHistorico: ahora.toISOString(),
        timestamp: ahora.getTime(),
        // Guardar todas las opciones de centros seleccionados
        centrosSeleccionados: solicitudSeleccionada.centrosIds || solicitudSeleccionada.centrosSeleccionados || []
      };
      
      const historialRef = doc(collection(db, "historialSolicitudes"));
      batch.set(historialRef, historialData);
      
      // Eliminar la solicitud pendiente
      batch.delete(doc(db, "solicitudesPendientes", docId));
      
      // Ejecutar los cambios
      await batch.commit();
      
      // Recargar datos
      await cargarDatosDesdeFirebase();
      
      showNotification(`Solicitud ${ordenSolicitud} marcada como no asignable por falta de opciones`, "info");
      setModalAsignacionManual(false);
      setSolicitudSeleccionada(null);
    } catch (error) {
      console.error("Error al marcar como no asignable:", error);
      showNotification(`Error: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };

  // Función para marcar una reasignación como no asignable
  const marcarReasignacionNoAsignable = async () => {
    if (!asignacionParaReasignar) {
      showNotification("Error: No hay asignación seleccionada", "error");
      return;
    }

    try {
      setInternalProcessingMessage("Procesando reasignación no viable...");
      
      // Obtener datos de la asignación
      const ordenAsignacion = asignacionParaReasignar.order || asignacionParaReasignar.numeroOrden;
      const asignacionId = asignacionParaReasignar.docId || asignacionParaReasignar.id;
      const centroActual = asignacionParaReasignar.centro || asignacionParaReasignar.centerName || 'Centro desconocido';
      
      if (!ordenAsignacion) {
        showNotification("Error: La asignación no tiene número de orden", "error");
        setInternalProcessingMessage("");
        return;
      }
      
      if (!asignacionId) {
        showNotification("Error: La asignación no tiene identificador", "error");
        setInternalProcessingMessage("");
        return;
      }
      
      // Usar batch para operaciones atómicas
      const batch = writeBatch(db);
      
      // MODIFICACIÓN: Actualizar la asignación existente con información sobre el intento de reasignación
      const asignacionActualizada = {
        intentoReasignacion: true,
        fechaIntentoReasignacion: new Date().toISOString(),
        mensajeReasignacion: "Reasignación no viable por falta de plazas disponibles",
        estado: "REASIGNACION_NO_VIABLE"
      };
      
      // Actualizar la asignación existente
      const asignacionRef = doc(db, "asignaciones", asignacionId);
      batch.update(asignacionRef, asignacionActualizada);
      
      // Crear registro en historial
      const ahora = new Date();
      const historialData = {
        orden: ordenAsignacion,
        numeroOrden: ordenAsignacion,
        estado: "REASIGNACION_NO_VIABLE",
        centroId: asignacionParaReasignar.centerId,
        mensaje: `No es posible reasignar. Se mantiene en ${centroActual} por falta de opciones disponibles`,
        fechaHistorico: ahora.toISOString(),
        timestamp: ahora.getTime(),
        // Guardar las opciones de centros originales
        centrosSeleccionados: asignacionParaReasignar.centrosIdsOriginales || []
      };
      
      const historialRef = doc(collection(db, "historialSolicitudes"));
      batch.set(historialRef, historialData);
      
      // Ejecutar los cambios
      await batch.commit();
      
      // Recargar datos
      await cargarDatosDesdeFirebase();
      
      showNotification(`Se mantiene la asignación de ${ordenAsignacion} en ${centroActual} por falta de alternativas`, "info");
      setModalReasignacion(false);
      setAsignacionParaReasignar(null);
      setCentroSeleccionadoReasignacion("");
    } catch (error) {
      console.error("Error al mantener asignación:", error);
      showNotification(`Error: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };

  // Renderizar el panel de administración principal con los botones de acción rápida
  const renderAccionesRapidas = () => {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h3 style={{ margin: 0, marginBottom: '15px', color: '#2c3e50' }}>Acciones Rápidas</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={async () => {
              // Solicitar confirmación para procesar todas las solicitudes
              if (window.confirm("¿Está seguro de que desea procesar todas las solicitudes pendientes manualmente? Esta acción asignará plazas automáticamente en base a las preferencias de los usuarios.")) {
                // Ejecutar procesamiento de todas las solicitudes
                await procesarTodasLasSolicitudes({ respetarAsignacionesExistentes: false });
                // Recargar datos
                await cargarDatosDesdeFirebase();
              }
            }}
            style={{
              padding: '8px 12px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
            disabled={loadingProcess}
          >
            {loadingProcess ? 'Procesando...' : 'Procesar Todas las Solicitudes (Manual)'}
          </button>
          
          <button
            onClick={async () => {
              // Recargar datos
              setInternalProcessingMessage("Recargando datos...");
              try {
                await cargarDatosDesdeFirebase();
                showNotification("Datos recargados correctamente", "success");
              } catch (error) {
                showNotification("Error al recargar datos: " + error.message, "error");
              } finally {
                setInternalProcessingMessage("");
              }
            }}
            style={{
              padding: '8px 12px',
              backgroundColor: '#2ecc71',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Recargar Datos
          </button>
          
          <button
            onClick={async () => {
              // Solicitar confirmación para eliminar duplicados
              if (window.confirm("¿Está seguro de que desea eliminar las asignaciones y solicitudes duplicadas? Esta acción no se puede deshacer.")) {
                // Mostrar mensaje de procesamiento
                setInternalProcessingMessage("Eliminando duplicados...");
                try {
                  // Eliminar solicitudes y asignaciones duplicadas
                  const resultadoSolicitudes = await eliminarSolicitudesDuplicadas();
                  
                  // Eliminar duplicados en historial
                  const resultadoHistorial = await limpiarDuplicadosHistorial();
                  
                  // Recargar datos
                  await cargarDatosDesdeFirebase();
                  
                  // Mostrar resultado
                  showNotification(
                    `Limpieza completada: Se eliminaron ${resultadoSolicitudes.eliminadosAsignaciones} asignaciones, ${resultadoSolicitudes.eliminadosSolicitudes} solicitudes y ${resultadoHistorial.eliminados} entradas de historial duplicadas`, 
                    "success"
                  );
                } catch (error) {
                  console.error("Error al eliminar duplicados:", error);
                  showNotification(`Error al eliminar duplicados: ${error.message}`, "error");
                } finally {
                  setInternalProcessingMessage("");
                }
              }
            }}
            style={{
              padding: '8px 12px',
              backgroundColor: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
          >
            Eliminar Duplicados
          </button>
        </div>
      </div>
    );
  };

  // Renderizar modal de reasignación
  const renderModalReasignacion = () => {
    if (!asignacionParaReasignar) return null;

    // Obtener los centros seleccionados para la reasignación
    const centrosIds = asignacionParaReasignar.centrosIdsOriginales || [];
    
    // Filtrar solo los centros seleccionados que existen en availablePlazas
    const centrosDisponibles = availablePlazas.filter(centro => 
      centrosIds.includes(centro.id)
    );

    // Calcular plazas disponibles actualizadas para cada centro
    const centrosConPlazasActualizadas = centrosDisponibles.map(centro => {
      // Contar cuántas asignaciones existen para este centro
      const asignacionesParaCentro = assignments.filter(a => 
        a.centerId === centro.id && 
        !a.noAsignable && 
        a.estado !== "NO_ASIGNABLE" && 
        a.estado !== "REASIGNACION_NO_VIABLE"
      ).length;
      
      // Calcular plazas disponibles
      const plazasTotal = centro.plazasTotal || centro.plazas || 0;
      const plazasOcupadas = centro.plazasOcupadas || centro.asignadas || asignacionesParaCentro || 0;
      const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
      
      return {
        ...centro,
        plazasDisponiblesActualizadas: plazasDisponibles,
        plazasOcupadasActualizadas: plazasOcupadas
      };
    });

    // Verificar si hay al menos un centro con plazas disponibles (diferente del actual)
    const centroActualId = asignacionParaReasignar.centerId;
    const centrosDisponiblesParaReasignacion = centrosConPlazasActualizadas.filter(
      c => c.id !== centroActualId && c.plazasDisponiblesActualizadas > 0
    );
    const noHayCentrosDisponiblesParaReasignacion = centrosDisponiblesParaReasignacion.length === 0;

    // Obtener información de la orden actual
    const ordenActual = asignacionParaReasignar.order || asignacionParaReasignar.numeroOrden || 0;
    const centroActual = asignacionParaReasignar.centro || asignacionParaReasignar.centerName || 'Centro desconocido';

    return (
      <div style={{
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
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '20px',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
        }}>
          <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
            Reasignación - Orden #{ordenActual}
          </h3>
          
          <div style={{
            backgroundColor: '#e8f4fd',
            border: '1px solid #bedcf3',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '15px',
            color: '#0d4c8c'
          }}>
            <strong>Centro actual:</strong> {centroActual}
          </div>
          
          <p style={{ marginBottom: '20px' }}>
            Seleccione un nuevo centro para reasignar directamente esta solicitud:
          </p>
          
          <div style={{ marginBottom: '20px' }}>
            <h4>Centros disponibles:</h4>
            {centrosConPlazasActualizadas.length > 0 ? (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: '10px',
                maxHeight: '300px',
                overflow: 'auto',
                padding: '10px',
                border: '1px solid #eee',
                borderRadius: '5px'
              }}>
                {centrosConPlazasActualizadas.map((centro, index) => {
                  const sinPlazas = centro.plazasDisponiblesActualizadas <= 0;
                  const esActual = centro.id === asignacionParaReasignar.centerId;
                  
                  return (
                    <div key={centro.id} style={{
                      padding: '10px',
                      borderRadius: '5px',
                      border: esActual ? '2px solid #ffb74d' : '1px solid #ddd',
                      backgroundColor: centroSeleccionadoReasignacion === centro.id 
                        ? '#e3f2fd' 
                        : esActual
                          ? '#fff8e1'
                          : sinPlazas 
                            ? '#ffebee' 
                            : 'white',
                      cursor: sinPlazas ? 'not-allowed' : 'pointer',
                      opacity: sinPlazas ? 0.7 : 1
                    }} onClick={() => {
                      if (!sinPlazas) setCentroSeleccionadoReasignacion(centro.id);
                    }}>
                      <div style={{ 
                        fontWeight: 'bold',
                        display: 'flex',
                        justifyContent: 'space-between'
                      }}>
                        <span>{index + 1}. {centro.nombre || centro.centro}</span>
                        {esActual && (
                          <span style={{
                            backgroundColor: '#ff9800',
                            color: 'white',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            fontSize: '11px'
                          }}>
                            Actual
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '14px', color: '#666' }}>
                        {centro.localidad && `${centro.localidad}`}
                        {centro.municipio && centro.municipio !== centro.localidad && ` - ${centro.municipio}`}
                      </div>
                      <div style={{ 
                        fontSize: '14px', 
                        marginTop: '5px',
                        color: sinPlazas ? '#d32f2f' : '#388e3c',
                        fontWeight: 'bold'
                      }}>
                        Plazas: <strong>{centro.plazasDisponiblesActualizadas}</strong> disponibles 
                        de {centro.plazasTotal || centro.plazas || 0}
                        {sinPlazas && ' - SIN PLAZAS DISPONIBLES'}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#d32f2f', padding: '10px', textAlign: 'center' }}>
                No hay centros disponibles para reasignar.
              </div>
            )}
          </div>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            gap: '10px',
            borderTop: '1px solid #eee',
            paddingTop: '15px'
          }}>
            {noHayCentrosDisponiblesParaReasignacion && (
              <div style={{ 
                marginRight: 'auto', 
                color: '#d32f2f', 
                fontWeight: 'bold',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center'
              }}>
                ⚠️ No hay centros alternativos con plazas disponibles
              </div>
            )}
            <button 
              onClick={() => setModalReasignacion(false)}
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
            {noHayCentrosDisponiblesParaReasignacion && (
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
            )}
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
  
  // Renderizar el panel completo de administración
  return (
    <div style={{
      maxWidth: '1280px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{ marginBottom: '30px', color: '#2c3e50' }}>Panel de Administración</h1>
      
      {/* Mensaje de procesamiento */}
      {internalProcessingMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#3498db',
          color: 'white',
          padding: '15px 20px',
          borderRadius: '5px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          zIndex: 1000
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ 
              width: '20px', 
              height: '20px', 
              borderRadius: '50%', 
              border: '2px solid rgba(255,255,255,0.5)', 
              borderTopColor: 'white',
              animation: 'spin 1s linear infinite',
              marginRight: '10px'
            }} />
            {internalProcessingMessage}
          </div>
        </div>
      )}
      
      {/* Sección de acciones rápidas */}
      {renderAccionesRapidas()}
      
      {/* Sección de importación de centros */}
      {renderSeccionImportacionCentros()}
      
      {/* Sección de solicitudes pendientes */}
      {renderSolicitudesPendientes()}
      
      {/* Sección de asignaciones existentes */}
      {renderAsignacionesExistentes()}
      
      {/* Añadir el Footer */}
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

      {/* Renderizar el modal de asignación manual */}
      {modalAsignacionManual && solicitudSeleccionada && renderModalAsignacionManual()}

      {/* Renderizar el modal de reasignación */}
      {modalReasignacion && asignacionParaReasignar && renderModalReasignacion()}
    </div>
  );
};

export default Admin; 