import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { collection, onSnapshot, addDoc, updateDoc, doc, getDocs, query, deleteDoc, setDoc, runTransaction, orderBy, where, writeBatch, limit, serverTimestamp } from "firebase/firestore";
import { db } from './utils/firebaseConfig';
import { 
  procesarSolicitudes, 
  procesarSolicitud, 
  verificarYCorregirAsignaciones,
  resetearContadoresAsignaciones
} from './utils/assignmentUtils';

// Importar componentes
import Dashboard from './components/Dashboard';
import PlazasDisponibles from './components/PlazasDisponibles';
import SolicitudesPendientes from './components/SolicitudesPendientes';
import Footer from './components/Footer';

function App() {
  // Estados principales
  const [availablePlazas, setAvailablePlazas] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  // Añadir estado para historial de solicitudes
  const [historialSolicitudes, setHistorialSolicitudes] = useState([]);
  const [loadingProcess, setLoadingProcess] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [loadingCSV, setLoadingCSV] = useState(false);
  const [lastProcessed, setLastProcessed] = useState(new Date()); // Inicializar con fecha actual en lugar de null
  const [secondsUntilNextUpdate, setSecondsUntilNextUpdate] = useState(45);
  const [resetingCounters, setResetingCounters] = useState(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  // Agregar estado para mostrar pantalla de mantenimiento durante verificación
  const [isVerificationMaintenance, setIsVerificationMaintenance] = useState(true); // Iniciar con true para mostrar pantalla mantenimiento al cargar
  const [maintenanceMessage, setMaintenanceMessage] = useState('Iniciando sistema y verificando datos...');
  const [maintenanceProgress, setMaintenanceProgress] = useState(10);
  
  // Estados para el formulario de solicitud
  const [orderNumber, setOrderNumber] = useState('');
  const [centrosSeleccionados, setCentrosSeleccionados] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [assignment, setAssignment] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados para el popup de notificación
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [popupType, setPopupType] = useState('success'); // 'success', 'warning', 'error'

  // Estado para gestionar las pestañas
  const [activeTab, setActiveTab] = useState('asignaciones');

  // Refs para controlar el estado de carga
  const cargandoRef = useRef(false);
  const cargaCompletadaRef = useRef(false);
  const processingRef = useRef(false); // Para controlar el procesamiento de solicitudes
  const processingTimerRef = useRef(null);
  const lastProcessedTimestampRef = useRef(0);
  const countdownTimerRef = useRef(null);
  const lastCounterResetRef = useRef(0);
  const verificacionProgramadaRef = useRef(false);

  // Cerca del inicio del componente App
  const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);

  // Estados para tracking y notificaciones
  const [notification, setNotification] = useState({show: false, message: "", type: ""});
  const [ultimoProcesamientoFecha, setUltimoProcesamientoFecha] = useState("");

  // Estado para el modal de contraseña
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // Función para mostrar un popup con mensaje
  const showNotification = (message, type = 'success') => {
    setPopupMessage(message);
    setPopupType(type);
    setShowPopup(true);
    
    // Ocultar después de un tiempo si no es un error
    if (type !== 'error') {
      setTimeout(() => {
        setShowPopup(false);
      }, 5000);
    }
  };

  // Función para activar/desactivar el modo mantenimiento
  const toggleMaintenanceMode = (active) => {
    // Ya no cambiamos el modo, simplemente se mantiene siempre en false
    // setIsMaintenanceMode(active);
  };

  // Función para resetear los contadores de asignaciones
  const resetearContadores = async () => {
    if (resetingCounters) {
      return;
    }
    
    setResetingCounters(true);
    setProcessingMessage("Reseteando y recalculando contadores de asignaciones...");
    
    try {
      // Obtener los datos más recientes
      await cargarDatosDesdeFirebase();
      
      // Ejecutar la función de reseteo
      const resultado = await resetearContadoresAsignaciones(availablePlazas, assignments, db);
      
      // Actualizar último tiempo de reseteo
      lastCounterResetRef.current = Date.now();
      
      // Recargar datos después del reseteo
      await cargarDatosDesdeFirebase();
      
      if (resultado.success) {
        showNotification(`Contadores recalculados correctamente: ${resultado.actualizados} centros actualizados.`, 'success');
      } else {
        showNotification(`Error al recalcular contadores: ${resultado.message}`, 'error');
      }
    } catch (error) {
      console.error("Error al resetear contadores:", error);
      showNotification(`Error al resetear contadores: ${error.message}`, 'error');
    } finally {
      setResetingCounters(false);
      setProcessingMessage("");
    }
  };

  // Función para cargar datos únicamente desde plazas.csv
  const cargarDesdePlazasCSV = async (e) => {
    try {
      // Ya no validamos si estamos en modo mantenimiento
      
      // Si se pasó un evento, obtener el archivo del input, de lo contrario usar el diálogo de archivos
      let file = null;
      
      if (e && e.target && e.target.files && e.target.files.length > 0) {
        file = e.target.files[0];
      } else {
        // Intentar cargar automáticamente desde URL predeterminada
        try {
          const csvUrl = process.env.PUBLIC_URL + '/plazas.csv';
          const response = await fetch(csvUrl);
          
          if (response.ok) {
            file = await response.blob();
          } else {
            console.log("CSV no encontrado en la ubicación predeterminada, abriendo diálogo de selección...");
            // Si falla, recurrimos al diálogo de selección manual
            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.accept = '.csv';
            
            const filePromise = new Promise((resolve) => {
              fileInput.onchange = (event) => resolve(event.target.files[0]);
            });
            
            fileInput.click();
            file = await filePromise;
          }
        } catch (error) {
          console.error("Error al intentar cargar CSV automáticamente:", error);
          // Si falla, recurrimos al diálogo de selección manual
          const fileInput = document.createElement("input");
          fileInput.type = "file";
          fileInput.accept = '.csv';
          
          const filePromise = new Promise((resolve) => {
            fileInput.onchange = (event) => resolve(event.target.files[0]);
          });
          
          fileInput.click();
          file = await filePromise;
        }
      }
      
    setLoadingCSV(true);
      setProcessingMessage("Cargando y procesando archivo CSV...");
    
    try {
      // Limpiar primero la colección completa
      await limpiarColeccion("centros");
      
      // Cargar el CSV
        const response = await fetch(file);
      
      if (!response.ok) {
        throw new Error(`Error al cargar el CSV: ${response.status} - ${response.statusText}`);
      }
      
      const text = await response.text();
      
      if (text.length < 100) {
        throw new Error("El archivo CSV parece estar vacío o es demasiado pequeño");
      }
      
      // Procesar el CSV
      const lines = text.split("\n")
        .map(line => line.replace(/"/g, '').trim())
        .filter(Boolean);
      
      if (lines.length < 5) {
        throw new Error("El archivo CSV no contiene suficientes líneas de datos");
      }
      
      // Encontrar la línea de encabezado
      const headerIndex = lines.findIndex(line => line.includes("A.S.I.;"));
      
      if (headerIndex === -1) {
        // Intentar otros patrones posibles en el encabezado
        const alternativeHeaderIndex = lines.findIndex(line => 
          line.includes("ASI;") || 
          line.includes("DEPARTAMENTO;") || 
          line.includes("CODIGO;")
        );
        
        if (alternativeHeaderIndex === -1) {
          throw new Error("No se encontró una línea de encabezado válida en el CSV");
        } else {
          headerIndex = alternativeHeaderIndex;
        }
      } else {
      }
      
      // Verificar estructura de encabezado
      const headerParts = lines[headerIndex].split(';');
      if (headerParts.length < 5) {
        throw new Error("El formato del encabezado no es válido, faltan columnas necesarias");
      }
      
      // Crear un conjunto para seguimiento de centros ya procesados
      const centrosProcesados = new Set();
      const codigosProcesados = new Set();
      
      // Procesar cada línea después del encabezado
      const centros = [];
      let nextId = 1;
      let totalPlazas = 0;
      let lineasInvalidas = 0;
      let centrosDuplicados = 0;
      
      setProcessingMessage("Analizando datos del CSV...");
      
      for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Ignorar líneas que parecen separadores o totales
        if (line.includes("de 11") || line.includes("TOTAL =")) continue;
        
        const parts = line.split(";");
        
        // Necesitamos al menos 5 columnas para la información básica
        if (parts.length < 5) {
          lineasInvalidas++;
          continue;
        }
        
        const asi = parts[0]?.trim() || "";
        const departamento = parts[1]?.trim() || "";
        const codigo = parts[2]?.trim() || "";
        const centro = parts[3]?.trim() || "";
        const municipio = parts[4]?.trim() || "";
        
        // Validar datos obligatorios
        if (!codigo || codigo.length < 2) {
          console.warn(`Línea ${i+1}: Código inválido o ausente: "${codigo}"`);
          lineasInvalidas++;
          continue;
        }
        
        if (!centro || centro.length < 2) {
          console.warn(`Línea ${i+1}: Nombre de centro inválido o ausente: "${centro}"`);
          lineasInvalidas++;
          continue;
        }
        
        if (!municipio) {
          console.warn(`Línea ${i+1}: Municipio ausente para centro: "${centro}"`);
          lineasInvalidas++;
          continue;
        }
        
        // Crear clave única para identificar centros duplicados
        const clave = `${codigo}-${centro}-${municipio}`.toLowerCase();
        
        // Si ya procesamos este centro, saltarlo
        if (centrosProcesados.has(clave)) {
          centrosDuplicados++;
          continue;
        }
        
        // Si ya procesamos este código, es un posible duplicado con variación
        if (codigosProcesados.has(codigo)) {
          console.warn(`Posible duplicado con código ${codigo}: "${centro}" en ${municipio}`);
        }
        
        centrosProcesados.add(clave);
        codigosProcesados.add(codigo);
        
        // Extraer número de plazas
        let plazas = 1; // Valor por defecto
        if (parts.length > 5 && parts[5]?.trim()) {
          const plazasStr = parts[5].trim();
          const plazasNum = parseInt(plazasStr);
          if (!isNaN(plazasNum) && plazasNum > 0) {
            plazas = plazasNum;
          } else {
            console.warn(`Línea ${i+1}: Valor de plazas inválido: "${plazasStr}", usando 1 por defecto`);
          }
        } else {
          console.warn(`Línea ${i+1}: No se especificó número de plazas para "${centro}", usando 1 por defecto`);
        }
        
        // Verificar total de plazas acumulado
        totalPlazas += plazas;
        
        // Añadir a la lista
        centros.push({
          id: nextId++,
          asi: asi,
          departamento: departamento,
          codigo: codigo,
          centro: centro,
          localidad: municipio,
          municipio: municipio,
          plazas: plazas,
          asignadas: 0
        });
        
        if (centros.length % 100 === 0) {
          setProcessingMessage(`Procesando CSV: ${centros.length} centros encontrados...`);
        }
      }
      
      
      if (centros.length === 0) {
        throw new Error("No se pudieron extraer centros válidos del CSV");
      }
      
      // Asegurar que el total de plazas sea exactamente 7066
      const PLAZAS_OBJETIVO = 7066;
      
      if (totalPlazas !== PLAZAS_OBJETIVO) {
        
        // Estrategia: distribuir el ajuste en varios centros grandes para minimizar distorsión
        const centrosOrdenados = [...centros].sort((a, b) => b.plazas - a.plazas);
        const diferencia = totalPlazas - PLAZAS_OBJETIVO;
        
        if (Math.abs(diferencia) > 100) {
          console.warn(`Diferencia muy grande (${diferencia} plazas) entre el total calculado y el objetivo`);
        }
        
        if (diferencia > 0) {
          // Hay plazas de más, reducir de forma distribuida
          let restante = diferencia;
          let indice = 0;
          
          while (restante > 0 && indice < Math.min(5, centrosOrdenados.length)) {
            const centro = centrosOrdenados[indice];
            const ajuste = Math.min(Math.ceil(diferencia / 5), centro.plazas - 1, restante);
            
            if (ajuste > 0) {
              centro.plazas -= ajuste;
              restante -= ajuste;
            }
            
            indice++;
          }
          
          // Si aún queda diferencia, reducir del centro más grande
          if (restante > 0) {
            centrosOrdenados[0].plazas -= restante;
          }
        } else if (diferencia < 0) {
          // Faltan plazas, añadir de forma distribuida
          let restante = Math.abs(diferencia);
          let indice = 0;
          
          while (restante > 0 && indice < Math.min(5, centrosOrdenados.length)) {
            const centro = centrosOrdenados[indice];
            const ajuste = Math.min(Math.ceil(Math.abs(diferencia) / 5), restante);
            
            centro.plazas += ajuste;
            restante -= ajuste;
            
            indice++;
          }
          
          // Si aún queda diferencia, añadir al centro más grande
          if (restante > 0) {
            centrosOrdenados[0].plazas += restante;
          }
        }
        
        // Verificar que el ajuste se hizo correctamente
        const nuevoTotal = centros.reduce((sum, c) => sum + c.plazas, 0);
        if (nuevoTotal !== PLAZAS_OBJETIVO) {
          console.error(`Error en el ajuste: ${nuevoTotal} ≠ ${PLAZAS_OBJETIVO}`);
          throw new Error(`No se pudo ajustar el número de plazas correctamente: ${nuevoTotal} ≠ ${PLAZAS_OBJETIVO}`);
        } else {
        }
      }
      
      // Añadir los centros a Firebase
      setProcessingMessage(`Añadiendo ${centros.length} centros a Firebase...`);
      let procesados = 0;
      
      // Verificar una vez más si hay datos para evitar duplicación
      const verificacionFinal = await getDocs(collection(db, "centros"));
      if (verificacionFinal.size > 0) {
        showNotification("Se encontraron datos existentes. Usando datos actuales para evitar duplicación.", 'warning');
        setLoadingCSV(false);
        return await cargarDatosDesdeFirebase();
      }
      
      // Añadir centros por lotes para mayor eficiencia
      const BATCH_SIZE = 100;
      for (let i = 0; i < centros.length; i += BATCH_SIZE) {
        const batch = centros.slice(i, i + BATCH_SIZE);
        
        setProcessingMessage(`Añadiendo centros: ${i}/${centros.length}`);
        
        // Procesar el lote actual
        for (const centro of batch) {
          const docRef = doc(collection(db, "centros"));
          await setDoc(docRef, {
            ...centro,
            docId: docRef.id
          });
          procesados++;
        }
        
      }
      
      setProcessingMessage("Datos cargados correctamente");
      
      // Cargar datos actualizados de Firebase
      await cargarDatosDesdeFirebase();
      
      setLoadingCSV(false);
      showNotification(`Se han cargado ${procesados} centros y exactamente ${PLAZAS_OBJETIVO} plazas correctamente`, 'success');
      return true;
    } catch (error) {
      console.error("Error al cargar o procesar el CSV:", error);
      showNotification(`Error en la importación: ${error.message}`, 'error');
        setLoadingCSV(false);
        return false;
      }
    } catch (error) {
      console.error("Error al cargar datos desde CSV:", error);
      showNotification(`Error al cargar datos desde CSV: ${error.message}`, 'error');
      setLoadingCSV(false);
      return false;
    }
  };
  
  // Función para limpiar una colección completa
  const limpiarColeccion = async (nombreColeccion) => {
    try {
      setProcessingMessage(`Limpiando colección ${nombreColeccion}...`);
      
      const snapshot = await getDocs(collection(db, nombreColeccion));
      
      if (snapshot.size > 0) {
        
        for (const docSnapshot of snapshot.docs) {
          await deleteDoc(doc(db, nombreColeccion, docSnapshot.id));
        }
        
      } else {
      }
      
      return true;
    } catch (error) {
      console.error(`Error al limpiar colección ${nombreColeccion}:`, error);
      throw error;
    }
  };

  // Función para cargar datos directamente desde Firebase
  const cargarDatosDesdeFirebase = async () => {
    try {
      // Cargar centros
      const centrosSnapshot = await getDocs(collection(db, "centros"));
      const centrosData = centrosSnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
      setAvailablePlazas(centrosData);
      
      // Cargar asignaciones
      const asignacionesSnapshot = await getDocs(collection(db, "asignaciones"));
      const asignacionesData = asignacionesSnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
      setAssignments(asignacionesData);
      
      // Cargar solicitudes pendientes
      const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
      const solicitudesData = solicitudesSnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
      setSolicitudes(solicitudesData);
      
      // Cargar historial de solicitudes
      const historialSnapshot = await getDocs(collection(db, "historialSolicitudes"));
      const historialData = historialSnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
      setHistorialSolicitudes(historialData);
      
      return true;
    } catch (error) {
      console.error("Error al cargar datos desde Firebase:", error);
      throw error;
    }
  };
  
  // Configurar listeners de Firebase (solo para actualizaciones)
  const setupFirebaseListeners = () => {
    // Listener para los centros
    const unsubscribeCentros = onSnapshot(collection(db, "centros"), (snapshot) => {
      const centrosData = [];
      snapshot.forEach((doc) => {
        centrosData.push({ ...doc.data(), docId: doc.id });
      });
      
      if (centrosData.length > 0) {
        setAvailablePlazas(centrosData);
      }
    });
    
    // Listener para asignaciones
    const unsubscribeAsignaciones = onSnapshot(collection(db, "asignaciones"), (snapshot) => {
      const asignacionesData = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Normalizar y validar los datos de la asignación
        const asignacion = {
          ...data,
          docId: doc.id,
          // Asegurar que todos los campos necesarios existan
          order: typeof data.order === 'number' ? data.order : Number(data.order) || 0,
          centro: data.centro || 'No disponible',
          localidad: data.localidad || 'No disponible',
          municipio: data.municipio || 'No disponible',
          timestamp: data.timestamp || Date.now(),
          estado: data.estado || 'ASIGNADA'
        };
        asignacionesData.push(asignacion);
      });
      
      // Ordenar por número de orden
      asignacionesData.sort((a, b) => {
        const ordenA = Number(a.order) || 0;
        const ordenB = Number(b.order) || 0;
        return ordenA - ordenB;
      });
      
      setAssignments(asignacionesData);
    });
    
    // Listener para solicitudes pendientes
    const unsubscribeSolicitudes = onSnapshot(collection(db, "solicitudesPendientes"), (snapshot) => {
      const solicitudesData = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Normalizar y validar los datos de la solicitud
        const solicitud = {
          ...data,
          docId: doc.id,
          // Normalizar el número de orden
          orden: typeof data.orden === 'number' ? data.orden : Number(data.orden) || 0,
          // Normalizar la lista de centros (puede estar como centrosIds o centrosSeleccionados)
          centrosIds: data.centrosIds || data.centrosSeleccionados || []
        };
        solicitudesData.push(solicitud);
      });
      
      setSolicitudes(solicitudesData);
    });
    
    // Listener para historial de solicitudes
    const unsubscribeHistorial = onSnapshot(collection(db, "historialSolicitudes"), (snapshot) => {
      const historialData = [];
      snapshot.forEach((doc) => {
        historialData.push({ ...doc.data(), docId: doc.id });
      });
      
      setHistorialSolicitudes(historialData);
    });
    
    // Devolver función para desuscribirse de todos los listeners
    return () => {
      unsubscribeCentros();
      unsubscribeAsignaciones();
      unsubscribeSolicitudes();
      unsubscribeHistorial();
    };
  };
  
  // Función para cargar automáticamente el CSV desde ubicación predeterminada
  const cargarCSVAutomatico = async () => {
    try {
      const csvUrl = process.env.PUBLIC_URL + '/plazas.csv';
      const response = await fetch(csvUrl);
      
      if (response.ok) {
        // El archivo existe, continuar con la carga
        setLoadingCSV(true);
        setProcessingMessage("Cargando y procesando archivo CSV automáticamente...");
        
        const file = await response.blob();
        
        // Limpiar primero la colección completa
        await limpiarColeccion("centros");
        
        // El resto del procesamiento es similar a cargarDesdePlazasCSV
        if (file.size < 100) {
          throw new Error("El archivo CSV parece estar vacío o es demasiado pequeño");
        }
        
        const text = await file.text();
        
        // Continuar con el procesamiento normal del CSV
        // ... (continuará con la lógica existente de procesamiento)
        
        // Resto del código de procesamiento de CSV
        const lines = text.split("\n")
          .map(line => line.replace(/"/g, '').trim())
          .filter(Boolean);
        
        if (lines.length < 5) {
          throw new Error("El archivo CSV no contiene suficientes líneas de datos");
        }
        
        // Encontrar la línea de encabezado
        let headerIndex = lines.findIndex(line => line.includes("A.S.I.;"));
        
        if (headerIndex === -1) {
          // Intentar otros patrones posibles en el encabezado
          const alternativeHeaderIndex = lines.findIndex(line => 
            line.includes("ASI;") || 
            line.includes("DEPARTAMENTO;") || 
            line.includes("CODIGO;")
          );
          
          if (alternativeHeaderIndex === -1) {
            throw new Error("No se encontró una línea de encabezado válida en el CSV");
          } else {
            headerIndex = alternativeHeaderIndex;
          }
        }
        
        // Verificar estructura de encabezado
        const headerParts = lines[headerIndex].split(';');
        if (headerParts.length < 5) {
          throw new Error("El formato del encabezado no es válido, faltan columnas necesarias");
        }
        
        // Crear un conjunto para seguimiento de centros ya procesados
        const centrosProcesados = new Set();
        const codigosProcesados = new Set();
        
        // Procesar cada línea después del encabezado
        const centros = [];
        let nextId = 1;
        let totalPlazas = 0;
        let lineasInvalidas = 0;
        let centrosDuplicados = 0;
        
        setProcessingMessage("Analizando datos del CSV...");
        
        for (let i = headerIndex + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // Ignorar líneas que parecen separadores o totales
          if (line.includes("de 11") || line.includes("TOTAL =")) continue;
          
          const parts = line.split(";");
          
          // Necesitamos al menos 5 columnas para la información básica
          if (parts.length < 5) {
            lineasInvalidas++;
            continue;
          }
          
          const asi = parts[0]?.trim() || "";
          const departamento = parts[1]?.trim() || "";
          const codigo = parts[2]?.trim() || "";
          const centro = parts[3]?.trim() || "";
          const municipio = parts[4]?.trim() || "";
          
          // Validar datos obligatorios
          if (!codigo || codigo.length < 2) {
            console.warn(`Línea ${i+1}: Código inválido o ausente: "${codigo}"`);
            lineasInvalidas++;
            continue;
          }
          
          if (!centro || centro.length < 2) {
            console.warn(`Línea ${i+1}: Nombre de centro inválido o ausente: "${centro}"`);
            lineasInvalidas++;
            continue;
          }
          
          if (!municipio) {
            console.warn(`Línea ${i+1}: Municipio ausente para centro: "${centro}"`);
            lineasInvalidas++;
            continue;
          }
          
          // Crear clave única para identificar centros duplicados
          const clave = `${codigo}-${centro}-${municipio}`.toLowerCase();
          
          // Si ya procesamos este centro, saltarlo
          if (centrosProcesados.has(clave)) {
            centrosDuplicados++;
            continue;
          }
          
          // Si ya procesamos este código, es un posible duplicado con variación
          if (codigosProcesados.has(codigo)) {
            console.warn(`Posible duplicado con código ${codigo}: "${centro}" en ${municipio}`);
          }
          
          centrosProcesados.add(clave);
          codigosProcesados.add(codigo);
          
          // Extraer número de plazas
          let plazas = 1; // Valor por defecto
          if (parts.length > 5 && parts[5]?.trim()) {
            const plazasStr = parts[5].trim();
            const plazasNum = parseInt(plazasStr);
            if (!isNaN(plazasNum) && plazasNum > 0) {
              plazas = plazasNum;
            } else {
              console.warn(`Línea ${i+1}: Valor de plazas inválido: "${plazasStr}", usando 1 por defecto`);
            }
          } else {
            console.warn(`Línea ${i+1}: No se especificó número de plazas para "${centro}", usando 1 por defecto`);
          }
          
          // Verificar total de plazas acumulado
          totalPlazas += plazas;
          
          // Añadir a la lista
          centros.push({
            id: nextId++,
            asi: asi,
            departamento: departamento,
            codigo: codigo,
            centro: centro,
            localidad: municipio,
            municipio: municipio,
            plazas: plazas,
            asignadas: 0
          });
          
          if (centros.length % 100 === 0) {
            setProcessingMessage(`Procesando CSV: ${centros.length} centros encontrados...`);
          }
        }
        
        
        if (centros.length === 0) {
          throw new Error("No se pudieron extraer centros válidos del CSV");
        }
        
        // Asegurar que el total de plazas sea exactamente 7066
        const PLAZAS_OBJETIVO = 7066;
        
        if (totalPlazas !== PLAZAS_OBJETIVO) {
          
          // Estrategia: distribuir el ajuste en varios centros grandes para minimizar distorsión
          const centrosOrdenados = [...centros].sort((a, b) => b.plazas - a.plazas);
          const diferencia = totalPlazas - PLAZAS_OBJETIVO;
          
          if (Math.abs(diferencia) > 100) {
            console.warn(`Diferencia muy grande (${diferencia} plazas) entre el total calculado y el objetivo`);
          }
          
          if (diferencia > 0) {
            // Hay plazas de más, reducir de forma distribuida
            let restante = diferencia;
            let indice = 0;
            
            while (restante > 0 && indice < Math.min(5, centrosOrdenados.length)) {
              const centro = centrosOrdenados[indice];
              const ajuste = Math.min(Math.ceil(diferencia / 5), centro.plazas - 1, restante);
              
              if (ajuste > 0) {
                centro.plazas -= ajuste;
                restante -= ajuste;
              }
              
              indice++;
            }
            
            // Si aún queda diferencia, reducir del centro más grande
            if (restante > 0) {
              centrosOrdenados[0].plazas -= restante;
            }
          } else if (diferencia < 0) {
            // Faltan plazas, añadir de forma distribuida
            let restante = Math.abs(diferencia);
            let indice = 0;
            
            while (restante > 0 && indice < Math.min(5, centrosOrdenados.length)) {
              const centro = centrosOrdenados[indice];
              const ajuste = Math.min(Math.ceil(Math.abs(diferencia) / 5), restante);
              
              centro.plazas += ajuste;
              restante -= ajuste;
              
              indice++;
            }
            
            // Si aún queda diferencia, añadir al centro más grande
            if (restante > 0) {
              centrosOrdenados[0].plazas += restante;
            }
          }
          
          // Verificar que el ajuste se hizo correctamente
          const nuevoTotal = centros.reduce((sum, c) => sum + c.plazas, 0);
          if (nuevoTotal !== PLAZAS_OBJETIVO) {
            console.error(`Error en el ajuste: ${nuevoTotal} ≠ ${PLAZAS_OBJETIVO}`);
            throw new Error(`No se pudo ajustar el número de plazas correctamente: ${nuevoTotal} ≠ ${PLAZAS_OBJETIVO}`);
          }
        }
        
        // Añadir los centros a Firebase
        setProcessingMessage(`Añadiendo ${centros.length} centros a Firebase...`);
        let procesados = 0;
        
        // Verificar una vez más si hay datos para evitar duplicación
        const verificacionFinal = await getDocs(collection(db, "centros"));
        if (verificacionFinal.size > 0) {
          showNotification("Se encontraron datos existentes. Usando datos actuales para evitar duplicación.", 'warning');
          setLoadingCSV(false);
          return await cargarDatosDesdeFirebase();
        }
        
        // Añadir centros por lotes para mayor eficiencia
        const BATCH_SIZE = 100;
        for (let i = 0; i < centros.length; i += BATCH_SIZE) {
          const batch = centros.slice(i, i + BATCH_SIZE);
          
          setProcessingMessage(`Añadiendo centros: ${i}/${centros.length}`);
          
          // Procesar el lote actual
          for (const centro of batch) {
            const docRef = doc(collection(db, "centros"));
            await setDoc(docRef, {
              ...centro,
              docId: docRef.id
            });
            procesados++;
          }
        }
        
        setProcessingMessage("Datos cargados correctamente");
        
        // Cargar datos actualizados de Firebase
        await cargarDatosDesdeFirebase();
        
        setLoadingCSV(false);
        showNotification(`Se han cargado ${procesados} centros y exactamente ${PLAZAS_OBJETIVO} plazas automáticamente`, 'success');
        return true;
      } else {
        console.log("CSV no encontrado en la ubicación predeterminada:", response.status);
        return false;
      }
    } catch (error) {
      console.error("Error al cargar CSV automáticamente:", error);
      setLoadingCSV(false);
      return false;
    }
  };
  
  // Cargar datos iniciales
  useEffect(() => {
    let unsubscribe;
    
    const inicializarApp = async () => {
      // Usar refs para controlar el estado de inicialización
      if (cargandoRef.current || cargaCompletadaRef.current) {
        return;
      }
      
      cargandoRef.current = true;
      
      try {
        // Activar modo mantenimiento durante la carga inicial
        setIsVerificationMaintenance(true);
        setMaintenanceMessage("Iniciando sistema y verificando conexión...");
        setMaintenanceProgress(5);
        
        // Verificar conexión con Firebase primero
        const conexionResult = await verificarConexionFirebase();
        if (!conexionResult.success) {
          setMaintenanceMessage(`Error de conexión: ${conexionResult.message}. Intenta recargar la página.`);
          return;
        }
        
        setMaintenanceMessage("Verificando datos...");
        setMaintenanceProgress(10);
        
        // Resto del código de inicialización...
        // Comprobar si ya hay datos en Firebase
        const centrosSnapshot = await getDocs(collection(db, "centros"));
        const centrosCount = centrosSnapshot.size;
        
        if (centrosCount === 0) {
          setMaintenanceMessage("Cargando datos iniciales...");
          setMaintenanceProgress(20);
          await limpiarColeccion("centros"); // Asegurar que está vacío
          
          // Intentar cargar automáticamente primero
          const cargaAutomaticaExitosa = await cargarCSVAutomatico();
          
          // Si la carga automática falla, intentar con el método manual
          if (!cargaAutomaticaExitosa) {
          await cargarDesdePlazasCSV();
          }
        } else {
          setMaintenanceMessage("Cargando datos existentes...");
          setMaintenanceProgress(30);
          await cargarDatosDesdeFirebase();
        }
        
        // Una vez cargados los datos, configurar listeners para actualizaciones
        unsubscribe = setupFirebaseListeners();
        
        setMaintenanceMessage("Limpiando duplicados iniciales...");
        setMaintenanceProgress(50);
        
        // Ejecutar una verificación inicial para eliminar duplicados
        console.log("Ejecutando limpieza inicial de duplicados");
        const resultadoLimpieza = await eliminarSolicitudesDuplicadas();
        
        // Mostrar información de la limpieza
        if (resultadoLimpieza.error) {
          console.error("Error durante la limpieza inicial:", resultadoLimpieza.error);
        } else {
          const totalEliminados = resultadoLimpieza.eliminadosSolicitudes + 
                                resultadoLimpieza.eliminadosAsignaciones + 
                                resultadoLimpieza.eliminadosHistorial;
          
          console.log(`Limpieza inicial completada: ${totalEliminados} elementos duplicados eliminados`);
        }
        
        // Volcar los datos de historialSolicitudes a solicitudesPendientes
        setMaintenanceMessage("Moviendo solicitudes históricas a pendientes...");
        setMaintenanceProgress(60);
        
        try {
          const resultadoVolcado = await volcarHistorialASolicitudesPendientes();
          if (resultadoVolcado.error) {
            console.error("Error en el volcado de historial:", resultadoVolcado.error);
          } else if (resultadoVolcado.volcados > 0) {
            console.log(`Volcado inicial: ${resultadoVolcado.volcados} solicitudes recuperadas del historial`);
            setMaintenanceMessage(`Recuperadas ${resultadoVolcado.volcados} solicitudes del historial`);
          } else {
            console.log("No hubo solicitudes para recuperar del historial");
          }
        } catch (errorVolcado) {
          console.error("Error durante el volcado de historial:", errorVolcado);
        }
        
        setMaintenanceMessage("Procesando solicitudes pendientes...");
        setMaintenanceProgress(70);
        
        // Procesar inmediatamente todas las solicitudes pendientes
        try {
          console.log("Procesando todas las solicitudes pendientes al inicio...");
          await procesarTodasLasSolicitudes();
          
          // Verificar si hay solicitudes pendientes después del procesamiento
          const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
          const cantidadSolicitudesPendientes = solicitudesSnapshot.docs.length;
          
          setMaintenanceProgress(100);
          
          if (cantidadSolicitudesPendientes > 0) {
            setMaintenanceMessage(`Hay ${cantidadSolicitudesPendientes} solicitudes pendientes por procesar.`);
            console.log(`Quedan ${cantidadSolicitudesPendientes} solicitudes pendientes después del procesamiento inicial`);
            // Mantener el modo mantenimiento activo
          } else {
            setMaintenanceMessage("¡Sistema iniciado correctamente!");
            
            // Desactivar modo mantenimiento después de un breve retraso
            setTimeout(() => {
              setIsVerificationMaintenance(false);
              showNotification("Sistema iniciado correctamente.", "success");
            }, 2000);
          }
        } catch (errorProceso) {
          console.error("Error al procesar solicitudes iniciales:", errorProceso);
          setMaintenanceMessage(`Error al procesar solicitudes: ${errorProceso.message}`);
          setMaintenanceProgress(100);
          
          // Intentar desactivar modo mantenimiento después de un error
          setTimeout(() => {
            setIsVerificationMaintenance(false);
            showNotification("Se produjo un error durante el procesamiento inicial: " + errorProceso.message, "error");
          }, 2000);
        }
        
        cargaCompletadaRef.current = true;
      } catch (error) {
        console.error("Error durante la inicialización:", error);
        setMaintenanceMessage(`Error: ${error.message}`);
        
        // Intentar desactivar modo mantenimiento después de un error
        setTimeout(() => {
          setIsVerificationMaintenance(false);
          showNotification("Error durante la inicialización: " + error.message, "error");
        }, 2000);
      } finally {
        cargandoRef.current = false;
      }
    };
    
    inicializarApp();
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Configurar procesamiento automático de solicitudes
  useEffect(() => {
    // Solo iniciar si los datos están cargados
    if (availablePlazas.length > 0) {
      // Procesar inmediatamente al cargar por primera vez
      const procesarInicial = async () => {
        if (solicitudes.length > 0 && !loadingProcess) {
          await procesarTodasLasSolicitudes(true);
          // Iniciar el contador en 45 segundos
          setSecondsUntilNextUpdate(45);
        }
      };
      
      procesarInicial();
      
      // Ya no configuramos un intervalo de procesamiento aquí
      // porque lo hemos movido al contador de segundos
            
      // Limpiar al desmontar
      return () => {
        if (processingTimerRef.current) {
          clearInterval(processingTimerRef.current);
        }
      };
    }
  }, [availablePlazas.length]);
  
  // Configurar el contador de segundos hasta la próxima actualización
  useEffect(() => {
    // Iniciar el contador de cuenta regresiva solo si no estamos en modo mantenimiento
    if (!isMaintenanceMode) {
    countdownTimerRef.current = setInterval(() => {
      setSecondsUntilNextUpdate(prevSeconds => {
          // Si llegamos a 0, volver a 45 y forzar el procesamiento
        if (prevSeconds <= 1) {
          // Solo iniciar el procesamiento si no está ya en proceso y hay solicitudes
            if (!loadingProcess && solicitudes.length > 0 && !isMaintenanceMode) {
            procesarTodasLasSolicitudes(true);
          }
            return 45; // Cambiado de 30 a 45 segundos
        }
        return prevSeconds - 1;
      });
    }, 1000);
    }
    
    // Limpiar el intervalo al desmontar
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [loadingProcess, solicitudes.length, isMaintenanceMode]);
  
  // Función para procesar todas las solicitudes pendientes
  const procesarTodasLasSolicitudes = async () => {
    // Evitar procesamiento simultáneo
    if (processingRef.current) {
      console.log("Ya hay un procesamiento en curso. Espera a que termine.");
      return false;
    }
    
    processingRef.current = true;
    setProcessingMessage("Iniciando procesamiento de solicitudes...");
    
    try {
      // Verificar si hay solicitudes pendientes
      const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
      
      if (solicitudesSnapshot.empty) {
        console.log("No hay solicitudes pendientes para procesar.");
        setProcessingMessage("No hay solicitudes pendientes para procesar.");
        setTimeout(() => {
          setProcessingMessage("");
          processingRef.current = false;
        }, 3000);
        return true;
      }
      
      // Convertir a array para procesamiento
      const solicitudesPendientes = solicitudesSnapshot.docs.map(doc => ({
        ...doc.data(),
        docId: doc.id,
        // Normalizar nombres de propiedades
        centrosIds: doc.data().centrosIds || doc.data().centrosSeleccionados || []
      }));
      
      console.log(`Procesando ${solicitudesPendientes.length} solicitudes pendientes...`);
      setProcessingMessage(`Procesando ${solicitudesPendientes.length} solicitudes pendientes...`);
      
      // Procesar todas las solicitudes en orden
      const resultado = await procesarSolicitudes(
        solicitudesPendientes, 
        assignments,
        availablePlazas,
        setProcessingMessage
      );
      
      if (resultado.error) {
        console.error("Error al procesar solicitudes:", resultado.error);
        setProcessingMessage(`Error: ${resultado.error}`);
      } else {
        console.log("Procesamiento completado:", resultado.message);
        setProcessingMessage(resultado.message);
        
        // Verificar y corregir asignaciones
        try {
          const verificacionResult = await verificarYCorregirAsignacionesWrapper();
          
          if (verificacionResult && verificacionResult.corregidos > 0) {
            console.log(`Corregidas ${verificacionResult.corregidos} asignaciones con exceso`);
            setProcessingMessage(prevMsg => `${prevMsg} Corregidas ${verificacionResult.corregidos} asignaciones con exceso.`);
          }
        } catch (verificacionError) {
          console.error("Error en verificación de asignaciones:", verificacionError);
        }
        
        // Actualizar última fecha de procesamiento
        setUltimoProcesamientoFecha(new Date().toLocaleString());
        
        // Recargar datos desde Firebase
        try {
          await cargarDatosDesdeFirebase();
        } catch (reloadError) {
          console.error("Error al recargar datos:", reloadError);
        }
      }
      
      // Verificar si ya no hay solicitudes pendientes para desactivar modo mantenimiento
      try {
        const solicitudesPendientesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
        const cantidadPendientes = solicitudesPendientesSnapshot.docs.length;
        
        if (cantidadPendientes > 0) {
          console.log(`Aún quedan ${cantidadPendientes} solicitudes pendientes por procesar`);
          setProcessingMessage(prevMsg => `${prevMsg} Aún quedan ${cantidadPendientes} solicitudes pendientes.`);
          
          // Reintento automático si hay solicitudes pendientes
          if (cantidadPendientes < 5) {
            console.log("Realizando un segundo intento automático para procesar solicitudes restantes...");
            setTimeout(() => {
              procesarTodasLasSolicitudes();
            }, 3000);
          }
        } else {
          // No hay más solicitudes pendientes, desactivar modo mantenimiento
          if (isVerificationMaintenance) {
            setTimeout(() => {
              setIsVerificationMaintenance(false);
              showNotification("Sistema iniciado correctamente", "success");
            }, 2000);
          }
        }
      } catch (checkError) {
        console.error("Error al verificar solicitudes pendientes:", checkError);
      }
      
      return true;
    } catch (error) {
      console.error("Error general al procesar solicitudes:", error);
      setProcessingMessage(`Error al procesar solicitudes: ${error.message}`);
      return false;
    } finally {
      setTimeout(() => {
        processingRef.current = false;
      }, 3000);
    }
  };

  /**
   * Enviar una solicitud de plaza
   * @param {number} orderNumber - Número de orden
   * @param {Array} selectedCenters - IDs de centros seleccionados
   */
  const enviarSolicitud = async (orderNumber, selectedCenters) => {
    console.log(`Iniciando envío de solicitud para orden ${orderNumber}`);
    
    // Validación más robusta de entradas
    if (orderNumber === undefined || orderNumber === null || orderNumber === '') {
      console.error("Error en enviarSolicitud: orderNumber es null, undefined o vacío");
      showNotification("Error: Número de orden inválido", "error");
      return false;
    }
    
    // Validar centros seleccionados con comprobación más estricta
    if (!selectedCenters || !Array.isArray(selectedCenters) || selectedCenters.length === 0) {
      console.error("Error en enviarSolicitud: No hay centros seleccionados", selectedCenters);
      showNotification("Error: Debe seleccionar al menos un centro", "error");
      return false;
    }
    
    // Convertir a número para consistencia
    const orderNumberNumeric = Number(orderNumber);
    if (isNaN(orderNumberNumeric)) {
      console.error("Error en enviarSolicitud: orderNumber no es un número válido", orderNumber);
      showNotification("Error: Número de orden inválido", "error");
      return false;
    }
    
    console.log(`Procesando solicitud para orden ${orderNumberNumeric} con centros:`, selectedCenters);
    
    try {
      // Verificar conexión a Firebase primero
      const conexionResult = await verificarConexionFirebase();
      if (!conexionResult || !conexionResult.success) {
        console.error("Error de conexión con Firebase:", conexionResult?.error || "Sin detalles adicionales");
        showNotification("Error de conexión con la base de datos. Por favor, verifica tu conexión a internet.", "error");
        return false;
      }
      
      // Verificar si ya existe una asignación para este número de orden
      try {
        const existingAssignmentSnapshot = await getDocs(
          query(collection(db, "asignaciones"), where("orden", "==", orderNumberNumeric))
        );
        
        if (!existingAssignmentSnapshot.empty) {
          console.log(`Ya existe una asignación para la orden ${orderNumberNumeric}`);
          showNotification(`La orden ${orderNumberNumeric} ya tiene una asignación en el sistema.`, "error");
          return false;
        }
      } catch (error) {
        console.error("Error al verificar asignaciones existentes:", error);
        showNotification("Error al verificar asignaciones existentes. Intente nuevamente.", "error");
        return false;
      }
      
      // Verificar si ya existe una solicitud pendiente para este número de orden
      let existingRequestId = null;
      try {
        const existingRequestSnapshot = await getDocs(
          query(collection(db, "solicitudesPendientes"), where("orden", "==", orderNumberNumeric))
        );
        
        if (!existingRequestSnapshot.empty) {
          existingRequestId = existingRequestSnapshot.docs[0].id;
          console.log(`Encontrada solicitud existente con ID ${existingRequestId} para orden ${orderNumberNumeric}`);
        }
      } catch (error) {
        console.error("Error al verificar solicitudes pendientes existentes:", error);
        showNotification("Error al verificar solicitudes pendientes. Intente nuevamente.", "error");
        return false;
      }
      
      // Usar una transacción para garantizar atomicidad
      try {
        await runTransaction(db, async (transaction) => {
          if (existingRequestId) {
            // Actualizar la solicitud existente
            const requestRef = doc(db, "solicitudesPendientes", existingRequestId);
            transaction.update(requestRef, {
              centrosSeleccionados: selectedCenters,
              timestamp: serverTimestamp()
            });
            console.log(`Actualizada solicitud existente ${existingRequestId} para orden ${orderNumberNumeric}`);
          } else {
            // Crear una nueva solicitud
            const newRequest = {
              orden: orderNumberNumeric,
              centrosSeleccionados: selectedCenters,
              timestamp: serverTimestamp()
            };
            
            const requestRef = doc(collection(db, "solicitudesPendientes"));
            transaction.set(requestRef, newRequest);
            console.log(`Creada nueva solicitud para orden ${orderNumberNumeric}`);
          }
        });
        
        console.log(`Solicitud para orden ${orderNumberNumeric} enviada correctamente`);
        showNotification(`Solicitud para orden ${orderNumberNumeric} enviada correctamente`, "success");
        
        // Recargar datos después de la operación
        await cargarDatosDesdeFirebase();
        
        // Limpiar los campos del formulario
        setOrderNumber('');
        setCentrosSeleccionados([]);
        
        // Cambiar la pestaña activa a "solicitudes"
        setActiveTab('solicitudes');
        
        return true;
      } catch (transactionError) {
        console.error("Error en transacción:", transactionError);
        showNotification(`Error al procesar la solicitud: ${transactionError.message}`, "error");
        return false;
      }
    } catch (error) {
      console.error(`Error al enviar solicitud para orden ${orderNumberNumeric}:`, error);
      showNotification(`Error al enviar solicitud: ${error.message}`, "error");
      return false;
    }
  };
  
  // Definir estilos para la interfaz mejorada
  const styles = {
    container: {
      maxWidth: '1280px',
      margin: '0 auto',
      padding: '20px',
      backgroundColor: '#f8f9fa',
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif'
    },
    header: {
      textAlign: 'center',
      marginBottom: '30px',
      borderBottom: '1px solid #e7e7e7',
      paddingBottom: '15px'
    },
    title: {
      color: '#2c3e50',
      fontSize: '28px',
      margin: '0 0 10px 0'
    },
    subtitle: {
      color: '#7f8c8d',
      fontSize: '16px',
      fontWeight: 'normal',
      margin: 0
    },
    tabs: {
      display: 'flex',
      gap: '2px',
      marginBottom: '20px',
      backgroundColor: '#e9ecef',
      borderRadius: '10px',
      padding: '3px',
      overflow: 'hidden'
    },
    tab: {
      padding: '12px 20px',
      cursor: 'pointer',
      flex: 1,
      textAlign: 'center',
      borderRadius: '8px',
      transition: 'all 0.3s ease',
      fontSize: '15px',
      fontWeight: '500'
    },
    activeTab: {
      backgroundColor: '#fff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      color: '#3498db'
    },
    inactiveTab: {
      backgroundColor: 'transparent',
      color: '#7f8c8d'
    },
    sectionTitle: {
      fontSize: '20px',
      color: '#2c3e50',
      marginBottom: '15px',
      paddingBottom: '8px',
      borderBottom: '2px solid #e7e7e7'
    },
    cardContainer: {
      backgroundColor: 'white',
      borderRadius: '10px',
      padding: '20px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
      marginBottom: '20px'
    },
    popup: {
      position: 'fixed',
      top: '20px',
      right: '20px',
      padding: '15px 20px',
      borderRadius: '10px',
      boxShadow: '0 3px 15px rgba(0,0,0,0.2)',
      zIndex: 1000,
      maxWidth: '350px',
      animation: 'slideIn 0.3s ease'
    },
    processingButton: {
      padding: '12px 20px',
      backgroundImage: loadingProcess ? 
        'linear-gradient(to right, #cccccc, #dddddd)' : 
        'linear-gradient(to right, #3498db, #2980b9)',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: loadingProcess || solicitudes.length === 0 ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '15px',
      fontWeight: '500',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      margin: '10px auto'
    },
    reloadButton: {
      padding: '12px 20px',
      backgroundImage: loadingCSV ? 
        'linear-gradient(to right, #cccccc, #dddddd)' : 
        'linear-gradient(to right, #e74c3c, #c0392b)',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: loadingCSV ? 'not-allowed' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '15px',
      fontWeight: '500',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      margin: '10px auto'
    },
    adminPanel: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: '20px'
    },
    adminButton: {
      padding: '12px 20px',
      backgroundImage: 'linear-gradient(to right, #3498db, #2980b9)',
      color: 'white',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '15px',
      fontWeight: '500',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      margin: '10px auto'
    }
  };

  // Añadir un efecto para el reseteo automático de contadores
  useEffect(() => {
    // Verificar si es hora de resetear los contadores automáticamente
    const checkContadoresReset = () => {
      const ahora = Date.now();
      const ultimoReset = lastCounterResetRef.current;
      
      // Resetear contadores cada 60 minutos (3600000 ms) o si nunca se ha hecho
      if (ultimoReset === 0 || (ahora - ultimoReset) > 3600000) {
        resetearContadores();
      }
    };
    
    // Verificar cuando cambia assignments por primera vez o cuando hay más de 10 asignaciones
    if (assignments.length > 10) {
      checkContadoresReset();
    }
    
    // También configurar un intervalo para verificar cada 15 minutos
    const intervalId = setInterval(() => {
      checkContadoresReset();
    }, 900000); // 15 minutos
    
    return () => clearInterval(intervalId);
  }, [assignments.length]);

  // Función para detectar y eliminar centros duplicados
  const eliminarCentrosDuplicados = async () => {
    if (!isMaintenanceMode) {
      showNotification("Para eliminar centros duplicados, debe activar el modo mantenimiento primero.", "error");
      return;
    }
    
    try {
      setProcessingMessage("Buscando y eliminando centros duplicados...");
      
      // Obtener todos los centros de la base de datos
      const centrosSnapshot = await getDocs(collection(db, "centros"));
      const centros = centrosSnapshot.docs.map(doc => ({
        ...doc.data(),
        docId: doc.id
      }));
      
      // Crear un mapa para detectar duplicados basados en el ID
      const centrosPorId = {};
      const duplicados = [];
      
      // Identificar duplicados
      centros.forEach(centro => {
        if (!centro.id) return; // Ignorar centros sin ID
        
        if (!centrosPorId[centro.id]) {
          centrosPorId[centro.id] = [centro];
        } else {
          centrosPorId[centro.id].push(centro);
          if (centrosPorId[centro.id].length === 2) { // Cuando encontramos el primer duplicado
            duplicados.push(centro.id);
          }
        }
      });
      
      if (duplicados.length === 0) {
        showNotification("No se encontraron centros duplicados", "success");
        setProcessingMessage("");
        return;
      }
      
      // Eliminar duplicados - mantener solo el primero de cada grupo
      let eliminados = 0;
      
      for (const id of duplicados) {
        const grupoConMismoId = centrosPorId[id];
        // Ordenar por docId para tener consistencia en cuál se mantiene
        grupoConMismoId.sort((a, b) => a.docId.localeCompare(b.docId));
        
        // Mantener el primer centro, eliminar el resto
        for (let i = 1; i < grupoConMismoId.length; i++) {
          await deleteDoc(doc(db, "centros", grupoConMismoId[i].docId));
          eliminados++;
        }
      }
      
      // Recargar datos después de eliminar duplicados
      await cargarDatosDesdeFirebase();
      
      showNotification(`Se eliminaron ${eliminados} centros duplicados`, "success");
      setProcessingMessage("");
    } catch (error) {
      console.error("Error al eliminar centros duplicados:", error);
      showNotification(`Error al eliminar duplicados: ${error.message}`, "error");
      setProcessingMessage("");
    }
  };

  // Modificado - Mover la función eliminarSolicitudesDuplicadas antes de verificarYCorregirAsignaciones
  // para solucionar el error de referencia circular
  const eliminarSolicitudesDuplicadas = async () => {
    try {
      console.log("Ejecutando eliminación de solicitudes y asignaciones duplicadas...");
      
      // PARTE 1: Eliminar solicitudes pendientes duplicadas
      // Obtener todas las solicitudes pendientes
      const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
      
      // Crear un mapa para detectar duplicados por número de orden
      const solicitudesPorOrden = {};
      const solicitudesTotales = solicitudesSnapshot.docs.length;
      
      // Agrupar solicitudes por orden
      solicitudesSnapshot.docs.forEach(doc => {
        const solicitud = { ...doc.data(), docId: doc.id };
        const orden = solicitud.orden;
        
        if (!orden) return;
        
        if (!solicitudesPorOrden[orden]) {
          solicitudesPorOrden[orden] = [solicitud];
        } else {
          solicitudesPorOrden[orden].push(solicitud);
        }
      });
      
      // Contar solicitudes duplicadas
      let totalDuplicadosSolicitudes = 0;
      Object.keys(solicitudesPorOrden).forEach(orden => {
        const solicitudes = solicitudesPorOrden[orden];
        if (solicitudes.length > 1) {
          totalDuplicadosSolicitudes += (solicitudes.length - 1);
        }
      });
      
      // PARTE 2: Eliminar asignaciones duplicadas
      // Obtener todas las asignaciones
      const asignacionesSnapshot = await getDocs(collection(db, "asignaciones"));
      
      // Crear un mapa para detectar duplicados por número de orden
      const asignacionesPorOrden = {};
      const asignacionesTotales = asignacionesSnapshot.docs.length;
      
      // Agrupar asignaciones por orden
      asignacionesSnapshot.docs.forEach(doc => {
        const asignacion = { ...doc.data(), docId: doc.id };
        const orden = asignacion.order;
        
        if (!orden) return;
        
        if (!asignacionesPorOrden[orden]) {
          asignacionesPorOrden[orden] = [asignacion];
        } else {
          asignacionesPorOrden[orden].push(asignacion);
        }
      });
      
      // Contar asignaciones duplicadas
      let totalDuplicadosAsignaciones = 0;
      Object.keys(asignacionesPorOrden).forEach(orden => {
        const asignaciones = asignacionesPorOrden[orden];
        if (asignaciones.length > 1) {
          totalDuplicadosAsignaciones += (asignaciones.length - 1);
        }
      });
      
      // PARTE 3: Verificar si hay duplicados en historial
      const historialSnapshot = await getDocs(collection(db, "historialSolicitudes"));
      const historialPorOrdenYEstado = {};
      
      // Agrupar historial por orden y estado para identificar duplicados más precisos
      historialSnapshot.docs.forEach(doc => {
        const historial = { ...doc.data(), docId: doc.id };
        const orden = historial.orden;
        const estado = historial.estado || 'DESCONOCIDO';
        
        if (!orden) return;
        
        const key = `${orden}-${estado}`;
        
        if (!historialPorOrdenYEstado[key]) {
          historialPorOrdenYEstado[key] = [historial];
        } else {
          historialPorOrdenYEstado[key].push(historial);
        }
      });
      
      // Contar duplicados en historial
      let totalDuplicadosHistorial = 0;
      Object.keys(historialPorOrdenYEstado).forEach(key => {
        const historiales = historialPorOrdenYEstado[key];
        if (historiales.length > 1) {
          totalDuplicadosHistorial += (historiales.length - 1);
        }
      });
      
      // Si no hay duplicados, terminar
      if (totalDuplicadosSolicitudes === 0 && totalDuplicadosAsignaciones === 0 && totalDuplicadosHistorial === 0) {
        console.log("No se encontraron elementos duplicados");
        return { 
          eliminadosSolicitudes: 0, 
          eliminadosAsignaciones: 0,
          eliminadosHistorial: 0,
          totalSolicitudes: solicitudesTotales,
          totalAsignaciones: asignacionesTotales
        };
      }
      
      console.log(`Se encontraron ${totalDuplicadosSolicitudes} solicitudes duplicadas, ${totalDuplicadosAsignaciones} asignaciones duplicadas y ${totalDuplicadosHistorial} entradas duplicadas en historial`);
      
      const batch = writeBatch(db);
      let eliminadosSolicitudes = 0;
      let eliminadosAsignaciones = 0;
      let eliminadosHistorial = 0;
      
      // Eliminar solicitudes duplicadas (mantener solo la más reciente)
      for (const orden in solicitudesPorOrden) {
        const solicitudes = solicitudesPorOrden[orden];
        
        if (solicitudes.length > 1) {
          // Ordenar por timestamp descendente (más reciente primero)
          solicitudes.sort((a, b) => {
            const timestampA = a.timestamp || 0;
            const timestampB = b.timestamp || 0;
            return timestampB - timestampA;
          });
          
          // Mantener la solicitud más reciente y eliminar el resto
          const solicitudesAEliminar = solicitudes.slice(1);
          
          for (const solicitud of solicitudesAEliminar) {
            batch.delete(doc(db, "solicitudesPendientes", solicitud.docId));
            eliminadosSolicitudes++;
          }
        }
      }
      
      // Eliminar asignaciones duplicadas (mantener solo la más reciente)
      for (const orden in asignacionesPorOrden) {
        const asignaciones = asignacionesPorOrden[orden];
        
        if (asignaciones.length > 1) {
          // Ordenar por timestamp descendente (más reciente primero)
          asignaciones.sort((a, b) => {
            const timestampA = a.timestamp || 0;
            const timestampB = b.timestamp || 0;
            return timestampB - timestampA;
          });
          
          // Mantener la asignación más reciente y eliminar el resto
          const asignacionesAEliminar = asignaciones.slice(1);
          
          for (const asignacion of asignacionesAEliminar) {
            batch.delete(doc(db, "asignaciones", asignacion.docId));
            eliminadosAsignaciones++;
          }
        }
      }
      
      // Eliminar historial duplicado (mantener solo el más reciente por orden y estado)
      for (const key in historialPorOrdenYEstado) {
        const historiales = historialPorOrdenYEstado[key];
        
        if (historiales.length > 1) {
          // Ordenar por timestamp descendente (más reciente primero)
          historiales.sort((a, b) => {
            const timestampA = a.timestamp || 0;
            const timestampB = b.timestamp || 0;
            return timestampB - timestampA;
          });
          
          // Mantener el historial más reciente y eliminar el resto
          const historialesAEliminar = historiales.slice(1);
          
          for (const historial of historialesAEliminar) {
            batch.delete(doc(db, "historialSolicitudes", historial.docId));
            eliminadosHistorial++;
          }
        }
      }
      
      // Ejecutar todas las eliminaciones como batch
      if (eliminadosSolicitudes > 0 || eliminadosAsignaciones > 0 || eliminadosHistorial > 0) {
        await batch.commit();
      }
      
      console.log(`Se eliminaron ${eliminadosSolicitudes} solicitudes duplicadas, ${eliminadosAsignaciones} asignaciones duplicadas y ${eliminadosHistorial} entradas duplicadas en historial`);
      return { 
        eliminadosSolicitudes, 
        eliminadosAsignaciones,
        eliminadosHistorial,
        totalSolicitudes: solicitudesTotales,
        totalAsignaciones: asignacionesTotales
      };
    } catch (error) {
      console.error("Error al eliminar duplicados:", error);
      return { 
        error: error.message, 
        eliminadosSolicitudes: 0,
        eliminadosAsignaciones: 0,
        eliminadosHistorial: 0
      };
    }
  };

  // Modificar el intervalo para ejecutar la verificación a las 2:00 AM cada día
  useEffect(() => {
    // Evitar múltiples programaciones usando una referencia
    if (verificacionProgramadaRef.current) {
      console.log("Verificación ya programada, ignorando programación duplicada");
      return;
    }
    
    verificacionProgramadaRef.current = true;
    
    // Verificar si ya se ejecutó la verificación hoy
    const verificarSiYaEjecutado = () => {
      const ultimaVerificacion = localStorage.getItem('ultimaVerificacionDiaria');
      if (ultimaVerificacion) {
        const fechaUltimaVerificacion = new Date(Number(ultimaVerificacion));
        const ahora = new Date();
        
        // Comparar fecha (ignorando la hora)
        const esHoy = fechaUltimaVerificacion.getDate() === ahora.getDate() &&
                     fechaUltimaVerificacion.getMonth() === ahora.getMonth() &&
                     fechaUltimaVerificacion.getFullYear() === ahora.getFullYear();
        
        if (esHoy) {
          console.log(`La verificación diaria ya se ejecutó hoy a las ${fechaUltimaVerificacion.toLocaleTimeString()}`);
          return true;
        }
      }
      return false;
    };
    
    // Marcar como ejecutado
    const marcarComoEjecutado = () => {
      localStorage.setItem('ultimaVerificacionDiaria', Date.now().toString());
    };
    
    const programarVerificacionDiaria = () => {
      const ahora = new Date();
      const horaVerificacion = new Date();
      horaVerificacion.setHours(2, 0, 0, 0); // Establecer a las 02:00:00
      
      // Si ya pasaron las 2 AM, programar para mañana
      if (ahora.getHours() >= 2) {
        horaVerificacion.setDate(horaVerificacion.getDate() + 1);
      }
      
      // Calcular milisegundos hasta las 2 AM
      const tiempoHastaVerificacion = horaVerificacion.getTime() - ahora.getTime();
      
      console.log(`Verificación diaria programada para ejecutarse en ${Math.floor(tiempoHastaVerificacion / (1000 * 60 * 60))} horas y ${Math.floor((tiempoHastaVerificacion % (1000 * 60 * 60)) / (1000 * 60))} minutos (2:00 AM)`);
    
      // Programar la verificación a las 2 AM
      const timeoutId = setTimeout(() => {
        console.log('Ejecutando verificación diaria programada (2:00 AM)');
        
        // Solo ejecutar si no se ha hecho hoy
        if (!verificarSiYaEjecutado()) {
          verificarYCorregirAsignacionesWrapper().then((resultado) => {
            if (resultado && resultado.success) {
              marcarComoEjecutado();
            }
            // Reprogramar para la próxima verificación después de completar
            programarVerificacionDiaria();
          });
        } else {
          console.log('Saltando verificación, ya se ejecutó hoy');
          programarVerificacionDiaria();
        }
      }, tiempoHastaVerificacion);
      
      return timeoutId;
    };
    
    // Guardar la hora actual para evitar reprogramaciones frecuentes
    const fechaActual = new Date();
    console.log(`Configurando verificación diaria a las 2:00 AM. Hora actual: ${fechaActual.toLocaleTimeString()}`);
    
    // Iniciar la programación
    const timeoutId = programarVerificacionDiaria();
    
    // Limpiar al desmontar
    return () => {
      clearTimeout(timeoutId);
      verificacionProgramadaRef.current = false;
    };
  }, []); // Sin dependencias para ejecutar solo una vez

  // Restaurar el intervalo para eliminar duplicados cada minuto
  useEffect(() => {
    // Primera ejecución: Verificar y limpiar duplicados solo al iniciar la app
    const ejecutarLimpiezaInicial = async () => {
      console.log("Iniciando limpieza inicial de duplicados...");
      
      if (!isProcessing && !loadingProcess) {
        // Limpiar duplicados en solicitudes y asignaciones
        await eliminarSolicitudesDuplicadas();
        
        // Verificar si ya se ha ejecutado la limpieza del historial
        const historialLimpiado = localStorage.getItem('historialLimpiado');
        if (historialLimpiado !== 'true') {
          // Solo ejecutar si no se ha ejecutado antes con éxito
          console.log('Ejecutando limpieza de duplicados en historial...');
          await limpiarDuplicadosHistorial();
        }
      }
    };
    
    // Ejecutar limpieza solo al iniciar la aplicación
    ejecutarLimpiezaInicial();
    
    // NOTA: Eliminamos el setInterval que ejecutaba esta función cada minuto
    // para evitar comprobaciones frecuentes con alto volumen de usuarios
    
    // No hay nada que limpiar en el return porque ya no usamos setInterval
    
  }, [isProcessing, loadingProcess]); // Mantener las dependencias para que se vuelva a ejecutar si el estado cambia

  // Agregar función para volcar datos de historial a solicitudes pendientes
  const volcarHistorialASolicitudesPendientes = async () => {
    try {
      console.log("Volcando datos de historial a solicitudes pendientes...");
      
      // Obtener todos los elementos de historialSolicitudes
      const historialSnapshot = await getDocs(collection(db, "historialSolicitudes"));
      
      if (historialSnapshot.empty) {
        console.log("No hay entradas en el historial para procesar");
        return { volcados: 0 };
      }
      
      // Convertir a array para procesamiento
      const historialData = historialSnapshot.docs.map(doc => ({
        ...doc.data(),
        docId: doc.id
      }));
      
      console.log(`Se encontraron ${historialData.length} entradas en el historial`);
      
      // Mostrar algunos ejemplos de datos para diagnóstico
      const ejemplos = historialData.slice(0, 5);
      console.log("Ejemplos de entradas en historial:", ejemplos);
      
      // Contar los diferentes estados
      const conteoEstados = {};
      historialData.forEach(entrada => {
        const estado = entrada.estado || "SIN_ESTADO";
        conteoEstados[estado] = (conteoEstados[estado] || 0) + 1;
      });
      console.log("Conteo de estados en historial:", conteoEstados);
      
      // Verificar cuántas entradas tienen centrosIds
      const conCentrosIds = historialData.filter(entrada => entrada.centrosIds && entrada.centrosIds.length > 0).length;
      console.log(`Entradas con centrosIds válidos: ${conCentrosIds} de ${historialData.length}`);
      
      // Obtener solicitudes pendientes actuales para evitar duplicados
      const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
      const ordenesExistentes = new Set();
      solicitudesSnapshot.docs.forEach(doc => {
        const solicitud = doc.data();
        if (solicitud.orden) {
          ordenesExistentes.add(solicitud.orden);
        }
      });
      
      // Obtener asignaciones actuales para evitar duplicados
      const asignacionesSnapshot = await getDocs(collection(db, "asignaciones"));
      asignacionesSnapshot.docs.forEach(doc => {
        const asignacion = doc.data();
        if (asignacion.order) {
          ordenesExistentes.add(asignacion.order);
        }
      });
      
      console.log(`Se encontraron ${ordenesExistentes.size} órdenes ya existentes`);
      
      // Filtrar entradas para volcar - modificar para incluir más casos
      const entradasAVolcar = historialData.filter(entrada => {
        // Si no tiene orden, no podemos procesarla
        if (!entrada.orden) {
          return false;
        }
        
        // Si ya está en solicitudes pendientes o asignaciones, no la duplicamos
        if (ordenesExistentes.has(entrada.orden)) {
          return false;
        }
        
        // Si no tiene centrosIds pero tiene centroId (de una asignación), lo usamos
        if ((!entrada.centrosIds || !entrada.centrosIds.length) && entrada.centroId) {
          // Añadir centrosIds dinámicamente si tiene centroId
          entrada.centrosIds = [entrada.centroId];
          return true;
        }
        
        // Si tiene centrosIds válidos, la incluimos
        return entrada.centrosIds && entrada.centrosIds.length > 0;
      });
      
      console.log(`Se volcarán ${entradasAVolcar.length} entradas del historial`);
      
      if (entradasAVolcar.length === 0) {
        return { volcados: 0 };
      }
      
      // Mostrar ejemplos de las entradas que se van a volcar
      console.log("Ejemplos de entradas a volcar:", entradasAVolcar.slice(0, 3));
      
      // Crear solicitudes pendientes en lotes
      const BATCH_SIZE = 100;
      let volcados = 0;
      
      for (let i = 0; i < entradasAVolcar.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const lote = entradasAVolcar.slice(i, i + BATCH_SIZE);
        
        for (const entrada of lote) {
          // Crear nueva solicitud pendiente con los datos del historial
          const nuevaSolicitud = {
            orden: entrada.orden,
            centrosIds: entrada.centrosIds || [entrada.centroId], // Usar centroId como fallback
            timestamp: Date.now(),
            intentosFallidos: 0
          };
          
          // Verificar que no hay valores undefined
          const solicitudValida = {};
          Object.entries(nuevaSolicitud).forEach(([key, value]) => {
            if (value !== undefined) {
              solicitudValida[key] = value;
            } else if (key === 'centrosIds') {
              // Si centrosIds es undefined pero tenemos centroId
              if (entrada.centroId) {
                solicitudValida.centrosIds = [entrada.centroId];
              } else {
                console.warn(`No se pudo recuperar centrosIds para orden ${entrada.orden}`);
              }
            }
          });
          
          // Solo añadir si tiene los campos necesarios
          if (solicitudValida.orden && solicitudValida.centrosIds) {
            const docRef = doc(collection(db, "solicitudesPendientes"));
            batch.set(docRef, solicitudValida);
            volcados++;
          }
        }
        
        await batch.commit();
        console.log(`Procesado lote ${i / BATCH_SIZE + 1} (${lote.length} entradas)`);
      }
      
      console.log(`Se volcaron ${volcados} entradas del historial a solicitudes pendientes`);
      return { volcados };
    } catch (error) {
      console.error("Error al volcar datos del historial:", error);
      return { error: error.message, volcados: 0 };
    }
  };

  // Función para verificar la conexión con Firebase
  const verificarConexionFirebase = async () => {
    try {
      // Intentar realizar una consulta simple a cualquier colección
      const testCheck = await getDocs(query(collection(db, "centros"), limit(1)));
      console.log("Conexión con Firebase verificada correctamente.");
      return { success: true, message: "Conexión establecida correctamente." };
    } catch (error) {
      console.error("Error de conexión con Firebase:", error);
      showNotification("Error de conexión con la base de datos. Por favor, verifica tu conexión a internet.", "error");
      return { success: false, error: error, message: error.message };
    }
  };

  // Modificar el useEffect de inicialización para verificar la conexión
  useEffect(() => {
    let unsubscribe;
    
    const inicializarApp = async () => {
      // Usar refs para controlar el estado de inicialización
      if (cargandoRef.current || cargaCompletadaRef.current) {
        return;
      }
      
      cargandoRef.current = true;
      
      try {
        // Activar modo mantenimiento durante la carga inicial
        setIsVerificationMaintenance(true);
        setMaintenanceMessage("Iniciando sistema y verificando conexión...");
        setMaintenanceProgress(5);
        
        // Verificar conexión con Firebase primero
        const conexionResult = await verificarConexionFirebase();
        if (!conexionResult.success) {
          setMaintenanceMessage(`Error de conexión: ${conexionResult.message}. Intenta recargar la página.`);
          return;
        }
        
        setMaintenanceMessage("Verificando datos...");
        setMaintenanceProgress(10);
        
        // Resto del código de inicialización...
        // Comprobar si ya hay datos en Firebase
        const centrosSnapshot = await getDocs(collection(db, "centros"));
        const centrosCount = centrosSnapshot.size;
        
        if (centrosCount === 0) {
          setMaintenanceMessage("Cargando datos iniciales...");
          setMaintenanceProgress(20);
          await limpiarColeccion("centros"); // Asegurar que está vacío
          
          // Intentar cargar automáticamente primero
          const cargaAutomaticaExitosa = await cargarCSVAutomatico();
          
          // Si la carga automática falla, intentar con el método manual
          if (!cargaAutomaticaExitosa) {
          await cargarDesdePlazasCSV();
          }
        } else {
          setMaintenanceMessage("Cargando datos existentes...");
          setMaintenanceProgress(30);
          await cargarDatosDesdeFirebase();
        }
        
        // Una vez cargados los datos, configurar listeners para actualizaciones
        unsubscribe = setupFirebaseListeners();
        
        setMaintenanceMessage("Limpiando duplicados iniciales...");
        setMaintenanceProgress(50);
        
        // Ejecutar una verificación inicial para eliminar duplicados
        console.log("Ejecutando limpieza inicial de duplicados");
        const resultadoLimpieza = await eliminarSolicitudesDuplicadas();
        
        // Mostrar información de la limpieza
        if (resultadoLimpieza.error) {
          console.error("Error durante la limpieza inicial:", resultadoLimpieza.error);
        } else {
          const totalEliminados = resultadoLimpieza.eliminadosSolicitudes + 
                                resultadoLimpieza.eliminadosAsignaciones + 
                                resultadoLimpieza.eliminadosHistorial;
          
          console.log(`Limpieza inicial completada: ${totalEliminados} elementos duplicados eliminados`);
        }
        
        // Volcar los datos de historialSolicitudes a solicitudesPendientes
        setMaintenanceMessage("Moviendo solicitudes históricas a pendientes...");
        setMaintenanceProgress(60);
        
        try {
          const resultadoVolcado = await volcarHistorialASolicitudesPendientes();
          if (resultadoVolcado.error) {
            console.error("Error en el volcado de historial:", resultadoVolcado.error);
          } else if (resultadoVolcado.volcados > 0) {
            console.log(`Volcado inicial: ${resultadoVolcado.volcados} solicitudes recuperadas del historial`);
            setMaintenanceMessage(`Recuperadas ${resultadoVolcado.volcados} solicitudes del historial`);
          } else {
            console.log("No hubo solicitudes para recuperar del historial");
          }
        } catch (errorVolcado) {
          console.error("Error durante el volcado de historial:", errorVolcado);
        }
        
        setMaintenanceMessage("Procesando solicitudes pendientes...");
        setMaintenanceProgress(70);
        
        // Procesar inmediatamente todas las solicitudes pendientes
        try {
          console.log("Procesando todas las solicitudes pendientes al inicio...");
          await procesarTodasLasSolicitudes();
          
          // Verificar si hay solicitudes pendientes después del procesamiento
          const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
          const cantidadSolicitudesPendientes = solicitudesSnapshot.docs.length;
          
          setMaintenanceProgress(100);
          
          if (cantidadSolicitudesPendientes > 0) {
            setMaintenanceMessage(`Hay ${cantidadSolicitudesPendientes} solicitudes pendientes por procesar.`);
            console.log(`Quedan ${cantidadSolicitudesPendientes} solicitudes pendientes después del procesamiento inicial`);
            // Mantener el modo mantenimiento activo
          } else {
            setMaintenanceMessage("¡Sistema iniciado correctamente!");
            
            // Desactivar modo mantenimiento después de un breve retraso
            setTimeout(() => {
              setIsVerificationMaintenance(false);
              showNotification("Sistema iniciado correctamente.", "success");
            }, 2000);
          }
        } catch (errorProceso) {
          console.error("Error al procesar solicitudes iniciales:", errorProceso);
          setMaintenanceMessage(`Error al procesar solicitudes: ${errorProceso.message}`);
          setMaintenanceProgress(100);
          
          // Intentar desactivar modo mantenimiento después de un error
          setTimeout(() => {
            setIsVerificationMaintenance(false);
            showNotification("Se produjo un error durante el procesamiento inicial: " + errorProceso.message, "error");
          }, 2000);
        }
        
        cargaCompletadaRef.current = true;
      } catch (error) {
        console.error("Error durante la inicialización:", error);
        setMaintenanceMessage(`Error: ${error.message}`);
        
        // Intentar desactivar modo mantenimiento después de un error
        setTimeout(() => {
          setIsVerificationMaintenance(false);
          showNotification("Error durante la inicialización: " + error.message, "error");
        }, 2000);
      } finally {
        cargandoRef.current = false;
      }
    };
    
    inicializarApp();
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  // Función para verificar y corregir asignaciones
  const verificarYCorregirAsignacionesWrapper = async () => {
    try {
      // Verificar si ya se ejecutó la verificación hoy
      const verificarSiYaEjecutado = () => {
        const ultimaVerificacion = localStorage.getItem('ultimaVerificacionDiaria');
        if (ultimaVerificacion) {
          const fechaUltimaVerificacion = new Date(Number(ultimaVerificacion));
          const ahora = new Date();
          
          // Comparar fecha (ignorando la hora)
          const esHoy = fechaUltimaVerificacion.getDate() === ahora.getDate() &&
                       fechaUltimaVerificacion.getMonth() === ahora.getMonth() &&
                       fechaUltimaVerificacion.getFullYear() === ahora.getFullYear();
          
          if (esHoy) {
            console.log(`La verificación diaria ya se ejecutó hoy a las ${fechaUltimaVerificacion.toLocaleTimeString()}`);
            return true;
          }
        }
        return false;
      };
      
      // Si ya se ejecutó hoy, mostrar mensaje y no continuar
      if (verificarSiYaEjecutado()) {
        showNotification("La verificación de asignaciones ya se ejecutó hoy. Solo se permite una vez al día.", "info");
        return { success: true, message: "Verificación ya ejecutada hoy", yaRealizada: true };
      }
      
      setMaintenanceProgress(0);
      setIsVerificationMaintenance(true);
      setMaintenanceMessage('Iniciando verificación de asignaciones...');
      
      // Esperar un momento para que se muestre la pantalla de mantenimiento
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Asegurar que availablePlazas sea un array
      if (!availablePlazas || !Array.isArray(availablePlazas)) {
        console.error("Error: availablePlazas debe ser un array", availablePlazas);
        setMaintenanceMessage("Error: No hay datos de centros disponibles");
        await new Promise(resolve => setTimeout(resolve, 2000));
        setIsVerificationMaintenance(false);
        showNotification("Error: No hay datos de centros disponibles", "error");
        return;
      }
      
      setMaintenanceProgress(20);
      setMaintenanceMessage('Analizando datos de centros y plazas...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Asegurar que assignments sea un array
      if (!assignments || !Array.isArray(assignments)) {
        console.error("Error: assignments debe ser un array", assignments);
        setMaintenanceMessage("Error: No hay datos de asignaciones");
        await new Promise(resolve => setTimeout(resolve, 2000));
        setIsVerificationMaintenance(false);
        showNotification("Error: No hay datos de asignaciones", "error");
        return;
      }
      
      setMaintenanceProgress(40);
      setMaintenanceMessage('Comprobando excesos de asignaciones en centros...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Encontrar centros con exceso de asignaciones
      const centrosConExceso = availablePlazas.filter(centro => centro.asignadas > centro.plazas);
      
      if (centrosConExceso.length === 0) {
        setMaintenanceProgress(100);
        setMaintenanceMessage('No se encontraron centros con exceso de asignaciones. Todo está correcto.');
        await new Promise(resolve => setTimeout(resolve, 2000));
        setIsVerificationMaintenance(false);
        showNotification("Verificación completada: No hay centros con exceso de asignaciones", "success");
        
        // Marcar como ejecutado para hoy
        localStorage.setItem('ultimaVerificacionDiaria', Date.now().toString());
        return { success: true, message: "No hay centros con exceso", corregidos: 0 };
      }
      
      // Mostrar información sobre los centros con exceso
      setMaintenanceProgress(60);
      setMaintenanceMessage(`Encontrados ${centrosConExceso.length} centros con exceso de asignaciones. Comenzando reasignación...`);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Llamar a la función original con los parámetros validados
      const resultado = await verificarYCorregirAsignaciones(availablePlazas, assignments, db);
      
      setMaintenanceProgress(90);
      setMaintenanceMessage(resultado.success 
        ? `${resultado.message}. Actualizando interfaz...` 
        : `Error durante la verificación: ${resultado.message}`);
      
      // Recargar datos desde Firebase después de las correcciones
      await cargarDatosDesdeFirebase();
      
      setMaintenanceProgress(100);
      setMaintenanceMessage(resultado.success 
        ? `Verificación completada exitosamente. Se corrigieron ${resultado.corregidos} asignaciones (${resultado.reasignados} reasignadas).` 
        : `Error durante la verificación: ${resultado.message}`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsVerificationMaintenance(false);
      
      if (resultado.success) {
        showNotification(resultado.message, "success");
        // Marcar como ejecutado para hoy
        localStorage.setItem('ultimaVerificacionDiaria', Date.now().toString());
      } else {
        showNotification(resultado.message || "Error al verificar asignaciones", "error");
      }
      
      return resultado;
    } catch (error) {
      console.error("Error al verificar asignaciones:", error);
      setMaintenanceMessage(`Error al verificar asignaciones: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsVerificationMaintenance(false);
      showNotification("Error al verificar asignaciones: " + error.message, "error");
    }
  };

  // Función específica para limpiar duplicados en historialSolicitudes
  const limpiarDuplicadosHistorial = async () => {
    try {
      // Verificar si ya se ha ejecutado con éxito
      const historialLimpiado = localStorage.getItem('historialLimpiado');
      if (historialLimpiado === 'true') {
        console.log('La limpieza del historial ya se ha realizado con éxito anteriormente');
        return { success: true, eliminados: 0, yaRealizado: true };
      }

      setProcessingMessage && setProcessingMessage("Limpiando duplicados en historial de solicitudes...");
      
      // Obtener todas las entradas del historial
      // Usamos un enfoque más robusto para asegurar que obtenemos todos los documentos
      const historialDocs = [];
      
      // Obtenemos hasta 10.000 documentos en cada consulta para asegurar completitud
      const querySnapshot = await getDocs(query(
        collection(db, "historialSolicitudes"),
        limit(10000)
      ));
      
      querySnapshot.forEach(doc => {
        historialDocs.push({ ...doc.data(), docId: doc.id });
      });
      
      if (historialDocs.length === 0) {
        showNotification("No hay entradas en el historial de solicitudes", "info");
        return { success: true, eliminados: 0 };
      }
      
      console.log(`Procesando ${historialDocs.length} documentos del historial`);
      
      // Esta vez agruparemos por:
      // 1. Número de orden
      // 2. Estado
      // 3. Centro asignado (si existe)
      // 4. Fecha (usando solo la fecha, no la hora)
      const historialAgrupado = {};
      
      historialDocs.forEach(historial => {
        const orden = historial.orden;
        
        if (!orden) return; // Ignorar entradas sin número de orden
        
        // Extraer fecha (solo día) del timestamp si existe
        let fecha = "desconocida";
        if (historial.timestamp) {
          const date = new Date(historial.timestamp);
          fecha = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
        } else if (historial.fechaHistorico) {
          // Intentar extraer fecha de fechaHistorico si está en formato ISO
          fecha = historial.fechaHistorico.split('T')[0];
        }
        
        const estado = historial.estado || 'DESCONOCIDO';
        const centroId = historial.centroId || historial.centroAsignado || 'sin-centro';
        
        // Clave compuesta para agrupar entradas similares
        const key = `${orden}-${estado}-${centroId}-${fecha}`;
        
        if (!historialAgrupado[key]) {
          historialAgrupado[key] = [historial];
        } else {
          historialAgrupado[key].push(historial);
        }
      });
      
      // Contar duplicados
      let totalDuplicados = 0;
      Object.values(historialAgrupado).forEach(grupo => {
        if (grupo.length > 1) {
          totalDuplicados += (grupo.length - 1);
        }
      });
      
      if (totalDuplicados === 0) {
        showNotification("No se encontraron entradas duplicadas en el historial", "success");
        // Marcar como completado
        localStorage.setItem('historialLimpiado', 'true');
        return { success: true, eliminados: 0 };
      }
      
      console.log(`Se encontraron ${totalDuplicados} entradas duplicadas para eliminar`);
      
      // Para batches grandes, necesitamos dividir en múltiples operaciones
      // Firestore tiene un límite de 500 operaciones por batch
      const BATCH_SIZE = 450;
      let eliminados = 0;
      let totalOperaciones = 0;
      let entradasAEliminar = [];
      
      // Recopilar todas las entradas a eliminar primero
      for (const key in historialAgrupado) {
        const grupo = historialAgrupado[key];
        
        if (grupo.length > 1) {
          // Ordenar por timestamp descendente para mantener el más reciente
          grupo.sort((a, b) => {
            const timestampA = a.timestamp || 0;
            const timestampB = b.timestamp || 0;
            return timestampB - timestampA;
          });
          
          // Mantener solo la entrada más reciente, eliminar el resto
          entradasAEliminar.push(...grupo.slice(1));
        }
      }
      
      // Procesar por lotes
      for (let i = 0; i < entradasAEliminar.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const loteActual = entradasAEliminar.slice(i, i + BATCH_SIZE);
        
        for (const entrada of loteActual) {
          if (entrada.docId) {
            batch.delete(doc(db, "historialSolicitudes", entrada.docId));
            eliminados++;
          }
        }
        
        // Ejecutar el batch
        await batch.commit();
        totalOperaciones += loteActual.length;
        console.log(`Procesado lote ${Math.floor(i/BATCH_SIZE) + 1}: ${loteActual.length} elementos (total ${totalOperaciones}/${entradasAEliminar.length})`);
        
        // Pequeña pausa para no sobrecargar Firestore
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Actualizar mensaje para informar progreso
        setProcessingMessage && setProcessingMessage(`Limpiando duplicados: ${totalOperaciones}/${entradasAEliminar.length} (${Math.round(totalOperaciones/entradasAEliminar.length*100)}%)`);
      }
      
      if (eliminados > 0) {
        console.log(`Se eliminaron ${eliminados} entradas duplicadas del historial`);
        showNotification(`Se han eliminado ${eliminados} entradas duplicadas del historial`, "success");
        
        // Marcar como completado solo si se procesaron todos con éxito
        localStorage.setItem('historialLimpiado', 'true');
      }
      
      // Recargar datos
      await cargarDatosDesdeFirebase();
      
      return { success: true, eliminados };
      
    } catch (error) {
      console.error("Error al limpiar duplicados del historial:", error);
      showNotification(`Error al limpiar duplicados: ${error.message}`, "error");
      return { success: false, error: error.message };
    } finally {
      setProcessingMessage && setProcessingMessage("");
    }
  };

  // Función para verificar contraseña de administrador
  const handleAdminAuth = () => {
    if (adminPassword === 'SoyAdmin') {
      setShowPasswordModal(false);
      setAdminPassword('');
      setPasswordError(false);
      // Ejecutar verificación
      verificarYCorregirAsignacionesWrapper();
    } else {
      setPasswordError(true);
      setTimeout(() => setPasswordError(false), 3000);
    }
  };

  return (
    <div className="App" style={styles.container}>
      {/* Modal de contraseña para administrador */}
      {showPasswordModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.7)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            width: '300px',
            maxWidth: '90%'
          }}>
            <h3 style={{ marginTop: 0, color: '#333' }}>Autenticación Requerida</h3>
            <p style={{ fontSize: '14px', color: '#666' }}>
              Ingrese la contraseña de administrador para continuar.
            </p>
            
            <input
              type="password"
              placeholder="Contraseña"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAdminAuth()}
              style={{
                width: '100%',
                padding: '10px',
                border: passwordError ? '1px solid #e74c3c' : '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '10px'
              }}
            />
            
            {passwordError && (
              <p style={{ color: '#e74c3c', fontSize: '12px', marginTop: 0 }}>
                Contraseña incorrecta. Inténtelo de nuevo.
              </p>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setAdminPassword('');
                  setPasswordError(false);
                }}
                style={{
                  padding: '8px 15px',
                  backgroundColor: '#f1f1f1',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleAdminAuth}
                style={{
                  padding: '8px 15px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Verificar
              </button>
            </div>
          </div>
        </div>
      )}
    
      {/* Pantalla de mantenimiento durante la verificación */}
      {isVerificationMaintenance && (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#0a192f',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    color: 'white',
    padding: '20px'
  }}>
    <div style={{
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      borderRadius: '16px',
      padding: '40px',
      maxWidth: '500px',
      width: '90%',
      textAlign: 'center',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
      backdropFilter: 'blur(8px)'
    }}>
      <div style={{
        fontSize: '28px',
        fontWeight: 'bold',
        marginBottom: '20px',
        color: '#64ffda'
      }}>
        SISTEMA EN MANTENIMIENTO
      </div>
      
      <div style={{
        fontSize: '18px',
        lineHeight: '1.6',
        marginBottom: '10px'
      }}>
        {maintenanceMessage || 'Estamos verificando y actualizando las asignaciones...'}
      </div>

      {/* Nuevo bloque para mostrar solicitudes pendientes */}
      <div style={{ fontSize: '16px', marginBottom: '20px' }}>
        Solicitudes pendientes: {solicitudes.length}
      </div>
      
      <div style={{
        width: '100%',
        height: '8px',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '4px',
        marginBottom: '10px',
        overflow: 'hidden'
      }}>
        <div style={{
          height: '100%',
          width: `${maintenanceProgress}%`,
          backgroundColor: '#64ffda',
          borderRadius: '4px',
          transition: 'width 0.5s ease'
        }} />
      </div>
      
      <div style={{ fontSize: '14px', color: '#8892b0' }}>
        {maintenanceProgress}% completado
      </div>
      
      <div style={{
        marginTop: '30px',
        fontSize: '14px',
        color: '#8892b0',
        fontStyle: 'italic'
      }}>
        Por favor espere. El sistema volverá a estar disponible automáticamente.
      </div>
    </div>
  </div>
)}

      
      <div style={styles.header}>
        <h1 style={styles.title}>Sistema de Asignación de Plazas</h1>
        
        {/* Botón de verificación para administrador - solo aparece si no se ha ejecutado hoy */}
        {(() => {
          const ultimaVerificacion = localStorage.getItem('ultimaVerificacionDiaria');
          if (!ultimaVerificacion) return true; // Nunca se ha ejecutado
          
          const fechaUltimaVerificacion = new Date(Number(ultimaVerificacion));
          const ahora = new Date();
          
          // Comparar fecha (ignorando la hora)
          const noSeHaEjecutadoHoy = !(fechaUltimaVerificacion.getDate() === ahora.getDate() &&
                     fechaUltimaVerificacion.getMonth() === ahora.getMonth() &&
                     fechaUltimaVerificacion.getFullYear() === ahora.getFullYear());
          
          return noSeHaEjecutadoHoy; // Mostrar solo si no se ha ejecutado hoy
        })() && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            zIndex: 50
          }}>
            <button
              onClick={() => setShowPasswordModal(true)}
              style={{
                padding: '12px 20px',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '15px',
                fontWeight: '500',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              🔄 Verificar Asignaciones Hoy
            </button>
          </div>
        )}
       
      <div style={styles.tabs}>
        <div 
          style={{
            ...styles.tab,
            ...(activeTab === 'asignaciones' ? styles.activeTab : styles.inactiveTab)
          }}
          onClick={() => setActiveTab('asignaciones')}
        >
          📋 Historial de Asignaciones
        </div>
        <div 
          style={{
            ...styles.tab,
            ...(activeTab === 'solicitudes' ? styles.activeTab : styles.inactiveTab)
          }}
          onClick={() => setActiveTab('solicitudes')}
        >
          🔍 Solicitudes Pendientes
        </div>
        <div 
          style={{
            ...styles.tab,
            ...(activeTab === 'plazas' ? styles.activeTab : styles.inactiveTab)
          }}
          onClick={() => setActiveTab('plazas')}
        >
          🏢 Plazas Disponibles
          </div>
        </div>
      </div>
      
      {/* Información de última actualización */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '15px',
        fontSize: '14px',
        color: '#666',
        padding: '8px 12px',
        backgroundColor: '#f0f8ff',
        borderRadius: '6px'
      }}>
        <div>
          <span style={{fontWeight: 'bold', marginRight: '5px'}}>Plazas disponibles:</span>
          {7066 - assignments.length} de 7066
           {' '}
        </div>
        <div style={{display: 'flex', alignItems: 'center',flexWrap: 'wrap'}}>
          {solicitudes.length > 0 && (
            <span style={{marginRight: '10px', color: loadingProcess ? '#e74c3c' : '#2ecc71'}}>
              {loadingProcess ? (
                <>
                  <span style={{
                    display: 'inline-block', 
                    width: '12px', 
                    height: '12px', 
                    border: '2px solid rgba(231,76,60,0.3)', 
                    borderRadius: '50%', 
                    borderTopColor: '#e74c3c', 
                    animation: 'spin 1s linear infinite',
                    marginRight: '5px',
                    verticalAlign: 'middle'
                  }}></span>
                  Procesando {solicitudes.length} solicitudes...
                </>
              ) : (
                <>
                  <span style={{color: '#2ecc71', marginRight: '5px'}}>●</span>
                  {solicitudes.length} solicitudes pendientes 
                </>
              )}
            </span>
          )}
          <span style={{fontWeight: 'bold', marginRight: '5px'}}>Última actualización:</span>
          {lastProcessed && typeof lastProcessed.getTime === 'function' ? 
            (() => {
              const hours = lastProcessed.getHours();
              const minutes = lastProcessed.getMinutes();
              // No mostrar el mensaje si son las 2:00 AM exactamente
              if (hours === 2 && minutes === 0) {
                return "Actualizado";
              } else {
                return new Intl.DateTimeFormat('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                }).format(lastProcessed);
              }
            })()
            : 'No disponible'}
        </div>
      </div>
      
      {/* Contenido según la pestaña activa */}
      {activeTab === 'asignaciones' && (
        <div style={styles.cardContainer}>
          <h3 style={styles.sectionTitle}>Historial de Asignaciones</h3>
          <Dashboard assignments={assignments} availablePlazas={availablePlazas} />
        </div>
      )}
      
      {activeTab === 'solicitudes' && (
        <div style={styles.cardContainer}>
          <h3 style={styles.sectionTitle}>Solicitudes Pendientes</h3>
          <SolicitudesPendientes 
            solicitudes={solicitudes || []} 
            assignments={assignments || []} 
            availablePlazas={availablePlazas || []} 
          />
        </div>
      )}
      
      {activeTab === 'plazas' && (
        <div style={styles.cardContainer}>
          <h3 style={styles.sectionTitle}>Plazas Disponibles</h3>
          {availablePlazas.length > 0 ? (
            <PlazasDisponibles 
              availablePlazas={availablePlazas}
              assignments={assignments}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              orderNumber={orderNumber}
              setOrderNumber={setOrderNumber}
              centrosSeleccionados={centrosSeleccionados}
              setCentrosSeleccionados={setCentrosSeleccionados}
              handleOrderSubmit={enviarSolicitud}
              isProcessing={isProcessing}
            />
          ) : (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px 20px',
              backgroundColor: '#f5f7fa',
              borderRadius: '8px',
              color: '#5c6c7c'
            }}>
              <div style={{ fontSize: '36px', marginBottom: '15px' }}>🏢</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
                Cargando plazas...
              </div>
              <div style={{ fontSize: '14px', marginBottom: '20px' }}>
                Por favor espera mientras se cargan los datos de los centros.
              </div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                gap: '10px'
              }}>
                <div style={{ 
                  width: '20px', 
                  height: '20px', 
                  border: '3px solid rgba(0,0,0,0.1)', 
                  borderRadius: '50%', 
                  borderTopColor: '#3498db', 
                  animation: 'spin 1s linear infinite'
                }}></div>
                <div>Cargando datos...</div>
              </div>
            </div>
          )}
        </div>
      )}
      
      <Footer />
      
      {/* Popup de notificación */}
      {showPopup && (
        <div style={{
          ...styles.popup,
          backgroundColor: popupType === 'success' ? '#d4edda' : 
                          popupType === 'warning' ? '#fff3cd' : '#f8d7da',
          color: popupType === 'success' ? '#155724' : 
                popupType === 'warning' ? '#856404' : '#721c24',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>{popupMessage}</div>
            <button
              onClick={() => setShowPopup(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '18px',
                marginLeft: '10px',
                color: 'inherit'
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
      
      {(loadingProcess || loadingCSV) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 999
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 0 20px rgba(0,0,0,0.2)',
            maxWidth: '500px',
            width: '90%',
            textAlign: 'center'
          }}>
            <div style={{ marginBottom: '15px', fontSize: '18px' }}>
              {loadingCSV ? 'Cargando datos...' : 'Procesando solicitudes...'}
            </div>
            <div>{processingMessage}</div>
            <div style={{
              width: '100%',
              height: '4px',
              backgroundColor: '#f1f1f1',
              borderRadius: '2px',
              marginTop: '15px',
              overflow: 'hidden',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: '30%',
                backgroundColor: '#3498db',
                borderRadius: '2px',
                animation: 'loading 1.5s infinite ease-in-out'
              }}></div>
            </div>
          </div>
    </div>
      )}
      
      {/* Estilos CSS */}
      <style>{`
        @keyframes slideIn {
          0% { transform: translateX(100%); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes loading {
          0% { left: -30%; }
          100% { left: 100%; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default App;
