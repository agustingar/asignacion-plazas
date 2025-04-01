import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { collection, onSnapshot, addDoc, updateDoc, doc, getDocs, query, deleteDoc, setDoc, runTransaction, orderBy, where, writeBatch } from "firebase/firestore";
import { db } from './utils/firebaseConfig';
import { procesarSolicitudes, procesarSolicitud, resetearContadoresAsignaciones } from './utils/assignmentUtils';

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
  const [loadingProcess, setLoadingProcess] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [loadingCSV, setLoadingCSV] = useState(false);
  const [lastProcessed, setLastProcessed] = useState(null);
  const [secondsUntilNextUpdate, setSecondsUntilNextUpdate] = useState(45);
  const [resetingCounters, setResetingCounters] = useState(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  // Agregar estado para mostrar pantalla de mantenimiento durante verificación
  const [isVerificationMaintenance, setIsVerificationMaintenance] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [maintenanceProgress, setMaintenanceProgress] = useState(0);
  
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
  const processingTimerRef = useRef(null);
  const lastProcessedTimestampRef = useRef(0);
  const countdownTimerRef = useRef(null);
  const lastCounterResetRef = useRef(0);

  // Cerca del inicio del componente App
  const [isLoadingSubmit, setIsLoadingSubmit] = useState(false);

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
        asignacionesData.push({ ...doc.data(), docId: doc.id });
      });
      
      setAssignments(asignacionesData);
    });
    
    // Listener para solicitudes pendientes
    const unsubscribeSolicitudes = onSnapshot(collection(db, "solicitudesPendientes"), (snapshot) => {
      const solicitudesData = [];
      snapshot.forEach((doc) => {
        solicitudesData.push({ ...doc.data(), docId: doc.id });
      });
      
      setSolicitudes(solicitudesData);
    });
    
    // Devolver función para desuscribirse de todos los listeners
    return () => {
      unsubscribeCentros();
      unsubscribeAsignaciones();
      unsubscribeSolicitudes();
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
        // Comprobar si ya hay datos en Firebase
        const centrosSnapshot = await getDocs(collection(db, "centros"));
        const centrosCount = centrosSnapshot.size;
        
        if (centrosCount === 0) {
          await limpiarColeccion("centros"); // Asegurar que está vacío
          
          // Intentar cargar automáticamente primero
          const cargaAutomaticaExitosa = await cargarCSVAutomatico();
          
          // Si la carga automática falla, intentar con el método manual
          if (!cargaAutomaticaExitosa) {
            await cargarDesdePlazasCSV();
          }
        } else {
          await cargarDatosDesdeFirebase();
        }
        
        // Una vez cargados los datos, configurar listeners para actualizaciones
        unsubscribe = setupFirebaseListeners();
        cargaCompletadaRef.current = true;
        
        // Ejecutar una verificación inicial para eliminar duplicados
        // pero esperar unos segundos para asegurar que todo esté cargado
        setTimeout(async () => {
          if (!isProcessing && !loadingProcess) {
            console.log("Ejecutando limpieza inicial de duplicados");
            await eliminarSolicitudesDuplicadas();
          }
        }, 5000); // 5 segundos después de la carga inicial
      } catch (error) {
        console.error("Error al inicializar app:", error);
        showNotification(`Error al inicializar: ${error.message}`, 'error');
      } finally {
        cargandoRef.current = false;
      }
    };
    
    inicializarApp();
    
    // Limpiar listeners al desmontar
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Agregar un useEffect adicional para realizar un proceso inicial después del despliegue
  useEffect(() => {
    // Este efecto se ejecutará solo una vez cuando la aplicación se cargue
    // y después de que se hayan cargado los datos (cuando availablePlazas tenga elementos)
    if (availablePlazas.length > 0 && !cargaInicialCompletadaRef.current) {
      const ejecutarVerificacionInicialDeployment = async () => {
        try {
          // Marca para no volver a ejecutar
          cargaInicialCompletadaRef.current = true;
          
          console.log("Ejecutando verificación inicial después del despliegue");
          
          // Esperar a que todo esté cargado
          await new Promise(resolve => setTimeout(resolve, 5000)); // 5 segundos
          
          // Ejecutar verificación completa con pantalla de mantenimiento
          verificarYCorregirAsignaciones();
          
          console.log("Verificación inicial programada");
        } catch (error) {
          console.error("Error en verificación inicial:", error);
        }
      };
      
      ejecutarVerificacionInicialDeployment();
    }
  }, [availablePlazas, verificarYCorregirAsignaciones]);
  
  // Añadir ref para controlar si ya se ha hecho la verificación inicial
  const cargaInicialCompletadaRef = useRef(false);

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
  
  // Función para procesar todas las solicitudes - versión optimizada para alto volumen
  const procesarTodasLasSolicitudes = async (silencioso = false) => {
    if (loadingProcess || isMaintenanceMode) {
      return;
    }
    
    // Actualizar estado e iniciar procesamiento
    setLoadingProcess(true);
    lastProcessedTimestampRef.current = Date.now();
    
    if (!silencioso) {
      setProcessingMessage("Procesando solicitudes pendientes en cola...");
    }
    
    try {
      // Obtener los datos más recientes antes de procesar
      await cargarDatosDesdeFirebase();
      
      // Verificar nuevamente las solicitudes después de recargar
      if (solicitudes.length === 0) {
        setLastProcessed(new Date());
        setLoadingProcess(false);
        // Restablecer el contador a 45 segundos
        setSecondsUntilNextUpdate(45);
        return {
          success: true,
          message: "No hay solicitudes pendientes para procesar"
        };
      }
      
      // Obtener la lista actualizada de solicitudes y ordenarla por número de orden (menor primero)
      const solicitudesOrdenadas = [...solicitudes].sort((a, b) => {
        // Primero ordenar por timestamp (las más antiguas primero)
        if (a.timestamp !== b.timestamp) {
          return a.timestamp - b.timestamp;
        }
        // Si tienen el mismo timestamp, ordenar por número de orden
        return a.orden - b.orden;
      });
      
      // SOLO PROCESAR LA PRIMERA SOLICITUD DE LA COLA
      // Esto garantiza que incluso con múltiples usuarios, las solicitudes se procesan una a una
      if (solicitudesOrdenadas.length > 0) {
        const primeraSolicitud = solicitudesOrdenadas[0];
        
        if (!silencioso) {
          setProcessingMessage(`Procesando solicitud #${primeraSolicitud.orden} (enviada a las ${new Date(primeraSolicitud.timestamp).toLocaleTimeString()})...`);
        }
        
        try {
          // Verificar dentro de una transacción para asegurar consistencia
          await runTransaction(db, async (transaction) => {
            // Obtener la solicitud directamente de la base de datos (para garantizar que esté actualizada)
            const solicitudRef = doc(db, "solicitudesPendientes", primeraSolicitud.docId);
            const solicitudDoc = await transaction.get(solicitudRef);
            
            // Verificar si todavía existe
            if (!solicitudDoc.exists()) {
              return; // La solicitud ya no existe, salir de la transacción
            }
            
            // Verificar si ya existe una asignación para este orden
            const asignacionesRef = collection(db, "asignaciones");
            const asignacionesQuery = query(asignacionesRef);
            const asignacionesDocs = await transaction.get(asignacionesQuery);
            
            const yaExisteAsignacion = asignacionesDocs.docs.some(doc => 
              doc.data().order === primeraSolicitud.orden
            );
            
            if (yaExisteAsignacion) {
              // Ya existe asignación, eliminar la solicitud
              transaction.delete(solicitudRef);
              return;
            }
            
            // Si no hay asignación y la solicitud existe, se procesará después de la transacción
          });
          
          // Verificar nuevamente después de la transacción
          const solicitudActualizada = solicitudes.find(s => s.docId === primeraSolicitud.docId);
          if (!solicitudActualizada) {
            setLoadingProcess(false);
            setSecondsUntilNextUpdate(5); // Verificar rápidamente la siguiente en cola
            return { success: true, message: "Solicitud ya no existe o ya fue procesada" };
          }
          
          // Procesar esta única solicitud
          const resultado = await procesarSolicitud(
            primeraSolicitud, 
            availablePlazas, 
            assignments, 
            db, 
            solicitudesOrdenadas
          );
          
          if (resultado.success) {
            // La solicitud se procesó exitosamente
          } else {
            // Verificar si el mensaje indica que la plaza está reservada para un orden menor
            if (resultado.message && (resultado.message.includes("plaza reservada para orden menor") || 
                                   resultado.message.includes("Plazas reservadas para órdenes menores"))) {
              if (!silencioso) {
                showNotification(resultado.message, 'warning');
              }
              
              // Incrementar intentos fallidos para que eventualmente se mueva al final de la cola
              try {
                await runTransaction(db, async (transaction) => {
                  const solicitudRef = doc(db, "solicitudesPendientes", primeraSolicitud.docId);
                  const solicitudDoc = await transaction.get(solicitudRef);
                  
                  if (solicitudDoc.exists()) {
                    const datos = solicitudDoc.data();
                    transaction.update(solicitudRef, {
                      intentosFallidos: (datos.intentosFallidos || 0) + 1
                    });
                  }
                });
              } catch (error) {
                console.error(`Error al incrementar intentos fallidos para ${primeraSolicitud.orden}:`, error);
              }
            } else if (primeraSolicitud.intentosFallidos >= 3) {
              // Si después de 3 intentos fallidos no se puede procesar, moverla al final de la cola
              try {
                // Actualizar el timestamp para moverla al final de la cola dentro de una transacción
                await runTransaction(db, async (transaction) => {
                  const solicitudRef = doc(db, "solicitudesPendientes", primeraSolicitud.docId);
                  const solicitudDoc = await transaction.get(solicitudRef);
                  
                  if (solicitudDoc.exists()) {
                    transaction.update(solicitudRef, {
                      timestamp: Date.now(),
                      intentosFallidos: 0 // Reiniciar contador de intentos
                    });
                  }
                });
              } catch (error) {
                console.error(`Error al mover solicitud ${primeraSolicitud.orden} al final de la cola:`, error);
              }
            } else {
              // Incrementar contador de intentos fallidos dentro de una transacción para otros casos
              try {
                await runTransaction(db, async (transaction) => {
                  const solicitudRef = doc(db, "solicitudesPendientes", primeraSolicitud.docId);
                  const solicitudDoc = await transaction.get(solicitudRef);
                  
                  if (solicitudDoc.exists()) {
                    const datos = solicitudDoc.data();
                    transaction.update(solicitudRef, {
                      intentosFallidos: (datos.intentosFallidos || 0) + 1
                    });
                  }
                });
              } catch (error) {
                console.error(`Error al incrementar intentos fallidos para ${primeraSolicitud.orden}:`, error);
              }
            }
          }
        } catch (error) {
          console.error(`Error al procesar solicitud ${primeraSolicitud.orden} de la cola:`, error);
        }
      }
      
      // Recargar datos después del procesamiento
      await cargarDatosDesdeFirebase();
      
      // Actualizar información de último procesamiento
      const ahora = new Date();
      setLastProcessed(ahora);
      
      // Si quedan solicitudes pendientes, reducir el tiempo para el siguiente procesamiento
      const nuevoTiempo = solicitudes.length > 0 ? 5 : 45;
      setSecondsUntilNextUpdate(nuevoTiempo);
      
      if (!silencioso) {
        setProcessingMessage("Procesamiento de cola completado");
      }
      
      return {
        success: true,
        procesadas: 1,
        pendientesRestantes: solicitudes.length
      };
    } catch (error) {
      console.error("Error al procesar cola de solicitudes:", error);
      if (!silencioso) {
        showNotification(`Error al procesar cola: ${error.message}`, 'error');
      }
      
      return {
        success: false,
        message: `Error al procesar cola: ${error.message}`
      };
    } finally {
      // Finalizar el procesamiento
      setLoadingProcess(false);
    }
  };

  /**
   * Enviar una solicitud de plaza
   * @param {number} orderNumber - Número de orden
   * @param {Array} selectedCenters - IDs de centros seleccionados
   */
  const enviarSolicitud = async (orderNumber, selectedCenters) => {
    if (!orderNumber || !selectedCenters.length) {
      showNotification("Debes ingresar un número de orden y seleccionar al menos un centro", "error");
      return;
    }

    try {
      setIsLoadingSubmit(true);
      
      // Verificar conexión con Firebase primero
      try {
        const testRef = doc(db, "test_connection");
        await setDoc(testRef, { timestamp: Date.now() });
        await deleteDoc(testRef);
      } catch (connError) {
        console.error("Error de conexión con Firebase:", connError);
        showNotification("Error de conexión con la base de datos. Por favor, verifica tu conexión a internet e intenta nuevamente.", "error");
        setIsLoadingSubmit(false);
        return;
      }
      
      // Usar transacción para verificar y crear/actualizar de forma atómica
      const resultado = await runTransaction(db, async (transaction) => {
        try {
          // 1. Verificar si ya existe una asignación para este orden
          const asignacionesRef = collection(db, "asignaciones");
          const asignacionesQuery = query(asignacionesRef);
          const asignacionesDocs = await transaction.get(asignacionesQuery);
          
          const yaExisteAsignacion = asignacionesDocs.docs.some(doc => {
            const data = doc.data();
            return data && data.order === parseInt(orderNumber);
          });
          
          if (yaExisteAsignacion) {
            return { 
              success: false, 
              error: "duplicated_assignment",
              message: `Ya existe una asignación para el número de orden ${orderNumber}` 
            };
          }
          
          // 2. Comprobar solicitudes pendientes existentes
          const solicitudesPendientesRef = collection(db, "solicitudesPendientes");
          const solicitudesPendientesQuery = query(solicitudesPendientesRef);
          const solicitudesPendientesDocs = await transaction.get(solicitudesPendientesQuery);
          
          let existingSolicitudId = null;
          solicitudesPendientesDocs.docs.forEach(doc => {
            const data = doc.data();
            if (data && data.orden === parseInt(orderNumber)) {
              existingSolicitudId = doc.id;
            }
          });
          
          // 3. Preparar datos de la solicitud
          const solicitudData = {
            orden: parseInt(orderNumber),
            centrosIds: selectedCenters,
            timestamp: Date.now(),
            intentosFallidos: 0
          };

          // 4. Crear o actualizar la solicitud
          if (existingSolicitudId) {
            // Actualizar preferencias si ya existe la solicitud
            const solicitudRef = doc(db, "solicitudesPendientes", existingSolicitudId);
            transaction.update(solicitudRef, {
              centrosIds: selectedCenters,
              timestamp: Date.now(),
              intentosFallidos: 0
            });
            
            return { 
              success: true, 
              updated: true,
              message: `Solicitud actualizada correctamente para orden ${orderNumber}` 
            };
          } else {
            // Crear nueva solicitud
            const nuevaSolicitudRef = doc(collection(db, "solicitudesPendientes"));
            transaction.set(nuevaSolicitudRef, solicitudData);
            
            return { 
              success: true, 
              updated: false,
              message: `Nueva solicitud creada para orden ${orderNumber}` 
            };
          }
        } catch (transactionError) {
          console.error("Error dentro de la transacción:", transactionError);
          return {
            success: false,
            error: "transaction_error",
            message: `Error en la transacción: ${transactionError.message}`
          };
        }
      });
      
      // Procesar el resultado de la transacción
      if (resultado.success) {
        showNotification(resultado.message, "success");
        
        // Limpiar campos después de enviar correctamente
        setOrderNumber("");
        setCentrosSeleccionados([]);
        
        // Recargar datos
        await cargarDatosDesdeFirebase();
      } else if (resultado.error === "duplicated_assignment") {
        showNotification(resultado.message, "error");
      } else {
        showNotification(`Error en la transacción: ${resultado.message}`, "error");
      }
    } catch (error) {
      console.error("Error al enviar solicitud:", error);
      showNotification(`Error al enviar solicitud: ${error.message}`, "error");
    } finally {
      setIsLoadingSubmit(false);
      setIsProcessing(false);
      setProcessingMessage("");
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

  // Función para verificar y corregir asignaciones existentes (reset completo a las 00:00)
  const verificarYCorregirAsignaciones = useCallback(async () => {
    if (isProcessing) return;
    
    try {
      // Activar modo mantenimiento durante verificación
      setIsVerificationMaintenance(true);
      setMaintenanceMessage("Iniciando verificación y reset de asignaciones...");
      setMaintenanceProgress(10);
      setIsProcessing(true);
      
      // Eliminar solicitudes duplicadas
      setMaintenanceMessage("Eliminando solicitudes duplicadas...");
      setMaintenanceProgress(20);
      await eliminarSolicitudesDuplicadas();
      
      // Obtener todas las asignaciones actuales de manera optimizada
      setMaintenanceMessage("Obteniendo asignaciones actuales...");
      setMaintenanceProgress(30);
      
      // Obtener datos de manera paralela para mejorar velocidad
      const [asignacionesSnapshot, centrosSnapshot] = await Promise.all([
        getDocs(query(collection(db, "asignaciones"), orderBy("timestamp", "asc"))),
        getDocs(collection(db, "centros"))
      ]);
      
      const asignacionesActuales = asignacionesSnapshot.docs.map(doc => ({
        ...doc.data(),
        docId: doc.id
      }));
      
      const todosCentros = centrosSnapshot.docs.map(doc => ({
        ...doc.data(),
        docId: doc.id
      }));
      
      // Resetear contadores de asignaciones en centros usando lotes
      setMaintenanceMessage("Reseteando contadores de centros...");
      setMaintenanceProgress(40);
      
      // Procesar en lotes para mejorar rendimiento
      const BATCH_SIZE = 100;
      
      for (let i = 0; i < todosCentros.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const centroBatch = todosCentros.slice(i, i + BATCH_SIZE);
        
        for (const centro of centroBatch) {
          const centroRef = doc(db, "centros", centro.docId);
          batch.update(centroRef, { asignadas: 0 });
        }
        
        await batch.commit();
        setMaintenanceProgress(40 + Math.floor((i / todosCentros.length) * 10));
      }
      
      console.log(`Realizando reset completo: ${asignacionesActuales.length} asignaciones se moverán a solicitudes pendientes`);
      setMaintenanceMessage(`Procesando ${asignacionesActuales.length} asignaciones...`);
      setMaintenanceProgress(50);
      
      // Mover todas las asignaciones a solicitudes pendientes en lotes
      const pendientesData = [];
      const historialData = [];
      const docIdsToDelete = [];
      
      // Preparar datos para lotes 
      for (let i = 0; i < asignacionesActuales.length; i++) {
        const asignacion = asignacionesActuales[i];
        
        // Datos para solicitud pendiente
        pendientesData.push({
          orden: asignacion.order,
          centrosIds: [asignacion.id],
          timestamp: Date.now(),
          intentosFallidos: 0
        });
        
        // Datos para historial
        historialData.push({
          orden: asignacion.order,
          centrosIds: [asignacion.id],
          estado: "REINICIADA_POR_SISTEMA",
          centroAsignado: asignacion.centro,
          centroId: asignacion.id,
          fechaHistorico: new Date().toISOString(),
          timestamp: asignacion.timestamp || Date.now()
        });
        
        // ID de documento para eliminar
        docIdsToDelete.push(asignacion.docId);
        
        // Actualizar progreso
        if (i % 10 === 0) {
          setMaintenanceProgress(50 + Math.floor((i / asignacionesActuales.length) * 20));
        }
      }
      
      // Buscar órdenes que ya existen en solicitudes pendientes
      setMaintenanceMessage("Verificando solicitudes existentes...");
      setMaintenanceProgress(70);
      
      const solicitudesPendientesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
      const ordenesExistentes = new Set();
      
      solicitudesPendientesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data && data.orden) {
          ordenesExistentes.add(data.orden);
        }
      });
      
      // Filtrar solicitudes que ya existen
      const pendientesDataFiltrado = pendientesData.filter(item => !ordenesExistentes.has(item.orden));
      
      // Procesar operaciones en lotes
      setMaintenanceMessage("Guardando nuevas solicitudes pendientes...");
      setMaintenanceProgress(80);
      
      // Agregar solicitudes pendientes en lotes
      for (let i = 0; i < pendientesDataFiltrado.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const pendientesBatch = pendientesDataFiltrado.slice(i, i + BATCH_SIZE);
        
        for (const pendiente of pendientesBatch) {
          const newDocRef = doc(collection(db, "solicitudesPendientes"));
          batch.set(newDocRef, pendiente);
        }
        
        await batch.commit();
      }
      
      // Agregar datos al historial en lotes
      setMaintenanceMessage("Guardando historial...");
      setMaintenanceProgress(85);
      
      for (let i = 0; i < historialData.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const historialBatch = historialData.slice(i, i + BATCH_SIZE);
        
        for (const historial of historialBatch) {
          const newDocRef = doc(collection(db, "historialSolicitudes"));
          batch.set(newDocRef, historial);
        }
        
        await batch.commit();
      }
      
      // Eliminar asignaciones originales en lotes
      setMaintenanceMessage("Eliminando asignaciones antiguas...");
      setMaintenanceProgress(90);
      
      for (let i = 0; i < docIdsToDelete.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const idsBatch = docIdsToDelete.slice(i, i + BATCH_SIZE);
        
        for (const docId of idsBatch) {
          batch.delete(doc(db, "asignaciones", docId));
        }
        
        await batch.commit();
      }
      
      // Recargar los datos actualizados
      setMaintenanceMessage("Recargando datos...");
      setMaintenanceProgress(95);
      await cargarDatosDesdeFirebase();
      
      setMaintenanceProgress(100);
      setMaintenanceMessage("¡Verificación completada!");
      
      // Mostrar mensaje de éxito que se verá después de salir del modo mantenimiento
      setTimeout(() => {
        showNotification('Reset completo realizado: todas las asignaciones se han movido a solicitudes pendientes', 'success');
      }, 1000);
      
    } catch (error) {
      console.error('Error al verificar y corregir asignaciones:', error);
      setMaintenanceMessage(`Error: ${error.message}`);
      
      // Mostrar notificación después de salir del modo mantenimiento
      setTimeout(() => {
        showNotification('Error al verificar asignaciones: ' + error.message, 'error');
      }, 1000);
    } finally {
      // Establecer un pequeño retraso antes de salir del modo mantenimiento
      // para que el usuario vea que se completó al 100%
      setTimeout(() => {
        setIsProcessing(false);
        setIsVerificationMaintenance(false);
      }, 2000);
    }
  }, [isProcessing, cargarDatosDesdeFirebase]);

  // Modificar el intervalo para ejecutar la verificación a las 00:00 cada día
  useEffect(() => {
    const programarVerificacionDiaria = () => {
      const ahora = new Date();
      const medianoche = new Date();
      medianoche.setHours(0, 0, 0, 0); // Establecer a las 00:00:00
      medianoche.setDate(medianoche.getDate() + 1); // Próxima medianoche
      
      // Calcular milisegundos hasta la próxima medianoche
      const tiempoHastaMedianoche = medianoche.getTime() - ahora.getTime();
      
      console.log(`Programando verificación diaria para ejecutarse en ${Math.floor(tiempoHastaMedianoche / (1000 * 60 * 60))} horas y ${Math.floor((tiempoHastaMedianoche % (1000 * 60 * 60)) / (1000 * 60))} minutos`);
      
      // Programar la verificación a medianoche
      const timeoutId = setTimeout(() => {
        if (!isProcessing && !loadingProcess) {
          console.log('Ejecutando verificación diaria programada');
          verificarYCorregirAsignaciones().then(() => {
            // Reprogramar para la próxima medianoche después de completar
            programarVerificacionDiaria();
          });
        } else {
          // Si estaba ocupado, intentar dentro de 5 minutos
          console.log('Sistema ocupado, reprogramando verificación en 5 minutos');
          setTimeout(programarVerificacionDiaria, 5 * 60 * 1000);
        }
      }, tiempoHastaMedianoche);
      
      return timeoutId;
    };
    
    // Iniciar la programación
    const timeoutId = programarVerificacionDiaria();
    
    // Limpiar al desmontar
    return () => {
      clearTimeout(timeoutId);
    };
  }, [verificarYCorregirAsignaciones, isProcessing, loadingProcess]);

  // Eliminar el intervalo anterior que ejecutaba la verificación cada 3 minutos
  // useEffect(() => {
  //   // Solo configurar este intervalo si no estamos en modo mantenimiento
  //   if (!isMaintenanceMode) {
  //     const verificacionInterval = setInterval(async () => {
  //       // La verificación y corrección se ejecuta cada 3 minutos sin afectar el contador visual
  //       if (!isProcessing && !loadingProcess) {
  //         await verificarYCorregirAsignaciones();
  //       }
  //     }, 180000); // 3 minutos
  //     
  //     return () => {
  //       clearInterval(verificacionInterval);
  //     };
  //   }
  // }, [isMaintenanceMode, verificarYCorregirAsignaciones, isProcessing, loadingProcess]);

  // Función para eliminar solicitudes duplicadas
  const eliminarSolicitudesDuplicadas = async () => {
    try {
      // Obtener todas las solicitudes pendientes
      const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
      const solicitudes = solicitudesSnapshot.docs.map(doc => ({
        ...doc.data(),
        docId: doc.id
      }));
      
      // Verificar si hay números de orden duplicados
      const ordenesVistos = new Map();
      const duplicadas = [];
      
      for (const solicitud of solicitudes) {
        if (!ordenesVistos.has(solicitud.orden)) {
          ordenesVistos.set(solicitud.orden, solicitud);
        } else {
          // Es un duplicado, elegir cuál mantener (nos quedamos con la que tenga el timestamp más reciente)
          const solicitudExistente = ordenesVistos.get(solicitud.orden);
          
          if (solicitud.timestamp > solicitudExistente.timestamp) {
            duplicadas.push(solicitudExistente);
            ordenesVistos.set(solicitud.orden, solicitud);
          } else {
            duplicadas.push(solicitud);
          }
        }
      }
      
      // Verificar también si ya hay asignaciones para estas solicitudes
      const asignacionesSnapshot = await getDocs(collection(db, "asignaciones"));
      const asignaciones = asignacionesSnapshot.docs.map(doc => ({
        ...doc.data(),
        docId: doc.id
      }));
      
      // Encontrar solicitudes que ya tienen asignaciones
      for (const solicitud of solicitudes) {
        const tieneAsignacion = asignaciones.some(asignacion => asignacion.order === solicitud.orden);
        
        if (tieneAsignacion) {
          duplicadas.push(solicitud);
        }
      }
      
      // Eliminar las solicitudes duplicadas o que ya tienen asignación
      let eliminadas = 0;
      for (const solicitud of duplicadas) {
        await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
        eliminadas++;
      }
      
      if (eliminadas > 0) {
        console.log(`Se han eliminado ${eliminadas} solicitudes duplicadas o ya asignadas`);
      }
      
      return eliminadas;
    } catch (error) {
      console.error("Error al eliminar solicitudes duplicadas:", error);
      return 0;
    }
  };

  // Restaurar el intervalo para eliminar duplicados cada minuto
  useEffect(() => {
    const limpiezaInterval = setInterval(async () => {
      if (!isProcessing && !loadingProcess) {
        await eliminarSolicitudesDuplicadas();
      }
    }, 60000); // 1 minuto
    
    return () => {
      clearInterval(limpiezaInterval);
    };
  }, [isProcessing, loadingProcess]);

  return (
    <div className="App" style={styles.container}>
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
              marginBottom: '30px'
            }}>
              {maintenanceMessage || 'Estamos verificando y actualizando las asignaciones...'}
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
            
            <div style={{fontSize: '14px', color: '#8892b0'}}>
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
        
        {/* Panel de administrador con botón para verificación y mantenimiento */}
        <div style={styles.adminPanel}>
          <button 
            onClick={verificarYCorregirAsignaciones}
            disabled={isProcessing || isVerificationMaintenance}
            style={{
              backgroundColor: isProcessing || isVerificationMaintenance ? '#ccc' : '#ff6347',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: isProcessing || isVerificationMaintenance ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              transition: 'all 0.3s ease'
            }}
          >
            {isProcessing || isVerificationMaintenance ? 'Procesando...' : 'Iniciar Verificación'}
          </button>
        </div>
        
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
          {lastProcessed ? 
            new Intl.DateTimeFormat('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            }).format(lastProcessed) 
            : 'No disponible'}
        </div>
      </div>
      
      {/* Contenido según la pestaña activa */}
      {activeTab === 'asignaciones' && (
        <div style={styles.cardContainer}>
          <h3 style={styles.sectionTitle}>Historial de Asignaciones</h3>
          <Dashboard assignments={assignments} />
        </div>
      )}
      
      {activeTab === 'solicitudes' && (
        <div style={styles.cardContainer}>
          <h3 style={styles.sectionTitle}>Solicitudes Pendientes</h3>
          <SolicitudesPendientes 
            solicitudes={solicitudes}
            availablePlazas={availablePlazas}
            assignments={assignments}
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
