import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './App.css';
import { collection, onSnapshot, addDoc, updateDoc, doc, getDocs, query, deleteDoc, setDoc, runTransaction, orderBy, where, writeBatch, limit, serverTimestamp } from "firebase/firestore";
import { db } from './utils/firebaseConfig';
import { 
  procesarSolicitudes, 
  procesarSolicitud, 
  verificarYCorregirAsignaciones,
  resetearContadoresAsignaciones
} from './utils/assignmentUtils';
import * as XLSX from 'xlsx';

// Importar componentes
import Dashboard from './components/Dashboard';
import PlazasDisponibles from './components/PlazasDisponibles';
import SolicitudesPendientes from './components/SolicitudesPendientes';
import Footer from './components/Footer';
import Admin from './components/Admin'; // Importar el componente Admin

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
  // Modificar: inicializar en false para no mostrar siempre al cargar
  const [isVerificationMaintenance, setIsVerificationMaintenance] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('Iniciando sistema y verificando datos...');
  const [maintenanceProgress, setMaintenanceProgress] = useState(10);
  
  // Añadir estado para identificar si estamos en el modo admin
  const [isAdminView, setIsAdminView] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminAuthAttempted, setAdminAuthAttempted] = useState(false);
  
  // Estados para el formulario de solicitud
  const [orderNumber, setOrderNumber] = useState('');
  const [centrosSeleccionados, setCentrosSeleccionados] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [assignment, setAssignment] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Añadir un estado separado para el buscador de solicitudes
  const [searchTermSolicitudes, setSearchTermSolicitudes] = useState('');
  
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

  // Añadir estados para el buscador del panel de administración
  const [adminSearchTerm, setAdminSearchTerm] = useState('');
  const [adminSearchFilter, setAdminSearchFilter] = useState('all'); // 'all', 'order', 'center'

  // Añadir los estados que faltan en los hooks al inicio del componente
  const [centros, setCentros] = useState({});
  const [asignaciones, setAsignaciones] = useState({});
  const [solicitudesPendientes, setSolicitudesPendientes] = useState({});
  const [plazasDisponibles, setPlazasDisponibles] = useState({});
  const [contadores, setContadores] = useState({
    asignaciones: 0,
    pendientes: 0,
    centros: 0,
    historial: 0
  });

  // Estado para manejar el proceso de carga
  const [isLoading, setIsLoading] = useState(false);

  // Constante para el intervalo de actualización (5 minutos)
  const INTERVALO_ACTUALIZACION = 5 * 60 * 1000;

  // Variable para rastrear la última actualización
  let ultimaActualizacionCentros = 0;
  let ultimaActualizacionAsignaciones = 0;
  let ultimaActualizacionSolicitudes = 0;

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
            const text = await response.text();
            file = new Blob([text], { type: 'text/csv' });
          } else {
            console.log("CSV no encontrado en la ubicación predeterminada, abriendo diálogo de selección...");
            // Si falla, recurrimos al diálogo de selección manual
            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.accept = '.csv,.xlsx';
            
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
          fileInput.accept = '.csv,.xlsx';
          
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
      // Ya no limpiamos la colección, obtenemos los centros existentes
      setProcessingMessage("Obteniendo centros existentes...");
      const centrosExistentesSnapshot = await getDocs(collection(db, "centros"));
      
      // Crear un mapa de centros existentes por código para búsqueda rápida
      const centrosExistentesPorCodigo = {};
      const centrosExistentesPorNombre = {};
      
      centrosExistentesSnapshot.forEach(doc => {
        const centro = doc.data();
        if (centro.codigo) {
          centrosExistentesPorCodigo[centro.codigo] = {
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
      
      console.log(`Se encontraron ${centrosExistentesSnapshot.size} centros existentes`);
      
      // Procesar el archivo según su tipo
      let text;
      const fileName = file.name ? file.name.toLowerCase() : '';
      
      if (fileName.endsWith('.xlsx')) {
        // Procesamiento de archivo Excel
        setProcessingMessage("Procesando archivo Excel...");
        // Aquí necesitaríamos una librería como xlsx para procesar Excel
        // Por ahora podemos mostrar un mensaje de error
        throw new Error("El procesamiento de archivos Excel no está implementado aún");
      } else {
        // Procesamiento de CSV
        setProcessingMessage("Procesando archivo CSV...");
        // Leer como texto si es un CSV
        text = await file.text();
      }
      
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
      const nuevoscentros = [];
      const centrosActualizados = [];
      let nextId = Object.keys(centrosExistentesPorCodigo).length + 1; // Comenzar desde el siguiente ID
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
        
        // Comprobar si el centro ya existe
        const centroExistente = centrosExistentesPorCodigo[codigo];
        const nombreNormalizado = centro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const centroExistentePorNombre = centrosExistentesPorNombre[nombreNormalizado];
        
        if (centroExistente) {
          // Actualizar centro existente manteniendo su ID y asignaciones actuales
          centrosActualizados.push({
            ...centroExistente,
            asi: asi || centroExistente.asi,
            departamento: departamento || centroExistente.departamento,
            centro: centro || centroExistente.centro,
            localidad: municipio || centroExistente.localidad,
            municipio: municipio || centroExistente.municipio,
            plazas: plazas,
            // Mantener asignadas para no perder las asignaciones actuales
            asignadas: centroExistente.asignadas || 0
          });
        } else if (centroExistentePorNombre) {
          // Actualizar por nombre si no encontramos por código
          centrosActualizados.push({
            ...centroExistentePorNombre,
            asi: asi || centroExistentePorNombre.asi,
            departamento: departamento || centroExistentePorNombre.departamento,
            codigo: codigo || centroExistentePorNombre.codigo,
            localidad: municipio || centroExistentePorNombre.localidad,
            municipio: municipio || centroExistentePorNombre.municipio,
            plazas: plazas,
            // Mantener asignadas para no perder las asignaciones actuales
            asignadas: centroExistentePorNombre.asignadas || 0
          });
        } else {
          // Añadir nuevo centro
          nuevoscentros.push({
            id: String(nextId++), // Convertir a string para mantener consistencia
          asi: asi,
          departamento: departamento,
          codigo: codigo,
          centro: centro,
          localidad: municipio,
          municipio: municipio,
          plazas: plazas,
          asignadas: 0
        });
        }
        
        if ((nuevoscentros.length + centrosActualizados.length) % 100 === 0) {
          setProcessingMessage(`Procesando CSV: ${nuevoscentros.length} nuevos, ${centrosActualizados.length} actualizados...`);
        }
      }
      
      const totalCentros = nuevoscentros.length + centrosActualizados.length;
      
      if (totalCentros === 0) {
        throw new Error("No se pudieron extraer centros válidos del CSV");
      }
      
      // No ajustamos el total de plazas para mantener los valores exactos
      
      // Primero actualizar centros existentes
      setProcessingMessage(`Actualizando ${centrosActualizados.length} centros existentes...`);
      for (const centro of centrosActualizados) {
        if (centro.docId) {
          await updateDoc(doc(db, "centros", centro.docId), {
            ...centro,
            // No sobrescribir el docId
          });
        }
      }
      
      // Añadir los nuevos centros a Firebase
      setProcessingMessage(`Añadiendo ${nuevoscentros.length} nuevos centros a Firebase...`);
      
      // Añadir centros por lotes para mayor eficiencia
      const BATCH_SIZE = 100;
      for (let i = 0; i < nuevoscentros.length; i += BATCH_SIZE) {
        const batch = nuevoscentros.slice(i, i + BATCH_SIZE);
        
        setProcessingMessage(`Añadiendo nuevos centros: ${i}/${nuevoscentros.length}`);
        
        // Procesar el lote actual
        for (const centro of batch) {
          const docRef = doc(collection(db, "centros"));
          await setDoc(docRef, {
            ...centro,
            docId: docRef.id
          });
        }
      }
      
      setProcessingMessage("Datos cargados correctamente");
      
      // Cargar datos actualizados de Firebase
      await cargarDatosDesdeFirebase();
      
      setLoadingCSV(false);
      showNotification(`Se han actualizado ${centrosActualizados.length} centros y añadido ${nuevoscentros.length} nuevos centros correctamente`, 'success');
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
    console.log("Iniciando carga de datos desde Firebase...");
    
    try {
      // DIAGNÓSTICO: Verificar qué colecciones existen
      console.log("Verificando colecciones disponibles en Firebase...");
      
      // Cargar centros - probar diferentes nombres de colección
      console.log("Intentando cargar centros...");
      let centrosSnapshot = await getDocs(collection(db, "centros"));
      
      if (centrosSnapshot.empty) {
        console.warn("⚠️ No se encontraron centros en la colección 'centros'");
        // Intentar con nombre alternativo
        const centrosAltRef = collection(db, "centrosTrabajo");
        centrosSnapshot = await getDocs(centrosAltRef);
        
        if (centrosSnapshot.empty) {
          console.error("❌ No se encontraron centros en ninguna colección");
        } else {
          console.log("✅ Se encontraron centros en la colección 'centrosTrabajo':", centrosSnapshot.size);
        }
      } else {
        console.log("✅ Se encontraron centros en la colección 'centros':", centrosSnapshot.size);
      }
      
      // Cargar asignaciones para calcular correctamente las plazas asignadas
      console.log("Intentando cargar asignaciones para contar plazas ocupadas...");
      let asignacionesSnapshot = await getDocs(collection(db, "asignaciones"));
      
      if (asignacionesSnapshot.empty) {
        console.warn("⚠️ No se encontraron asignaciones en la colección 'asignaciones'");
        // Intentar con nombre alternativo
        const asignacionesAltRef = collection(db, "asignacionesActuales");
        asignacionesSnapshot = await getDocs(asignacionesAltRef);
        
        if (asignacionesSnapshot.empty) {
          console.error("❌ No se encontraron asignaciones en ninguna colección");
        } else {
          console.log("✅ Se encontraron asignaciones en la colección 'asignacionesActuales':", asignacionesSnapshot.size);
        }
      } else {
        console.log("✅ Se encontraron asignaciones en la colección 'asignaciones':", asignacionesSnapshot.size);
      }
      
      // Cargar asignaciones recreadas para filtrarlas
      let idsAsignacionesRecreadas = new Set();
      try {
        const asignacionesRecreadasSnapshot = await getDocs(collection(db, "asignacionesRecreadas"));
        if (!asignacionesRecreadasSnapshot.empty) {
          asignacionesRecreadasSnapshot.forEach(doc => {
            const data = doc.data();
            if (data && !data.eliminada && data.asignacionId) {
              idsAsignacionesRecreadas.add(data.asignacionId);
            }
          });
          console.log(`Se encontraron ${idsAsignacionesRecreadas.size} asignaciones recreadas que serán filtradas`);
        }
      } catch (error) {
        console.warn("No se pudieron cargar las asignaciones recreadas:", error);
      }
      
      // Contar asignaciones por centro (excluyendo las recreadas)
      const asignacionesPorCentro = {};
      let asignacionesValidas = [];
      asignacionesSnapshot.forEach(doc => {
        const data = doc.data();
        // Excluir asignaciones recreadas
        if (idsAsignacionesRecreadas.has(doc.id)) {
          console.log(`Filtrando asignación recreada: ${doc.id}`);
          return;
        }
        
        asignacionesValidas.push({
          id: doc.id,
          docId: doc.id,
          ...data
        });
        
        if (data && data.centerId) {
          const centroId = data.centerId;
          asignacionesPorCentro[centroId] = (asignacionesPorCentro[centroId] || 0) + 1;
        }
      });
      
      // Asegurar que cada asignación tenga la propiedad reasignado correctamente definida
      asignacionesValidas = asignacionesValidas.map(asignacion => {
        // Establecer reasignado = true si el estado es REASIGNADO, aunque la propiedad no esté definida
        if (asignacion.estado === 'REASIGNADO' && !asignacion.reasignado) {
          return { ...asignacion, reasignado: true };
        }
        return asignacion;
      });

      console.log("Conteo de asignaciones por centro:", asignacionesPorCentro);
      
      // Creamos estructuras para detectar duplicados
      const idsUnicos = new Set();
      const codigosUnicos = new Set();
      const nombresUnicos = new Map(); // Usamos Map para guardar {nombreNormalizado: id}
      const todosCentros = [];
      
      // Primera pasada: recopilar y normalizar todos los centros
      centrosSnapshot.forEach(doc => {
        const data = doc.data();
        
        // Normalizar el nombre para detectar duplicados
        const nombre = data.nombre || data.centro || "Centro sin nombre";
        const nombreNormalizado = nombre.toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
          .replace(/\s+/g, ' ').trim(); // Normalizar espacios
        
        // Obtener código si existe
        const codigo = data.codigoCentro || data.codigo || "";
        
        // Datos normalizados del centro
        const plazasTotal = parseInt(data.plazas || data.plazasTotal || 0, 10);
        const plazasAsignadas = asignacionesPorCentro[doc.id] || 0;
        const plazasDisponibles = Math.max(0, plazasTotal - plazasAsignadas);
        
        // Añadir a la lista completa con metadatos para filtrado posterior
        todosCentros.push({
          id: doc.id, // Mantener como string, no convertir a número
          docId: doc.id, // Mantener referencia al documento original
          nombre,
          nombreNormalizado,
          codigo,
          plazas: plazasTotal,
          asignadas: plazasAsignadas,
          plazasDisponibles,
          plazasOcupadas: plazasAsignadas,
          plazasTotal,
          direccion: data.direccion || "",
          codigoCentro: codigo,
          estadoCentro: data.estadoCentro || "Activo",
          municipio: data.municipio || "",
          localidad: data.localidad || "",
          // Información de duplicidad (se llenará después)
          esDuplicado: false,
          duplicadoDe: null
        });
      });
      
      console.log(`Se encontraron ${todosCentros.length} centros en total antes de filtrar`);
      
      // Segunda pasada: marcar duplicados
      for (let i = 0; i < todosCentros.length; i++) {
        const centro = todosCentros[i];
        
        // Si ya está marcado como duplicado, continuar
        if (centro.esDuplicado) continue;
        
        // Verificar si el ID ya fue procesado
        if (idsUnicos.has(centro.id)) {
          centro.esDuplicado = true;
          continue;
        }
        
        // Verificar si el código ya fue procesado (solo si tiene código)
        if (centro.codigo && codigosUnicos.has(centro.codigo)) {
          // Marcar como posible duplicado, pero seguir procesando
          console.warn(`Posible duplicado por código: ${centro.codigo} - ${centro.nombre}`);
        }
        
        // Verificar si el nombre normalizado ya fue procesado
        if (nombresUnicos.has(centro.nombreNormalizado)) {
          const idOriginal = nombresUnicos.get(centro.nombreNormalizado);
          console.warn(`Duplicado por nombre: "${centro.nombre}" duplica a ID=${idOriginal}`);
          centro.esDuplicado = true;
          centro.duplicadoDe = idOriginal;
          continue;
        }
        
        // Si llegamos aquí, este centro es único hasta ahora
        idsUnicos.add(centro.id);
        if (centro.codigo) codigosUnicos.add(centro.codigo);
        nombresUnicos.set(centro.nombreNormalizado, centro.id);
      }
      
      // Tercera pasada: filtrar duplicados y limitar a 366 centros
      const centrosFiltrados = todosCentros.filter(centro => !centro.esDuplicado);
      
      console.log(`Después de eliminar duplicados, quedan ${centrosFiltrados.length} centros`);
      
      // Si todavía tenemos más de 366 centros, limitamos por prioridad
      // (asumimos que los centros con más plazas son más importantes)
      let centrosFinales = centrosFiltrados;
      if (centrosFinales.length > 366) {
        console.warn(`Aún hay más centros (${centrosFinales.length}) de los esperados (366). Limitando...`);
        
        // Ordenar por número de plazas (mayor a menor) y tomar los primeros 366
        centrosFinales = [...centrosFinales].sort((a, b) => b.plazasTotal - a.plazasTotal).slice(0, 366);
      }
      
      // Convertir a objeto para mantener compatibilidad con el resto del código
      let centrosData = {};
      centrosFinales.forEach(centro => {
        centrosData[centro.id] = centro;
      });
      
      console.log(`Finalmente se cargarán ${Object.keys(centrosData).length} centros`);
      
      // Si no se encontraron centros, intentar crear algunos por defecto para diagnóstico
      if (Object.keys(centrosData).length === 0) {
        console.warn("⚠️ Creando centros de prueba para diagnóstico");
        centrosData["centro1"] = {
          id: "centro1",
          nombre: "Centro de Prueba 1",
          plazas: 10,
          asignadas: 0,
          plazasDisponibles: 10,
          plazasOcupadas: 0,
          plazasTotal: 10,
          direccion: "Dirección de prueba",
          codigoCentro: "CP001",
          estadoCentro: "Activo"
        };
        
        centrosData["centro2"] = {
          id: "centro2",
          nombre: "Centro de Prueba 2",
          plazas: 7,
          asignadas: 2,
          plazasDisponibles: 5,
          plazasOcupadas: 2,
          plazasTotal: 7,
          direccion: "Otra dirección",
          codigoCentro: "CP002",
          estadoCentro: "Activo"
        };
      }
      
      console.log("Centros procesados:", Object.keys(centrosData).length);
      
      
      // Cargar asignaciones para mostrar en el panel de admin
      console.log("Procesando asignaciones para mostrar...");
      
      // Usar las asignaciones válidas ya filtradas en lugar de volver a cargar
      let assignmentsData = {};
      asignacionesValidas.forEach(asignacion => {
        assignmentsData[asignacion.id] = asignacion;
      });
      
      // Crear índices de búsqueda para centros (por ID y por nombre)
      const centrosPorId = {};
      const centrosPorNombre = {};
      
      // Indexar centros por ID y por nombre para búsqueda eficiente
      Object.values(centrosData).forEach(centro => {
        // Indexar por ID
        centrosPorId[centro.id] = centro;
        
        // Indexar por nombre (normalizado a mayúsculas sin acentos)
        if (centro.nombre) {
          // Normalizar el nombre para búsqueda insensible a mayúsculas/minúsculas y acentos
          const nombreNormalizado = centro.nombre.toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Eliminar acentos
          centrosPorNombre[nombreNormalizado] = centro;
        }
        
        // Indexar también por centro (si existe y es diferente del nombre)
        if (centro.centro && centro.centro !== centro.nombre) {
          const centroNormalizado = centro.centro.toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          centrosPorNombre[centroNormalizado] = centro;
        }
      });
      
      console.log("Centros indexados:", {
        porId: Object.keys(centrosPorId).length,
        porNombre: Object.keys(centrosPorNombre).length
      });
      
      let asignacionesData = {};
      asignacionesSnapshot.forEach(doc => {
        const data = doc.data();
        console.log("Asignación encontrada:", doc.id, data);
        if (data) {
          // Buscar centro por ID
          let centroBuscado = centrosPorId[data.centerId];
          
          // Si no se encuentra por ID, intentar buscar por nombre centro
          if (!centroBuscado && data.centro) {
            // Normalizar nombre a mayúsculas sin acentos para la búsqueda
            const centroNormalizado = data.centro.toUpperCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            centroBuscado = centrosPorNombre[centroNormalizado];
            
            if (centroBuscado) {
              console.log(`Centro encontrado por campo 'centro': "${data.centro}" corresponde a ID=${centroBuscado.id}`);
            }
          }
          
          // Si aún no se encuentra, intentar buscar por ID como nombre
          if (!centroBuscado && data.centerId && typeof data.centerId === 'string') {
            const idComoNombre = data.centerId.toUpperCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            centroBuscado = centrosPorNombre[idComoNombre];
            
            if (centroBuscado) {
              console.log(`Centro encontrado por centerId como nombre: "${data.centerId}" corresponde a ID=${centroBuscado.id}`);
            }
          }
          
          // Si no se encuentra, intentar por centerName si existe
          if (!centroBuscado && data.centerName) {
            const nombreNormalizado = data.centerName.toUpperCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            centroBuscado = centrosPorNombre[nombreNormalizado];
            
            if (centroBuscado) {
              console.log(`Centro encontrado por centerName: "${data.centerName}" corresponde a ID=${centroBuscado.id}`);
            }
          }
          
          // Ahora elegir el mejor nombre disponible para mostrar
          let nombreMostrar = "Centro no encontrado";
          
          if (centroBuscado) {
            // Priorizar el nombre del centro encontrado
            nombreMostrar = centroBuscado.nombre;
          } else if (data.centro) {
            // Si no se encontró el centro pero tenemos campo 'centro', usar ese
            nombreMostrar = data.centro;
          } else if (data.centerName) {
            // Si tenemos centerName, usar ese
            nombreMostrar = data.centerName;
          } else if (data.centerId && typeof data.centerId === 'string' && data.centerId.length > 5) {
            // Si el centerId parece ser un nombre (es string y largo), usar ese
            nombreMostrar = data.centerId;
          }
          
          asignacionesData[doc.id] = {
            id: doc.id,
            numeroOrden: data.order || data.numeroOrden || 0,
            centerId: data.centerId || data.centro || "",
            centroPrevio: data.centroPrevio || data.centroAnterior || "",
            nombreCentro: nombreMostrar,
            timestamp: data.timestamp || Date.now(),
            fechaAsignacion: data.fechaAsignacion || new Date().toISOString(),
            // Guardar referencia al centro real para calcular plazas disponibles
            centroAsociado: centroBuscado,
            // Asegurar que reasignado se maneje correctamente
            estado: data.estado || "ASIGNADA",
            reasignado: data.reasignado === true || data.estado === 'REASIGNADO'
          };
        }
      });
      
      console.log("Asignaciones procesadas:", Object.keys(asignacionesData).length);
      
      // Cargar solicitudes pendientes
      console.log("Intentando cargar solicitudes pendientes...");
      const solicitudesRef = collection(db, "solicitudesPendientes");
      const solicitudesSnapshot = await getDocs(solicitudesRef);
      
      if (solicitudesSnapshot.empty) {
        console.warn("⚠️ No se encontraron solicitudes pendientes");
      } else {
        console.log("✅ Se encontraron solicitudes pendientes:", solicitudesSnapshot.size);
      }
      
      let solicitudesData = {};
      solicitudesSnapshot.forEach(doc => {
        const data = doc.data();
        console.log("Solicitud encontrada:", doc.id, data);
        solicitudesData[doc.id] = {
          id: doc.id,
          numeroOrden: data.orden || data.numeroOrden || 0,
          centrosIds: data.centrosIds || data.centrosSeleccionados || [],
          timestamp: data.timestamp || Date.now(),
          fechaSolicitud: data.fechaSolicitud || new Date().toISOString(),
          estado: data.estado || "Pendiente"
        };
      });
      
      console.log("Solicitudes procesadas:", Object.keys(solicitudesData).length);
      
      // Cargar historial
      console.log("Intentando cargar historial...");
      const historialRef = collection(db, "historialSolicitudes");
      const historialSnapshot = await getDocs(historialRef);
      
      if (historialSnapshot.empty) {
        console.warn("⚠️ No se encontró historial de solicitudes");
      } else {
        console.log("✅ Se encontró historial de solicitudes:", historialSnapshot.size);
      }
      
      let historialData = [];
      historialSnapshot.forEach(doc => {
        const data = doc.data();
        historialData.push({
          id: doc.id,
          numeroOrden: data.orden || data.numeroOrden || 0,
          centerId: data.centerId || data.centro || "",
          centroPrevio: data.centroPrevio || "",
          centroAnterior: data.centroAnterior || "",
          nombreCentro: centrosData[data.centerId]?.nombre || "Centro no encontrado",
          nombreCentroAnterior: data.centroAnterior ? (centrosData[data.centroAnterior]?.nombre || "Centro no encontrado") : "",
          timestamp: data.timestamp || Date.now(),
          fechaHistorico: data.fechaHistorico || new Date().toISOString(),
          estado: data.estado || "Procesado",
          accion: data.accion || "Asignación",
          mensaje: data.mensaje || ""
        });
      });
      
      // Ordenar historial por timestamp (más recientes primero)
      historialData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      console.log("Historial procesado:", historialData.length, "registros");
      
      // Actualizar el estado con los datos normalizados
      setAvailablePlazas(Object.values(centrosData));
      setAssignments(Object.values(asignacionesData));
      setSolicitudes(Object.values(solicitudesData));
      setHistorialSolicitudes(historialData);
      
      // Actualizar también los estados nuevos
      setCentros(centrosData);
      setAsignaciones(asignacionesData);
      setSolicitudesPendientes(solicitudesData);
      
      // Calcular contadores
      const totalAsignaciones = Object.keys(asignacionesData).length;
      const totalPendientes = Object.keys(solicitudesData).length;
      const totalCentros = Object.keys(centrosData).length;
      
      setContadores({
        asignaciones: totalAsignaciones,
        pendientes: totalPendientes,
        centros: totalCentros,
        historial: historialData.length
      });
      
      // Actualizar plazas disponibles para mostrar en el dashboard
      let plazasDisponiblesPorCentro = {};
      Object.values(centrosData).forEach(centro => {
        plazasDisponiblesPorCentro[centro.id] = {
          id: centro.id,
          nombre: centro.nombre,
          plazas: centro.plazas,
          asignadas: centro.asignadas,
          plazasDisponibles: centro.plazasDisponibles,
          plazasTotal: centro.plazasTotal,
          codigoCentro: centro.codigoCentro,
          estadoCentro: centro.estadoCentro
        };
      });
      
      setPlazasDisponibles(plazasDisponiblesPorCentro);
      
      // Calcular estadísticas totales
      const totalPlazas = Object.values(centrosData).reduce((sum, c) => sum + (c.plazasTotal || c.plazas || 0), 0);
      const totalAsignadasCount = Object.values(centrosData).reduce((sum, c) => sum + (c.asignadas || c.plazasOcupadas || 0), 0);
      const totalDisponiblesCount = Object.values(centrosData).reduce((sum, c) => {
        const plazasTotal = c.plazasTotal || c.plazas || 0;
        const plazasOcupadas = c.asignadas || c.plazasOcupadas || 0;
        return sum + Math.max(0, plazasTotal - plazasOcupadas);
      }, 0);
      
      console.log("Datos de plazas actualizados. Totales:", {
        totalCentros: Object.keys(centrosData).length,
        totalPlazas: totalPlazas,
        plazasAsignadas: totalAsignadasCount,
        plazasDisponibles: totalDisponiblesCount
      });
      
      console.log("Datos cargados correctamente:", {
        centros: totalCentros,
        asignaciones: totalAsignaciones,
        pendientes: totalPendientes,
        historial: historialData.length
      });
      
      return true;
    } catch (error) {
      console.error("Error al cargar datos desde Firebase:", error);
      console.error("Detalles del error:", error.code, error.message, error.stack);
      return false;
    }
  };
  
  // Configurar listeners de Firebase (solo para actualizaciones)
  const setupFirebaseListeners = () => {
    // Listener para los centros
    const unsubscribeCentros = onSnapshot(collection(db, "centros"), (snapshot) => {
      const ahora = Date.now();
      if (ahora - ultimaActualizacionCentros >= INTERVALO_ACTUALIZACION) {
        const centrosFiltrados = snapshot.docs
          .map(doc => ({
            ...doc.data(),
            docId: doc.id
          }))
          .filter(centro => centro.id && centro.centro);

        setAvailablePlazas(centrosFiltrados);
        console.log(`Listener: Actualizados ${centrosFiltrados.length} centros filtrados`);
        ultimaActualizacionCentros = ahora;
      }
    });
    
    // Listener para asignaciones
    const unsubscribeAsignaciones = onSnapshot(collection(db, "asignaciones"), async (snapshot) => {
      const ahora = Date.now();
      if (ahora - ultimaActualizacionAsignaciones >= INTERVALO_ACTUALIZACION) {
        // Cargar asignaciones recreadas para filtrarlas
        let idsAsignacionesRecreadas = new Set();
        try {
          const asignacionesRecreadasSnapshot = await getDocs(
            query(collection(db, "asignacionesRecreadas"), where("eliminada", "==", false))
          );
          asignacionesRecreadasSnapshot.forEach(doc => {
            const data = doc.data();
            if (data && data.asignacionId) {
              idsAsignacionesRecreadas.add(data.asignacionId);
            }
          });
        } catch (error) {
          console.warn("Error al cargar asignaciones recreadas en listener:", error);
        }
        
        const asignacionesData = [];
        snapshot.forEach((doc) => {
          // Filtrar asignaciones recreadas
          if (idsAsignacionesRecreadas.has(doc.id)) {
            return; // Saltar esta asignación
          }
          
          const data = doc.data();
          const asignacion = {
            ...data,
            docId: doc.id,
            order: typeof data.order === 'number' ? data.order : Number(data.order) || 0,
            centro: data.centro || 'No disponible',
            localidad: data.localidad || 'No disponible',
            municipio: data.municipio || 'No disponible',
            timestamp: data.timestamp || Date.now(),
            estado: data.estado || 'ASIGNADA',
            // Asegurar que reasignado se mantenga como booleano
            reasignado: data.reasignado === true || data.estado === 'REASIGNADO'
          };
          
          // Ya no es necesario el if adicional, ya que lo incluimos en la asignación directamente
          
          asignacionesData.push(asignacion);
        });
        
        console.log("Asignaciones cargadas:", asignacionesData.length, "Reasignadas:", asignacionesData.filter(a => a.reasignado).length);
        
        asignacionesData.sort((a, b) => {
          const ordenA = Number(a.order) || 0;
          const ordenB = Number(b.order) || 0;
          return ordenA - ordenB;
        });
        
        setAssignments(asignacionesData);
        ultimaActualizacionAsignaciones = ahora;
      }
    });
    
    // Listener para solicitudes pendientes
    const unsubscribeSolicitudes = onSnapshot(collection(db, "solicitudesPendientes"), (snapshot) => {
      const ahora = Date.now();
      if (ahora - ultimaActualizacionSolicitudes >= INTERVALO_ACTUALIZACION) {
        const solicitudesData = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          const solicitud = {
            ...data,
            docId: doc.id,
            orden: typeof data.orden === 'number' ? data.orden : Number(data.orden) || 0,
            centrosIds: data.centrosIds || data.centrosSeleccionados || []
          };
          solicitudesData.push(solicitud);
        });
        
        setSolicitudes(solicitudesData);
        ultimaActualizacionSolicitudes = ahora;
      }
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
      setLoadingCSV(true);
      setProcessingMessage("Cargando CSV automáticamente...");
      
    try {
      const csvUrl = process.env.PUBLIC_URL + '/plazas.csv';
      const response = await fetch(csvUrl);
      
        if (!response.ok) {
          throw new Error(`Error al cargar el CSV: ${response.status} - ${response.statusText}`);
        }
        
        const text = await response.text();
        
        if (!text || text.length < 100) {
          throw new Error("El archivo CSV está vacío o es demasiado pequeño");
        }
        
        // Ya no limpiamos la colección, utilizamos el mismo enfoque de cargarDesdePlazasCSV
        // await limpiarColeccion("centros");
        
        // El resto del procesamiento es similar a cargarDesdePlazasCSV
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
            id: String(nextId++), // Convertir a string para mantener consistencia
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
      } catch (error) {
        console.error("Error al cargar CSV automáticamente:", error);
        setLoadingCSV(false);
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
      console.log("Inicializando aplicación...");
      
      try {
        // Etapa 2: Intentar verificar si hay datos. Si no, cargar desde CSV
        console.log("Verificando si ya hay datos en Firebase...");
        const centrosSnapshot = await getDocs(collection(db, "centros"));
        
        if (centrosSnapshot.empty) {
          console.log("No se encontraron centros. Intentando cargar desde CSV...");
          
          const csvResponse = await fetch(process.env.PUBLIC_URL + '/plazas.csv');
          if (csvResponse.ok) {
            console.log("CSV encontrado, cargando datos automáticamente...");
            // No limpiamos la colección, solo cargamos datos
            // await limpiarColeccion("centros"); // Asegurar que está vacío
            await cargarDesdePlazasCSV();
            console.log("Datos cargados desde CSV inicial.");
          } else {
            console.warn("CSV no encontrado en ubicación predeterminada");
          }
        } else {
          console.log("Datos existentes encontrados:", centrosSnapshot.size, "centros");
        }
        
        // Comprobar si estamos en modo admin basado en la URL
        const pathname = window.location.pathname;
        const basePathSegments = pathname.split('/');
        const lastSegment = basePathSegments[basePathSegments.length - 1];
        
        const isAdmin = lastSegment === 'admin';
        setIsAdminView(isAdmin);
        
      // Usar refs para controlar el estado de inicialización
      if (cargandoRef.current || cargaCompletadaRef.current) {
        return;
      }
      
      cargandoRef.current = true;
      
      try {
          // Si es el panel de admin, forzar la carga de todos los datos independientemente
          // de si hay solicitudes pendientes o no
          if (isAdmin) {
            setIsVerificationMaintenance(true);
            setMaintenanceMessage("Cargando datos para el panel de administración...");
            setMaintenanceProgress(5);
            
            // Verificar conexión con Firebase primero
            const conexionResult = await verificarConexionFirebase();
            if (!conexionResult.success) {
              setIsVerificationMaintenance(true); // Mostrar independientemente
              setMaintenanceMessage(`Error de conexión: ${conexionResult.message}. Intenta recargar la página.`);
              return;
            }
            
            setMaintenanceMessage("Cargando centros y solicitudes...");
            setMaintenanceProgress(30);
            
            // Forzar una carga completa de datos
            try {
              await cargarDatosDesdeFirebase();
              console.log("Datos cargados correctamente para el panel de admin");
              
              setMaintenanceProgress(100);
              setMaintenanceMessage("¡Datos cargados correctamente!");
              
              // Desactivar el modo mantenimiento después de un breve retraso
              setTimeout(() => {
                setIsVerificationMaintenance(false);
              }, 1000);
            } catch (error) {
              console.error("Error al cargar datos para el panel de admin:", error);
              setMaintenanceMessage(`Error al cargar datos: ${error.message}`);
              
              setTimeout(() => {
                setIsVerificationMaintenance(false);
              }, 2000);
            }
            
            cargaCompletadaRef.current = true;
            cargandoRef.current = false;
            return;
          }
          
          // Solo activamos modo mantenimiento si hay solicitudes pendientes
          // o si estamos en modo admin (para el resto de la aplicación)
          const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
          const hayPendientes = !solicitudesSnapshot.empty;
          
          if (hayPendientes || isAdmin) {
        setIsVerificationMaintenance(true);
        setMaintenanceMessage("Iniciando sistema y verificando conexión...");
        setMaintenanceProgress(5);
          }
        
        // Verificar conexión con Firebase primero
        const conexionResult = await verificarConexionFirebase();
        if (!conexionResult.success) {
            setIsVerificationMaintenance(true); // Mostrar independientemente
          setMaintenanceMessage(`Error de conexión: ${conexionResult.message}. Intenta recargar la página.`);
          return;
        }
        
          if (hayPendientes || isAdmin) {
        setMaintenanceMessage("Verificando datos...");
        setMaintenanceProgress(10);
          }
        
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
          console.log("AVISO: El procesamiento automático de solicitudes está deshabilitado.");
          console.log("Las asignaciones ahora son siempre manuales y deben realizarse desde el panel de administración.");
          // await procesarTodasLasSolicitudes(); <- DESHABILITADO - Asignaciones solo manuales
          
          // Verificar si hay solicitudes pendientes después del procesamiento
          const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
          const cantidadSolicitudesPendientes = solicitudesSnapshot.docs.length;
          
          setMaintenanceProgress(100);
          
          if (cantidadSolicitudesPendientes > 0) {
            setMaintenanceMessage(`Hay ${cantidadSolicitudesPendientes} solicitudes pendientes por procesar manualmente desde el panel de administración.`);
            console.log(`Hay ${cantidadSolicitudesPendientes} solicitudes pendientes que deben procesarse manualmente desde el panel de administración.`);
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
      } catch (error) {
        console.error("Error durante la inicialización:", error);
        setMaintenanceMessage(`Error: ${error.message}`);
        
        // Intentar desactivar modo mantenimiento después de un error
        setTimeout(() => {
          setIsVerificationMaintenance(false);
          showNotification("Error durante la inicialización: " + error.message, "error");
        }, 2000);
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
  const procesarTodasLasSolicitudes = async (options = {}) => {
    const { respetarAsignacionesExistentes = true } = options;
    
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
      
      // Ordenar las solicitudes por número de orden (menor a mayor)
      const solicitudesOrdenadas = solicitudesPendientes.sort((a, b) => {
        return Number(a.orden) - Number(b.orden);
      });
      
      console.log(`Procesando ${solicitudesOrdenadas.length} solicitudes pendientes ordenadas por prioridad...`);
      setProcessingMessage(`Procesando ${solicitudesOrdenadas.length} solicitudes pendientes...`);
      
      // Modificar la forma en que procesamos las asignaciones
      let assignmentsToUse = assignments;
      
      // Si está configurado para respetar asignaciones existentes, 
      // proporcionamos un array vacío para que no se procesen las existentes
      if (respetarAsignacionesExistentes) {
        console.log("Modo ejecución automática: Se respetarán las asignaciones existentes");
        // Pasamos un array vacío como asignaciones existentes para que no se modifiquen
        assignmentsToUse = [];
      } else {
        console.log("Modo ejecución manual: Se procesarán todas las asignaciones según prioridad");
      }
      
      // Procesar todas las solicitudes en orden
      const resultado = await procesarSolicitudes(
        solicitudesOrdenadas, 
        assignmentsToUse, // Pasar asignaciones vacías o completas según configuración
        availablePlazas,
        setProcessingMessage
      );
      
      if (resultado.error) {
        console.error("Error al procesar solicitudes:", resultado.error);
        setProcessingMessage(`Error: ${resultado.error}`);
      } else {
        console.log("Procesamiento completado:", resultado.message);
        setProcessingMessage(resultado.message);
        
        // Verificar y corregir asignaciones solo si no estamos respetando las existentes
        if (!respetarAsignacionesExistentes) {
        try {
          const verificacionResult = await verificarYCorregirAsignacionesWrapper();
          
          if (verificacionResult && verificacionResult.corregidos > 0) {
            console.log(`Corregidas ${verificacionResult.corregidos} asignaciones con exceso`);
            setProcessingMessage(prevMsg => `${prevMsg} Corregidas ${verificacionResult.corregidos} asignaciones con exceso.`);
          }
        } catch (verificacionError) {
          console.error("Error en verificación de asignaciones:", verificacionError);
          }
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
              procesarTodasLasSolicitudes({respetarAsignacionesExistentes});
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
   * @param {Object} solicitudData - Datos de la solicitud
   * @param {string} solicitudData.orderNumber - Número de orden
   * @param {Array} solicitudData.centrosSeleccionados - IDs de centros seleccionados
   * @param {boolean} solicitudData.isManualMode - Indica si está en modo manual
   */
  const enviarSolicitud = async (solicitudData) => {
    // Extraer los datos del objeto
    const { orderNumber, centrosSeleccionados, isManualMode = false } = solicitudData;
    
    console.log(`Iniciando envío de solicitud para orden ${orderNumber} en modo ${isManualMode ? 'manual' : 'automático'}`);
    
    try {
      // Solo mostramos el indicador de procesamiento, pero no bloqueamos la UI
      setIsProcessing(true);
      setProcessingMessage(`Agregando solicitud para orden ${orderNumber} a la cola...`);
      
      // Validaciones básicas sin esperar
      if (!orderNumber || !centrosSeleccionados || centrosSeleccionados.length === 0) {
        showNotification("Error: Faltan datos necesarios para la solicitud", "error");
        return false;
      }
      
      // Agregar a la cola de procesamiento
      setSolicitudesPendientesEnvio(prev => [
        ...prev, 
        {orderNumber, selectedCenters: centrosSeleccionados, isManualMode}
      ]);
      
      // Limpiar el formulario inmediatamente
      setOrderNumber('');
      setCentrosSeleccionados([]);
      
      // Cambiar la pestaña activa a "solicitudes" después de un breve retraso
      setTimeout(() => {
        setActiveTab('solicitudes');
      }, 1000);
      
      showNotification(`Solicitud para orden ${orderNumber} agregada a la cola de procesamiento`, "success");
      return true;
    } catch (error) {
      console.error(`Error al encolar solicitud para orden ${orderNumber}:`, error);
      showNotification(`Error al agregar solicitud a la cola: ${error.message}`, "error");
      return false;
    } finally {
      // Resetear el estado de procesamiento después de un breve retraso
      setTimeout(() => {
        setIsProcessing(false);
        setProcessingMessage("");
      }, 1500);
    }
  };

  // Definir estilos para la interfaz mejorada
  const styles = {
    container: {
      maxWidth: '1280px',
      margin: '0 auto',
      padding: '20px',
      backgroundColor: '#f8f9fa',
      minHeight: 'calc(100vh - 120px)', // Ajustar para dejar espacio para el footer
      fontFamily: 'Arial, sans-serif',
      position: 'relative'
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

  // Eliminar solicitudes duplicadas
  const eliminarSolicitudesDuplicadas = async () => {
    try {
      setIsLoading(true);
      console.log("Iniciando eliminación de solicitudes duplicadas...");
      
      // Colección para registrar solicitudes eliminadas permanentemente
      const solicitudesBorradasRef = collection(db, "solicitudesBorradas");
      
      // Obtener todas las solicitudes pendientes
      const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
      let solicitudes = [];
      
      solicitudesSnapshot.forEach(doc => {
        solicitudes.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      console.log(`Total de solicitudes obtenidas: ${solicitudes.length}`);
      
      // Verificar duplicados por DNI y timestamp
      const solicitudesPorUsuario = {};
      const duplicadas = [];
      const conservadas = [];
      
      for (const solicitud of solicitudes) {
        const key = `${solicitud.dni}_${solicitud.timestamp}`;
        
        if (!solicitudesPorUsuario[key]) {
          solicitudesPorUsuario[key] = [];
        }
        
        solicitudesPorUsuario[key].push(solicitud);
      }
      
      // Identificar duplicados y conservar solo la última versión
      for (const key in solicitudesPorUsuario) {
        if (solicitudesPorUsuario[key].length > 1) {
          // Ordenar por fecha de creación (la más reciente primero)
          const ordenadas = solicitudesPorUsuario[key].sort((a, b) => {
            return (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0);
          });
          
          // Conservar la solicitud más reciente
          conservadas.push(ordenadas[0]);
          
          // Marcar el resto como duplicadas
          for (let i = 1; i < ordenadas.length; i++) {
            duplicadas.push(ordenadas[i]);
          }
        } else {
          conservadas.push(solicitudesPorUsuario[key][0]);
        }
      }
      
      console.log(`Solicitudes duplicadas encontradas: ${duplicadas.length}`);
      
      // Eliminar duplicados y agregar a la colección de borradas
      let eliminadas = 0;
      for (const solicitud of duplicadas) {
        try {
          const docRef = doc(db, "solicitudesPendientes", solicitud.id);
          await deleteDoc(docRef);
          
          // Registrar en solicitudes borradas
          await addDoc(solicitudesBorradasRef, {
            solicitudId: solicitud.id || "",
            dni: solicitud.dni || "sin_dni",
            timestamp: solicitud.timestamp || Date.now(),
            eliminadaEn: serverTimestamp()
          });
          
          eliminadas++;
        } catch (error) {
          console.error(`Error al eliminar solicitud ${solicitud.id}:`, error);
        }
      }
      
      // Configurar un listener para evitar recreación
      const unsubscribe = onSnapshot(collection(db, "solicitudesPendientes"), async (snapshot) => {
        const cambios = snapshot.docChanges();
        
        for (const cambio of cambios) {
          if (cambio.type === "added") {
            const nuevaSolicitud = {
              id: cambio.doc.id,
              ...cambio.doc.data()
            };
            
            // Verificar que tiene los campos necesarios
            if (!nuevaSolicitud.dni || !nuevaSolicitud.timestamp) {
              console.log(`Solicitud incompleta (falta dni o timestamp): ${nuevaSolicitud.id}`);
              continue;
            }
            
            // Verificar si esta solicitud estaba previamente borrada
            const borradasQuery = query(
              solicitudesBorradasRef, 
              where("dni", "==", nuevaSolicitud.dni || "sin_dni"),
              where("timestamp", "==", nuevaSolicitud.timestamp || 0)
            );
            
            const borradasSnapshot = await getDocs(borradasQuery);
            
            if (!borradasSnapshot.empty) {
              console.log(`Eliminando solicitud recreada: ${nuevaSolicitud.id}`);
              await deleteDoc(doc(db, "solicitudesPendientes", nuevaSolicitud.id));
            }
          }
        }
      });
      
      // Guardar referencia al unsubscribe en el estado (limitado a 10 minutos)
      setTimeout(() => {
        if (unsubscribe) unsubscribe();
      }, 10 * 60 * 1000);
      
      setIsLoading(false);
      return { 
        duplicadas: duplicadas.length,
        eliminadas
      };
    } catch (error) {
      console.error("Error al eliminar solicitudes duplicadas:", error);
      setIsLoading(false);
      throw error;
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
    
    // Programar la verificación a las 2 AM, solo si no se ha ejecutado hoy
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
        console.log('Comprobando si se debe ejecutar la verificación diaria (2:00 AM)');
        
        // Solo ejecutar si no se ha hecho hoy
        if (!verificarSiYaEjecutado()) {
          console.log('Iniciando verificación diaria programada (2:00 AM)');
          
          // Solo procesar las solicitudes pendientes, sin tocar las asignaciones existentes
          // Este es el comportamiento predeterminado ahora
          procesarTodasLasSolicitudes({ respetarAsignacionesExistentes: true }).then(() => {
            localStorage.setItem('ultimaVerificacionDiaria', Date.now().toString());
            console.log('Verificación diaria completada y marcada como ejecutada hoy');
            // Reprogramar para la próxima verificación
          programarVerificacionDiaria();
        });
        } else {
          console.log('Saltando verificación, ya se ejecutó hoy');
          programarVerificacionDiaria();
        }
      }, tiempoHastaVerificacion);
      
      return timeoutId;
    };
    
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
      
      // Verificar si ya se ha ejecutado hoy
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
      
      // Solo ejecutar limpieza de duplicados, no la verificación completa
      if (!isProcessing && !loadingProcess) {
        // Limpiar duplicados en solicitudes y asignaciones (sin tocar asignaciones existentes)
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
    
    // Ejecutar limpieza solo al iniciar la aplicación, sin verificar asignaciones
    ejecutarLimpiezaInicial();
    
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
          console.log("AVISO: El procesamiento automático de solicitudes está deshabilitado.");
          console.log("Las asignaciones ahora son siempre manuales y deben realizarse desde el panel de administración.");
          // await procesarTodasLasSolicitudes(); <- DESHABILITADO - Asignaciones solo manuales
          
          // Verificar si hay solicitudes pendientes después del procesamiento
          const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
          const cantidadSolicitudesPendientes = solicitudesSnapshot.docs.length;
          
          setMaintenanceProgress(100);
          
          if (cantidadSolicitudesPendientes > 0) {
            setMaintenanceMessage(`Hay ${cantidadSolicitudesPendientes} solicitudes pendientes por procesar manualmente desde el panel de administración.`);
            console.log(`Hay ${cantidadSolicitudesPendientes} solicitudes pendientes que deben procesarse manualmente desde el panel de administración.`);
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
      // Comprobar si ya se ejecutó hoy
      const verificarSiYaEjecutado = () => {
        try {
          const ultimaVerificacionStr = localStorage.getItem('ultimaVerificacionAsignaciones');
          
          if (ultimaVerificacionStr) {
            const ultimaVerificacion = new Date(ultimaVerificacionStr);
            const ahora = new Date();
            
            // Comparar solo las fechas (día/mes/año), no la hora
            if (ultimaVerificacion.toDateString() === ahora.toDateString()) {
              return true; // Ya se ejecutó hoy
            }
          }
          
          return false;
        } catch (error) {
          console.error("Error al verificar ejecución previa:", error);
          return false;
        }
      };
      
      // Salir si ya se ejecutó
      if (verificarSiYaEjecutado()) {
        console.log("La verificación de asignaciones ya se ejecutó hoy.");
        return;
      }
      
      // Activar modo mantenimiento
      setMaintenanceMessage("Verificando y corrigiendo asignaciones existentes...");
      setMaintenanceProgress(10);
      setIsVerificationMaintenance(true);
      
      // Pausa para mostrar pantalla
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        // Cargar en memoria primero para tener datos actualizados
        setMaintenanceMessage("Cargando datos actuales...");
        setMaintenanceProgress(20);
        await cargarDatosDesdeFirebase();
        
        // Verificar si hay centros y asignaciones
        if (availablePlazas.length === 0) {
          setMaintenanceMessage("No hay centros disponibles. Cargando desde CSV...");
          setMaintenanceProgress(30);
          
          const csvResponse = await fetch(process.env.PUBLIC_URL + '/plazas.csv');
          if (csvResponse.ok) {
            // Mejor no limpiar la colección, solo cargar o actualizar datos
            // await limpiarColeccion("centros"); // Asegurar que está vacío
            await cargarDesdePlazasCSV();
          } else {
            throw new Error("No se encontró el archivo CSV de centros");
          }
        }
        
      // Asegurar que availablePlazas sea un array
      if (!availablePlazas || !Array.isArray(availablePlazas)) {
        console.error("Error: availablePlazas debe ser un array", availablePlazas);
          setMaintenanceMessage("Error: No hay datos de centros disponibles");
          await new Promise(resolve => setTimeout(resolve, 2000));
          setIsVerificationMaintenance(false);
        showNotification("Error: No hay datos de centros disponibles", "error");
        return;
      }

        setMaintenanceProgress(40);
        setMaintenanceMessage('Comprobando excesos de asignaciones en centros...');
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Filtrar asignaciones excluyendo las no asignables
        const asignacionesValidas = assignments.filter(asignacion => 
          asignacion && 
          !asignacion.noAsignable && 
          asignacion.estado !== "NO_ASIGNABLE" && 
          asignacion.estado !== "REASIGNACION_NO_VIABLE"
        );
        
        // Calcular asignaciones reales por centro
        const contadorAsignacionesPorCentro = {};
        
        // Contar asignaciones válidas para cada centro
        asignacionesValidas.forEach(asignacion => {
          const centroId = asignacion.centerId || asignacion.id;
          if (centroId) {
            contadorAsignacionesPorCentro[centroId] = (contadorAsignacionesPorCentro[centroId] || 0) + 1;
          }
        });
        
        // Verificar centros con exceso basado en conteos reales
        const centrosConExceso = availablePlazas.filter(centro => 
          (contadorAsignacionesPorCentro[centro.id] || 0) > centro.plazas
        );
        
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
      setIsLoading(true);
      console.log("Limpiando duplicados del historial y asignaciones...");
      
      // Colección para registrar elementos eliminados permanentemente
      const elementosBorradosRef = collection(db, "elementosBorrados");
      
      // PARTE 1: Limpiar historial duplicado
      const historialSnapshot = await getDocs(collection(db, "historialSolicitudes"));
      let historialItems = [];
      
      historialSnapshot.forEach(doc => {
        historialItems.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Agrupar por orden y estado
      const historialPorClave = {};
      const historialDuplicado = [];
      const historialConservado = [];
      
      for (const item of historialItems) {
        if (!item.orden || !item.estado) continue;
        
        const key = `${item.orden}_${item.estado}`;
        
        if (!historialPorClave[key]) {
          historialPorClave[key] = [];
        }
        
        historialPorClave[key].push(item);
      }
      
      // Identificar duplicados en historial
      for (const key in historialPorClave) {
        if (historialPorClave[key].length > 1) {
          // Ordenar por fecha (más reciente primero)
          const ordenados = historialPorClave[key].sort((a, b) => {
            return (b.timestamp || 0) - (a.timestamp || 0);
          });
          
          // Conservar el más reciente
          historialConservado.push(ordenados[0]);
          
          // Marcar el resto como duplicados
          for (let i = 1; i < ordenados.length; i++) {
            historialDuplicado.push(ordenados[i]);
          }
        } else {
          historialConservado.push(historialPorClave[key][0]);
        }
      }
      
      // PARTE 2: Limpiar asignaciones duplicadas
      const asignacionesSnapshot = await getDocs(collection(db, "asignaciones"));
      let asignacionesItems = [];
      
      asignacionesSnapshot.forEach(doc => {
        asignacionesItems.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      // Agrupar por número de orden
      const asignacionesPorOrden = {};
      const asignacionesDuplicadas = [];
      const asignacionesConservadas = [];
      
      for (const asignacion of asignacionesItems) {
        if (!asignacion.order && !asignacion.numeroOrden) continue;
        
        const orden = asignacion.order || asignacion.numeroOrden;
        
        if (!asignacionesPorOrden[orden]) {
          asignacionesPorOrden[orden] = [];
        }
        
        asignacionesPorOrden[orden].push(asignacion);
      }
      
      // Identificar duplicados en asignaciones
      for (const orden in asignacionesPorOrden) {
        if (asignacionesPorOrden[orden].length > 1) {
          // Ordenar por timestamp (más reciente primero)
          const ordenadas = asignacionesPorOrden[orden].sort((a, b) => {
            return (b.timestamp || 0) - (a.timestamp || 0);
          });
          
          // Conservar la más reciente
          asignacionesConservadas.push(ordenadas[0]);
          
          // Marcar el resto como duplicadas
          for (let i = 1; i < ordenadas.length; i++) {
            asignacionesDuplicadas.push(ordenadas[i]);
          }
        } else {
          asignacionesConservadas.push(asignacionesPorOrden[orden][0]);
        }
      }
      
      // Eliminar duplicados y registrarlos como borrados
      let historialEliminado = 0;
      let asignacionesEliminadas = 0;
      
      // Eliminar historial duplicado
      for (const item of historialDuplicado) {
        try {
          const docRef = doc(db, "historialSolicitudes", String(item.id));
          await deleteDoc(docRef);
          
          // Registrar en elementos borrados
          await addDoc(elementosBorradosRef, {
            tipo: "historial",
            itemId: item.id || "",
            orden: item.orden || 0,
            estado: item.estado || "desconocido",
            eliminadoEn: serverTimestamp()
          });
          
          historialEliminado++;
        } catch (error) {
          console.error(`Error al eliminar historial ${item.id}:`, error);
        }
      }
      
      // Eliminar asignaciones duplicadas
      for (const asignacion of asignacionesDuplicadas) {
        try {
          const docRef = doc(db, "asignaciones", String(asignacion.id));
          await deleteDoc(docRef);
          
          // Registrar en elementos borrados
          await addDoc(elementosBorradosRef, {
            tipo: "asignacion",
            itemId: asignacion.id || "",
            orden: asignacion.order || asignacion.numeroOrden || 0,
            eliminadoEn: serverTimestamp()
          });
          
          asignacionesEliminadas++;
        } catch (error) {
          console.error(`Error al eliminar asignación ${asignacion.id}:`, error);
        }
      }
      
      // Ya no configuramos el listener para evitar mensajes constantes en consola
      // La detección de asignaciones recreadas ahora sólo se hará desde el panel de administración
      
      setIsLoading(false);
      return {
        historialDuplicado: historialDuplicado.length,
        historialEliminado,
        asignacionesDuplicadas: asignacionesDuplicadas.length,
        asignacionesEliminadas
      };
    } catch (error) {
      console.error("Error al limpiar duplicados:", error);
      setIsLoading(false);
      throw error;
    }
  };

  // Función para verificar contraseña de administrador
  const handleAdminAuth = () => {
    if (adminPassword === 'SoyAdmin') {
      setShowPasswordModal(false);
      setAdminPassword('');
      setPasswordError(false);
      // Ya no ejecutamos procesamiento automático
      showNotification("Acceso de administrador verificado. Las asignaciones ahora son manuales desde el panel de administración.", "info");
      // Redirigir al panel de admin
      window.location.href = "/admin";
    } else {
      setPasswordError(true);
      setTimeout(() => setPasswordError(false), 3000);
    }
  };

  // Agregar un efecto para el reseteo automático de contadores
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

  // Función para procesar solicitudes pendientes cada minuto, priorizando por número de orden
  // sin rehacer todas las asignaciones existentes
  const procesarSolicitudesPorMinuto = async () => {
    // Evitar procesamiento simultáneo
    if (processingRef.current) {
      console.log("Ya hay un procesamiento en curso. Se omite la verificación por minuto.");
      return false;
    }
    
    try {
      // Verificar si hay solicitudes pendientes
      const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
      
      if (solicitudesSnapshot.empty) {
        console.log("No hay solicitudes pendientes para procesar en la verificación por minuto.");
        return true;
      }
      
      // Convertir a array y normalizar propiedades
      const solicitudesPendientes = solicitudesSnapshot.docs.map(doc => ({
        ...doc.data(),
        docId: doc.id,
        centrosIds: doc.data().centrosIds || doc.data().centrosSeleccionados || []
      }));
      
      console.log(`Verificación por minuto: Procesando ${solicitudesPendientes.length} solicitudes pendientes...`);
      
      // Ordenar solicitudes por número de orden (menor a mayor = mayor prioridad)
      const solicitudesOrdenadas = solicitudesPendientes.sort((a, b) => {
        return Number(a.orden) - Number(b.orden);
      });
      
      // Obtener asignaciones actuales
      const asignacionesSnapshot = await getDocs(collection(db, "asignaciones"));
      const asignacionesExistentes = asignacionesSnapshot.docs.map(doc => ({
        ...doc.data(),
        docId: doc.id
      }));
      
      // Crear mapa de centros y sus asignaciones actuales
      const centrosAsignados = {};
      asignacionesExistentes.forEach(asignacion => {
        if (asignacion.centerId) {
          if (!centrosAsignados[asignacion.centerId]) {
            centrosAsignados[asignacion.centerId] = [];
          }
          centrosAsignados[asignacion.centerId].push(asignacion);
        }
      });
      
      // Crear mapa de órdenes y sus asignaciones
      const ordenesAsignadas = new Map();
      asignacionesExistentes.forEach(asignacion => {
        if (asignacion.order) {
          ordenesAsignadas.set(asignacion.order, asignacion);
        }
      });
      
      // Variables para contabilizar cambios
      let asignacionesNuevas = 0;
      let reasignacionesPorPrioridad = 0;
      
      // Procesamos en lotes para mayor eficiencia
      const batch = writeBatch(db);
      
      // Procesar cada solicitud pendiente en orden de prioridad
      for (const solicitud of solicitudesOrdenadas) {
        const ordenSolicitud = Number(solicitud.orden);
        
        // Verificar si ya tiene una asignación
        if (ordenesAsignadas.has(ordenSolicitud)) {
          console.log(`La orden ${ordenSolicitud} ya tiene una asignación.`);
          // Eliminar la solicitud pendiente ya que ya está asignada
          batch.delete(doc(db, "solicitudesPendientes", solicitud.docId));
          continue;
        }
        
        // Buscar centro disponible entre los seleccionados
        let centroAsignado = null;
        let asignacionDesplazada = null;
        
        // Iteramos por los centros en orden de preferencia
        for (const centroId of solicitud.centrosIds) {
          // Verificar si hay plazas disponibles en este centro
          const centroInfo = availablePlazas.find(c => c.id === centroId);
          
          if (!centroInfo) continue; // Centro no existe
          
          // Comprobar si hay plazas disponibles
          if (centroInfo.asignadas < centroInfo.plazas) {
            // Hay plazas disponibles, asignar directamente
            centroAsignado = centroId;
            break;
          } else {
            // No hay plazas disponibles, verificar si podemos desplazar por prioridad
            // Obtener todas las asignaciones para este centro
            const asignacionesCentro = centrosAsignados[centroId] || [];
            
            // Buscar la asignación con el número de orden más alto (menor prioridad)
            const asignacionMenorPrioridad = asignacionesCentro.reduce((prev, current) => {
              const prevOrder = Number(prev.order || 0);
              const currentOrder = Number(current.order || 0);
              return currentOrder > prevOrder ? current : prev;
            }, { order: 0 });
            
            // Si existe y tiene menor prioridad (número mayor) que la solicitud actual
            if (asignacionMenorPrioridad.order && Number(asignacionMenorPrioridad.order) > ordenSolicitud) {
              centroAsignado = centroId;
              asignacionDesplazada = asignacionMenorPrioridad;
              break;
            }
          }
        }
        
        // Si no se encontró un centro disponible, continuar con la siguiente solicitud
        if (!centroAsignado) {
          console.log(`No se encontró plaza disponible para la orden ${ordenSolicitud}.`);
          continue;
        }
        
        // Obtener información del centro asignado
        const centroInfo = availablePlazas.find(c => c.id === centroAsignado);
        
        // Si hay una asignación a desplazar
        if (asignacionDesplazada) {
          console.log(`Desplazando asignación de orden ${asignacionDesplazada.order} para asignar orden ${ordenSolicitud} en centro ${centroAsignado}`);
          
          // Eliminar la asignación desplazada
          batch.delete(doc(db, "asignaciones", asignacionDesplazada.docId));
          
          // Crear una nueva solicitud pendiente para la orden desplazada
          const nuevaSolicitudDesplazada = {
            orden: asignacionDesplazada.order,
            centrosIds: [asignacionDesplazada.centerId], // Usar el centro actual como preferencia
            timestamp: serverTimestamp(),
            desplazada: true, // Marcar como desplazada para seguimiento
            desplazadaPor: ordenSolicitud // Registrar qué orden la desplazó
          };
          
          // Añadir la solicitud desplazada a solicitudes pendientes
          const nuevaSolicitudRef = doc(collection(db, "solicitudesPendientes"));
          batch.set(nuevaSolicitudRef, nuevaSolicitudDesplazada);
          
          // Registrar en historial la desplazada
          const historialDesplazadaRef = doc(collection(db, "historialSolicitudes"));
          batch.set(historialDesplazadaRef, {
            orden: asignacionDesplazada.order,
            centroAnterior: asignacionDesplazada.centerId,
            centroId: null,
            estado: "DESPLAZADA",
            mensaje: `Desplazada por orden ${ordenSolicitud} de mayor prioridad`,
            fechaHistorico: new Date().toISOString(),
            timestamp: Date.now()
          });
          
          reasignacionesPorPrioridad++;
        }
        
        // Crear la nueva asignación para la solicitud actual
        const nuevaAsignacion = {
          order: ordenSolicitud,
          centerId: centroAsignado,
          centerName: centroInfo ? centroInfo.nombre : "Centro Desconocido",
          timestamp: serverTimestamp()
        };
        
        // Añadir la nueva asignación
        const asignacionRef = doc(collection(db, "asignaciones"));
        batch.set(asignacionRef, nuevaAsignacion);
        
        // Eliminar la solicitud pendiente que ya se asignó
        batch.delete(doc(db, "solicitudesPendientes", solicitud.docId));
        
        // Registrar en historial
        const historialRef = doc(collection(db, "historialSolicitudes"));
        batch.set(historialRef, {
          orden: ordenSolicitud,
          centroId: centroAsignado,
          estado: asignacionDesplazada ? "PRIORIZADA" : "ASIGNADA",
          mensaje: asignacionDesplazada 
            ? `Asignada con prioridad, desplazando orden ${asignacionDesplazada.order}` 
            : "Asignada durante procesamiento regular",
          fechaHistorico: new Date().toISOString(),
          timestamp: Date.now()
        });
        
        asignacionesNuevas++;
      }
      
      // Si no hay cambios, no necesitamos hacer nada
      if (asignacionesNuevas === 0 && reasignacionesPorPrioridad === 0) {
        console.log("Verificación por minuto: No se realizaron cambios en las asignaciones.");
        return true;
      }
      
      // Aplicar todos los cambios en una sola operación
      await batch.commit();
      
      console.log(`Verificación por minuto completada: ${asignacionesNuevas} nuevas asignaciones, ${reasignacionesPorPrioridad} reasignaciones por prioridad.`);
      
      // Si hubo cambios, recargar los datos
      if (asignacionesNuevas > 0 || reasignacionesPorPrioridad > 0) {
        await cargarDatosDesdeFirebase();
        setUltimoProcesamientoFecha(new Date().toLocaleString());
        
        // Mostrar notificación solo si hubo cambios significativos
        if (asignacionesNuevas + reasignacionesPorPrioridad > 0) {
          showNotification(`Procesamiento automático: ${asignacionesNuevas} nuevas asignaciones, ${reasignacionesPorPrioridad} reasignaciones por prioridad.`, "success");
        }
      }
      
      return true;
    } catch (error) {
      console.error("Error en procesamiento por minuto:", error);
      return false;
    }
  };

  // Configurar un intervalo para procesar solicitudes cada minuto
  useEffect(() => {
    console.log("Las asignaciones automáticas están deshabilitadas. Solo se pueden hacer manualmente desde el panel de admin.");
    
    // Comentado para deshabilitar el procesamiento automático
    // La siguiente línea muestra un mensaje explicando que las asignaciones son manuales ahora
    showNotification("Las asignaciones ahora son manuales y solo se pueden realizar desde el panel de administración", "info");
    
    // Comentado para deshabilitar el procesamiento automático
    /*
    // Ejecutar la primera verificación tras 30 segundos (dar tiempo a cargar datos)
    const timeoutId = setTimeout(() => {
      procesarSolicitudesPorMinuto();
    }, 30000);
    
    // Configurar intervalo para ejecutar cada minuto
    const intervalId = setInterval(() => {
      procesarSolicitudesPorMinuto();
    }, 60000); // Cada minuto
    
    // Limpiar al desmontar
    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
    */
    
    // No hay nada que limpiar
    return () => {};
  }, []); // Sin dependencias para ejecutar solo una vez al montar

  // Función para eliminar una entrada del historial de solicitudes
  const eliminarHistorialSolicitud = async (historialId) => {
    if (!historialId) return;
    
    if (window.confirm("¿Está seguro de que desea eliminar esta entrada del historial? Esta acción no se puede deshacer.")) {
      try {
        setIsProcessing(true);
        setProcessingMessage("Eliminando entrada del historial...");
        
        await deleteDoc(doc(db, "historialSolicitudes", historialId));
        
        // Añadir a elementos borrados para evitar recreación
        await addDoc(collection(db, "elementosBorrados"), {
          tipo: "historial",
          itemId: historialId,
          eliminadaEn: serverTimestamp(),
          eliminadaPor: "usuario"
        });
        
        showNotification("Entrada del historial eliminada correctamente", "success");
        await cargarDatosDesdeFirebase();
      } catch (error) {
        console.error("Error al eliminar entrada del historial:", error);
        showNotification(`Error al eliminar: ${error.message}`, "error");
      } finally {
        setIsProcessing(false);
        setProcessingMessage("");
      }
    }
  };

  // Función para actualizar manualmente los datos
  const actualizarDatosManualmente = async () => {
    try {
      setIsLoading(true);
      showNotification("Actualizando datos...", "info");

      // Obtener datos actualizados de centros
      const centrosSnapshot = await getDocs(collection(db, "centros"));
      const centrosFiltrados = centrosSnapshot.docs
        .map(doc => ({
          ...doc.data(),
          docId: doc.id
        }))
        .filter(centro => centro.id && centro.centro);

      setAvailablePlazas(centrosFiltrados);
      
      // Actualizar el timestamp de la última actualización
      ultimaActualizacionCentros = Date.now();
      
      // Obtener datos actualizados de asignaciones
      const asignacionesSnapshot = await getDocs(collection(db, "asignaciones"));
      const asignacionesActualizadas = asignacionesSnapshot.docs.map(doc => ({
        ...doc.data(),
        docId: doc.id
      }));
      
      setAssignments(asignacionesActualizadas);
      
      showNotification("Datos actualizados correctamente", "success");
    } catch (error) {
      console.error("Error al actualizar datos:", error);
      showNotification("Error al actualizar los datos", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Cola para almacenar solicitudes pendientes
  const [solicitudesPendientesEnvio, setSolicitudesPendientesEnvio] = useState([]);
  const procesandoSolicitudRef = useRef(false);

  // Función para procesar la cola de solicitudes pendientes
  const procesarColaSolicitudes = async () => {
    // Si ya se está procesando o no hay solicitudes, salir
    if (procesandoSolicitudRef.current || solicitudesPendientesEnvio.length === 0) {
      console.log("Cola de solicitudes: Ya está procesando o no hay solicitudes");
      return;
    }

    // Marcar que se está procesando
    procesandoSolicitudRef.current = true;
    console.log("Iniciando procesamiento de cola de solicitudes");
    
    try {
      // Obtener la primera solicitud de la cola (sin modificar el array original)
      const solicitud = solicitudesPendientesEnvio[0];
      console.log(`Procesando solicitud desde cola: ${solicitud.orderNumber}`);
      
      // Convertir a número para búsquedas consistentes
      const orderNumberNumeric = Number(solicitud.orderNumber);
      
      // COMPROBACIÓN 1: Verificar si ya existe una asignación para este número de orden
      try {
        const existingAssignmentSnapshot = await getDocs(
          query(collection(db, "asignaciones"), where("order", "==", orderNumberNumeric))
        );
        
        if (!existingAssignmentSnapshot.empty) {
          console.log(`Ya existe una asignación para la orden ${orderNumberNumeric}, omitiendo procesamiento.`);
          showNotification(`La orden ${orderNumberNumeric} ya tiene una asignación en el sistema.`, "warning");
          // Eliminar la solicitud de la cola sin procesarla
          setSolicitudesPendientesEnvio(prev => prev.slice(1));
          return; // Salir sin procesar
        }
      } catch (error) {
        console.error("Error al verificar asignaciones existentes:", error);
      }
      
      // COMPROBACIÓN 2: Verificar si ya existe una solicitud pendiente para este número
      try {
        const existingRequestSnapshot = await getDocs(
          query(collection(db, "solicitudesPendientes"), where("orden", "==", orderNumberNumeric))
        );
        
        if (!existingRequestSnapshot.empty) {
          const existingRequestId = existingRequestSnapshot.docs[0].id;
          console.log(`Ya existe una solicitud pendiente para orden ${orderNumberNumeric} con ID ${existingRequestId}`);
          showNotification(`Ya existe una solicitud para la orden ${orderNumberNumeric} en el sistema.`, "info");
          // Eliminar duplicado de la cola
          setSolicitudesPendientesEnvio(prev => prev.slice(1));
          return; // Salir sin procesar
        }
      } catch (error) {
        console.error("Error al verificar solicitudes pendientes existentes:", error);
      }
      
      // Si llegamos aquí, podemos procesar la solicitud con seguridad
      await procesarSolicitudIndividual(
        solicitud.orderNumber,
        solicitud.selectedCenters,
        solicitud.isManualMode
      );
      
      // Eliminar la solicitud procesada de la cola
      setSolicitudesPendientesEnvio(prev => prev.filter((_, index) => index !== 0));
      
    } catch (error) {
      console.error("Error al procesar solicitud de la cola:", error);
      showNotification("Error al procesar solicitud. Por favor, inténtelo de nuevo.", "error");
    } finally {
      // Marcar que ya no se está procesando
      procesandoSolicitudRef.current = false;
      
      console.log("Procesamiento de solicitud finalizado");
    }
  };

  // Efecto para procesar la cola cuando cambia
  useEffect(() => {
    // Usar un temporizador para evitar múltiples llamadas
    let timeoutId = null;
    
    const iniciarProcesamiento = () => {
      // Solo iniciar si hay solicitudes y no se está procesando ya
      if (solicitudesPendientesEnvio.length > 0 && !procesandoSolicitudRef.current) {
        console.log(`Programando proceso de cola (${solicitudesPendientesEnvio.length} pendientes)`);
        
        // Cancelar cualquier temporizador existente
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        // Programar el procesamiento con un retraso
        timeoutId = setTimeout(() => {
          procesarColaSolicitudes();
        }, 3000); // Aumentar a 3 segundos para dar más margen
      }
    };
    
    // Iniciar el procesamiento
    iniciarProcesamiento();
    
    // Limpiar timeout en el cleanup
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [solicitudesPendientesEnvio]);

  // Efecto para cerrar automáticamente la pantalla de mantenimiento cuando no hay solicitudes pendientes
  useEffect(() => {
    // Solo verificar si está en modo mantenimiento
    if (isVerificationMaintenance) {
      // Intervalo para actualizar regularmente el conteo de solicitudes pendientes
      const intervaloActualizacion = setInterval(async () => {
        try {
          // Verificar las solicitudes pendientes en Firebase
          const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
          const solicitudesArray = solicitudesSnapshot.docs.map(doc => ({
            ...doc.data(),
            docId: doc.id
          }));
          
          // Actualizar el estado de solicitudes
          setSolicitudes(solicitudesArray);
          
          console.log(`Actualizando conteo de solicitudes pendientes: ${solicitudesArray.length}`);
          
          // Si no hay solicitudes pendientes y el progreso está completo
          if (solicitudesArray.length === 0 && maintenanceProgress >= 100) {
            console.log("No hay solicitudes pendientes y el mantenimiento está completo");
          }
        } catch (error) {
          console.error("Error al actualizar solicitudes pendientes:", error);
        }
      }, 5000); // Actualizar cada 5 segundos
      
      // Limpiar intervalo al desmontar
      return () => {
        clearInterval(intervaloActualizacion);
      };
    }
  }, [isVerificationMaintenance, maintenanceProgress]);

  /**
   * Procesa una solicitud individual.
   * @param {string} orderNumber - Número de orden
   * @param {Array} selectedCenters - Centros seleccionados  
   * @param {boolean} isManualMode - Modo manual
   * @returns {Promise<boolean>} - Devuelve true si se procesó correctamente
   */
  const procesarSolicitudIndividual = async (orderNumber, selectedCenters, isManualMode = false) => {
    console.log(`Procesando solicitud para orden ${orderNumber} en modo ${isManualMode ? 'manual' : 'automático'}`);
    
    if (!orderNumber || !selectedCenters || selectedCenters.length === 0) {
      console.error("Datos de solicitud incompletos");
      return false;
    }
    
    console.log(`Procesando solicitud para orden ${orderNumber} con centros:`, selectedCenters);
    
    try {
      // Verificar Firebase
      const checkConnection = await verificarConexionFirebase();
      if (!checkConnection.success) {
        console.error("Error de conexión a Firebase:", checkConnection.message);
        showNotification(`Error de conexión: ${checkConnection.message}`, "error");
        return false;
      }
      
      // Convertir orderNumber a número para consistencia
      const orderNumberNumeric = Number(orderNumber);
      
      // Verificar si ya existe una solicitud para este número de orden
      // para evitar duplicados y procesamiento innecesario
      let existingSolicitudId = null;
      const existingSolicitudSnapshot = await getDocs(
        query(collection(db, "solicitudesPendientes"), where("orden", "==", orderNumberNumeric))
      );
      
      if (!existingSolicitudSnapshot.empty) {
        // Ya existe una solicitud - No la actualizamos, simplemente notificamos
        existingSolicitudId = existingSolicitudSnapshot.docs[0].id;
        console.log(`Encontrada solicitud existente con ID ${existingSolicitudId} para orden ${orderNumberNumeric}`);
        showNotification(`Ya existe una solicitud para la orden ${orderNumberNumeric}`, "info");
        
        // Devolver true porque la solicitud ya está en el sistema
        return true;
      }
      
      // Verificar si ya existe una asignación para este número de orden
      const existingAssignmentSnapshot = await getDocs(
        query(collection(db, "asignaciones"), where("order", "==", orderNumberNumeric))
      );
      
      if (!existingAssignmentSnapshot.empty) {
        // Ya existe una asignación para este número de orden
        console.log(`Ya existe una asignación para la orden ${orderNumberNumeric}, omitiendo procesamiento.`);
        showNotification(`La orden ${orderNumberNumeric} ya tiene una asignación en el sistema.`, "warning");
        return false;
      }
      
      // Aquí estamos seguros de que no existe ni solicitud ni asignación
      // Crear la nueva solicitud pendiente
      const newRequest = {
        orden: orderNumberNumeric,
        centrosIds: selectedCenters,
        timestamp: serverTimestamp(),
        isManualMode: isManualMode
      };
          
      // Crear una nueva solicitud
      const solicitudesRef = collection(db, "solicitudesPendientes");
      const nuevaSolicitudRef = await addDoc(solicitudesRef, newRequest);
      console.log(`Creada nueva solicitud para orden ${orderNumberNumeric} con ID ${nuevaSolicitudRef.id}`);
      
      // Registrar en historial
      const historialRef = collection(db, "historialSolicitudes");
      await addDoc(historialRef, {
        orden: orderNumberNumeric,
        centrosIds: selectedCenters,
        estado: "PENDIENTE",
        mensaje: isManualMode ? "Solicitud enviada en modo manual" : "Solicitud enviada",
        fechaHistorico: new Date().toISOString(),
        timestamp: Date.now()
      });
      
      console.log(`Solicitud para orden ${orderNumberNumeric} enviada correctamente`);
      showNotification(`Solicitud para orden ${orderNumberNumeric} enviada correctamente`, "success");
      return true;
      
    } catch (error) {
      console.error(`Error al procesar solicitud para orden ${orderNumber}:`, error);
      showNotification(`Error al procesar solicitud: ${error.message}`, "error");
      return false;
    }
  };

  // Renderizado condicional basado en la ruta
  if (isAdminView) {
    return (
      <Admin 
        assignments={assignments}
        availablePlazas={availablePlazas}
        solicitudes={solicitudes}
        procesarTodasLasSolicitudes={procesarTodasLasSolicitudes}
        procesarSolicitudesPorMinuto={procesarSolicitudesPorMinuto}
        cargarDatosDesdeFirebase={cargarDatosDesdeFirebase}
        eliminarSolicitudesDuplicadas={eliminarSolicitudesDuplicadas}
        limpiarDuplicadosHistorial={limpiarDuplicadosHistorial}
        db={db}
        loadingProcess={loadingProcess}
        processingMessage={processingMessage}
        showNotification={showNotification}
        lastProcessed={lastProcessed}
        procesarSolicitudes={procesarSolicitudes}
        eliminarHistorialSolicitud={eliminarHistorialSolicitud}
      />
    );
  }

  // El renderizado normal de la aplicación original
  return (
    <div className="App" style={styles.container}>
      {/* Modal de contraseña para administrador */}
      {showPasswordModal && (
        <div className="modal-backdrop">
          <div className="modal-content password-modal">
            <h3>Verificación de Administrador</h3>
            <p>Ingrese la contraseña para ejecutar la verificación</p>
            <form onSubmit={(e) => {
              e.preventDefault();
              handleAdminAuth();
            }}>
              <input 
                type="password" 
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Contraseña"
              />
              {passwordError && <p className="error-message">{passwordError}</p>}
              <div className="modal-actions">
                <button 
                  type="button" 
                  className="modal-button cancel" 
                  onClick={() => {
                    setShowPasswordModal(false);
                    setAdminPassword('');
                    setPasswordError('');
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="modal-button">
                  Verificar
                </button>
              </div>
            </form>
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
      
      <div style={{ marginTop: '30px' }}>
        {solicitudes.length === 0 ? (
          <div style={{
            fontSize: '16px',
            color: '#64ffda',
            marginBottom: '20px'
          }}>
            ✅ No hay solicitudes pendientes. El mantenimiento ha finalizado.
          </div>
        ) : (
          <div style={{
            fontSize: '16px',
            color: '#ffd700',
            marginBottom: '20px'
          }}>
            ⚠️ Hay {solicitudes.length} solicitudes pendientes por procesar.
          </div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
          <button 
            onClick={() => setIsVerificationMaintenance(false)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#64ffda',
              color: '#0a192f',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Continuar
          </button>
          
          <button 
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              backgroundColor: 'transparent',
              color: '#64ffda',
              border: '1px solid #64ffda',
              borderRadius: '4px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Recargar página
          </button>
        </div>
      </div>
    </div>
  </div>
)}

      
      <div style={styles.header}>
        <h1 style={{
          ...styles.title,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '15px',
          fontSize: '2.2rem',
          color: '#2c3e50',
          textShadow: '2px 2px 4px rgba(0,0,0,0.1)',
          padding: '20px 0',
          margin: '0',
          fontFamily: "'Helvetica Neue', Arial, sans-serif",
          letterSpacing: '0.5px'
        }}>
          <span role="img" aria-label="enfermera" style={{
            fontSize: '2.5rem',
            filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.1))'
          }}>👩‍⚕️</span>
          Sistema de Asignación de Plazas
          <span role="img" aria-label="hospital" style={{
            fontSize: '2.5rem',
            filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.1))'
          }}>🏥</span>
        </h1>
        
      
      
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
  
          {(() => {
             const totalPlazas = availablePlazas ? availablePlazas.reduce((acc, centro) => acc + parseInt(centro.plazasTotal || centro.plazas || '0', 10), 0) : 7066;
             const totalPlazasDisponibles = availablePlazas ? availablePlazas.reduce((acc, centro) => {
                const total = parseInt(centro.plazasTotal || centro.plazas || '0', 10);
                const ocupadas = parseInt(centro.plazasOcupadas || centro.asignadas || '0', 10);
                return acc + Math.max(0, total - ocupadas);
             }, 0) : (7066 - assignments.length);
             return (
               <span style={{fontWeight: 'bold', marginRight: '5px'}}>
                 Plazas disponibles: {totalPlazasDisponibles} de {totalPlazas}
               </span>
             );
          })()}
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
          <Dashboard 
            assignments={assignments} 
            availablePlazas={availablePlazas}
          />
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
              showNotification={showNotification}
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
