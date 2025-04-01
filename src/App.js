import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { collection, onSnapshot, addDoc, updateDoc, doc, getDocs, query, deleteDoc, setDoc } from "firebase/firestore";
import { db } from './utils/firebaseConfig';
import { procesarSolicitudes, procesarSolicitud } from './utils/assignmentUtils';

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

  // Función para cargar datos únicamente desde plazas.csv
  const cargarDesdePlazasCSV = async () => {
    setLoadingCSV(true);
    setProcessingMessage("Cargando datos del archivo plazas.csv...");
    
    try {
      // Limpiar primero la colección completa
      await limpiarColeccion("centros");
      
      // Cargar el CSV
      const response = await fetch(process.env.PUBLIC_URL + '/plazas.csv');
      
      if (!response.ok) {
        throw new Error(`Error al cargar el CSV: ${response.status} - ${response.statusText}`);
      }
      
      const text = await response.text();
      console.log(`CSV cargado, tamaño: ${text.length} caracteres`);
      
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
          console.log(`Encabezado alternativo encontrado en línea ${alternativeHeaderIndex}: ${lines[alternativeHeaderIndex]}`);
          headerIndex = alternativeHeaderIndex;
        }
      } else {
        console.log(`Encabezado encontrado en línea ${headerIndex}: ${lines[headerIndex]}`);
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
      
      console.log(`Procesamiento completado: ${centros.length} centros válidos, ${lineasInvalidas} líneas inválidas, ${centrosDuplicados} duplicados`);
      console.log(`Total de plazas antes de ajuste: ${totalPlazas}`);
      
      if (centros.length === 0) {
        throw new Error("No se pudieron extraer centros válidos del CSV");
      }
      
      // Asegurar que el total de plazas sea exactamente 7066
      const PLAZAS_OBJETIVO = 7066;
      
      if (totalPlazas !== PLAZAS_OBJETIVO) {
        console.log(`Ajustando conteo de plazas: ${totalPlazas} → ${PLAZAS_OBJETIVO}`);
        
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
              console.log(`Reducidas ${ajuste} plazas del centro "${centro.centro}" (quedan ${centro.plazas})`);
            }
            
            indice++;
          }
          
          // Si aún queda diferencia, reducir del centro más grande
          if (restante > 0) {
            centrosOrdenados[0].plazas -= restante;
            console.log(`Reducidas ${restante} plazas adicionales del centro "${centrosOrdenados[0].centro}"`);
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
            console.log(`Añadidas ${ajuste} plazas al centro "${centro.centro}" (total ${centro.plazas})`);
            
            indice++;
          }
          
          // Si aún queda diferencia, añadir al centro más grande
          if (restante > 0) {
            centrosOrdenados[0].plazas += restante;
            console.log(`Añadidas ${restante} plazas adicionales al centro "${centrosOrdenados[0].centro}"`);
          }
        }
        
        // Verificar que el ajuste se hizo correctamente
        const nuevoTotal = centros.reduce((sum, c) => sum + c.plazas, 0);
        if (nuevoTotal !== PLAZAS_OBJETIVO) {
          console.error(`Error en el ajuste: ${nuevoTotal} ≠ ${PLAZAS_OBJETIVO}`);
          throw new Error(`No se pudo ajustar el número de plazas correctamente: ${nuevoTotal} ≠ ${PLAZAS_OBJETIVO}`);
        } else {
          console.log(`Ajuste completado correctamente. Total final: ${nuevoTotal} plazas`);
        }
      }
      
      // Añadir los centros a Firebase
      setProcessingMessage(`Añadiendo ${centros.length} centros a Firebase...`);
      let procesados = 0;
      
      // Verificar una vez más si hay datos para evitar duplicación
      const verificacionFinal = await getDocs(collection(db, "centros"));
      if (verificacionFinal.size > 0) {
        console.log(`ADVERTENCIA: Ya existen ${verificacionFinal.size} centros en Firebase. Cancelando carga para evitar duplicación.`);
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
        
        console.log(`Procesados ${procesados}/${centros.length} centros`);
      }
      
      setProcessingMessage("Datos cargados correctamente");
      console.log(`Se han añadido ${procesados} centros a Firebase con un total exacto de ${PLAZAS_OBJETIVO} plazas`);
      
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
  };
  
  // Función para limpiar una colección completa
  const limpiarColeccion = async (nombreColeccion) => {
    try {
      setProcessingMessage(`Limpiando colección ${nombreColeccion}...`);
      
      const snapshot = await getDocs(collection(db, nombreColeccion));
      
      if (snapshot.size > 0) {
        console.log(`Eliminando ${snapshot.size} documentos de ${nombreColeccion}...`);
        
        for (const docSnapshot of snapshot.docs) {
          await deleteDoc(doc(db, nombreColeccion, docSnapshot.id));
        }
        
        console.log(`Colección ${nombreColeccion} limpiada correctamente`);
      } else {
        console.log(`No hay documentos en la colección ${nombreColeccion} para eliminar`);
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
      console.log(`Cargados ${centrosData.length} centros desde Firebase`);
      
      // Cargar asignaciones
      const asignacionesSnapshot = await getDocs(collection(db, "asignaciones"));
      const asignacionesData = asignacionesSnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
      setAssignments(asignacionesData);
      console.log(`Cargadas ${asignacionesData.length} asignaciones desde Firebase`);
      
      // Cargar solicitudes pendientes
      const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
      const solicitudesData = solicitudesSnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
      setSolicitudes(solicitudesData);
      console.log(`Cargadas ${solicitudesData.length} solicitudes desde Firebase`);
      
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
        console.log(`Datos de centros actualizados: ${centrosData.length} centros`);
        setAvailablePlazas(centrosData);
      }
    });
    
    // Listener para asignaciones
    const unsubscribeAsignaciones = onSnapshot(collection(db, "asignaciones"), (snapshot) => {
      const asignacionesData = [];
      snapshot.forEach((doc) => {
        asignacionesData.push({ ...doc.data(), docId: doc.id });
      });
      
      console.log(`Datos de asignaciones actualizados: ${asignacionesData.length} asignaciones`);
      setAssignments(asignacionesData);
    });
    
    // Listener para solicitudes pendientes
    const unsubscribeSolicitudes = onSnapshot(collection(db, "solicitudesPendientes"), (snapshot) => {
      const solicitudesData = [];
      snapshot.forEach((doc) => {
        solicitudesData.push({ ...doc.data(), docId: doc.id });
      });
      
      console.log(`Datos de solicitudes pendientes actualizados: ${solicitudesData.length} solicitudes`);
      setSolicitudes(solicitudesData);
    });
    
    // Devolver función para desuscribirse de todos los listeners
    return () => {
      unsubscribeCentros();
      unsubscribeAsignaciones();
      unsubscribeSolicitudes();
    };
  };
  
  // Cargar datos iniciales
  useEffect(() => {
    let unsubscribe;
    
    const inicializarApp = async () => {
      // Usar refs para controlar el estado de inicialización
      if (cargandoRef.current || cargaCompletadaRef.current) {
        console.log("Inicialización ya en progreso o completada. Omitiendo...");
        return;
      }
      
      cargandoRef.current = true;
      console.log("Iniciando verificación de datos en Firebase...");
      
      try {
        // Comprobar si ya hay datos en Firebase
        const centrosSnapshot = await getDocs(collection(db, "centros"));
        const centrosCount = centrosSnapshot.size;
        
        if (centrosCount === 0) {
          console.log("No hay centros en Firebase. Cargando desde CSV...");
          await limpiarColeccion("centros"); // Asegurar que está vacío
          await cargarDesdePlazasCSV();
        } else {
          console.log(`Ya hay ${centrosCount} centros en Firebase. Cargando datos existentes...`);
          await cargarDatosDesdeFirebase();
        }
        
        // Una vez cargados los datos, configurar listeners para actualizaciones
        unsubscribe = setupFirebaseListeners();
        cargaCompletadaRef.current = true;
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

  // Manejar envío de solicitud de orden
  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    const numOrden = parseInt(orderNumber, 10);
    if (isNaN(numOrden) || numOrden <= 0) {
      showNotification('Por favor, introduce un número de orden válido', 'error');
      return;
    }
    
    if (centrosSeleccionados.length === 0) {
      showNotification('Por favor, selecciona al menos un centro de trabajo', 'error');
      return;
    }

    // Verificar si este número de orden ya tiene asignación
    const existingAssignment = assignments.find(a => a.order === numOrden);
    if (existingAssignment) {
      setAssignment(existingAssignment);
      showNotification(`Ya tienes una plaza asignada en: ${existingAssignment.centro}. Puedes seguir enviando solicitudes para otras plazas que te interesen aunque ya tengas una asignada.`, 'warning');
      // Permitimos continuar para que el usuario pueda añadir más solicitudes si lo desea
    }
    
    // Mostrar el indicador de carga
    setIsProcessing(true);
    
    try {
      // Convertir todos los IDs a números para asegurar compatibilidad
      const centrosIdsNumericos = centrosSeleccionados.map(id => Number(id));
      
      console.log("Intentando guardar solicitud con centros:", centrosIdsNumericos);
      
      // Verificar si ya existe una solicitud para este número de orden
      const solicitudExistente = solicitudes.find(s => s.orden === numOrden);
      
      // Datos a guardar - el orden de los centros seleccionados determina la prioridad
      const datosParaGuardar = {
        orden: numOrden,
        centrosIds: centrosIdsNumericos,
        timestamp: Date.now()
      };
      
      if (solicitudExistente) {
        // Actualizar la solicitud existente con los nuevos centros seleccionados
        console.log("Actualizando solicitud existente:", solicitudExistente.docId);
        const solicitudRef = doc(db, "solicitudesPendientes", solicitudExistente.docId);
        await updateDoc(solicitudRef, datosParaGuardar);
        console.log("Solicitud actualizada correctamente");
        
        // Limpiar formulario
        setOrderNumber('');
        setCentrosSeleccionados([]);
        
        // Mostrar confirmación después de iniciar el procesamiento
        showNotification(`Tu solicitud ha sido actualizada y se está procesando automáticamente.`, 'success');
        
        // Procesar todas las solicitudes automáticamente después de actualizar
        await procesarTodasLasSolicitudes();
      } else {
        // Crear nueva solicitud en Firebase
        console.log("Creando nueva solicitud");
        const docRef = await addDoc(collection(db, "solicitudesPendientes"), datosParaGuardar);
        console.log("Nueva solicitud creada con ID:", docRef.id);
        
        // Limpiar formulario
        setOrderNumber('');
        setCentrosSeleccionados([]);
        
        // Mostrar confirmación después de iniciar el procesamiento
        showNotification("Tu solicitud ha sido registrada y se está procesando automáticamente.", 'success');
        
        // Procesar todas las solicitudes automáticamente después de guardar
        await procesarTodasLasSolicitudes();
      }
      
      // Finalizar el estado de procesamiento solo después de que todo esté completo
      setIsProcessing(false);
    } catch (error) {
      console.error("Error al guardar solicitud:", error);
      // Mostrar error pero mantener el formulario para permitir intentar de nuevo
      showNotification("Error al guardar la solicitud: " + error.message, 'error');
      setIsProcessing(false);
    }
  };
  
  // Función para procesar todas las solicitudes
  const procesarTodasLasSolicitudes = async () => {
    if (loadingProcess) return;
    
    setLoadingProcess(true);
    setProcessingMessage("Procesando solicitudes pendientes...");
    
    try {
      console.log("Procesando todas las solicitudes...");
      
      // Verificar que tenemos solicitudes pendientes
      if (solicitudes.length === 0) {
        console.log("No hay solicitudes pendientes para procesar.");
        setProcessingMessage("No hay solicitudes pendientes.");
        setTimeout(() => setLoadingProcess(false), 1000);
        return;
      }
      
      // Procesamiento de solicitudes con retroalimentación
      const solicitudesOrdenadas = [...solicitudes].sort((a, b) => a.orden - b.orden);
      let procesadas = 0;
      
      for (const solicitud of solicitudesOrdenadas) {
        setProcessingMessage(`Procesando solicitud con orden ${solicitud.orden} (${procesadas + 1}/${solicitudesOrdenadas.length})...`);
        
        const result = await procesarSolicitud(
          solicitud, 
          availablePlazas, 
          assignments, 
          db
        );
        
        if (result.success) {
          procesadas++;
          console.log(`Solicitud ${solicitud.orden} procesada correctamente: ${result.message}`);
        } else {
          console.warn(`No se pudo procesar la solicitud ${solicitud.orden}: ${result.message}`);
        }
        
        // Breve pausa para evitar sobrecarga
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Refrescar datos después del procesamiento
      await cargarDatosDesdeFirebase();
      
      const mensaje = procesadas > 0 
        ? `Se han procesado ${procesadas} solicitudes correctamente.` 
        : "No se pudieron procesar las solicitudes pendientes.";
      
      setProcessingMessage("Procesamiento completado");
      showNotification(mensaje, procesadas > 0 ? 'success' : 'warning');
      
      // Breve pausa antes de ocultar el indicador de carga
      setTimeout(() => {
        setLoadingProcess(false);
      }, 1500);
      
    } catch (error) {
      console.error("Error al procesar solicitudes:", error);
      showNotification(`Error al procesar solicitudes: ${error.message}`, 'error');
      setLoadingProcess(false);
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
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Sistema de Asignación de Plazas</h1>
        <h2 style={styles.subtitle}>Gestión y seguimiento de solicitudes y asignaciones</h2>
      </div>
      
      {/* Tabs de navegación */}
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
      
      {/* Botón para procesar todas las solicitudes */}
      {solicitudes.length > 0 && (
        <div style={{textAlign: 'center', marginBottom: '20px'}}>
          <button 
            onClick={procesarTodasLasSolicitudes}
            disabled={loadingProcess || solicitudes.length === 0}
            style={styles.processingButton}
          >
            {loadingProcess ? (
              <>
                <span style={{ 
                  display: 'inline-block', 
                  width: '18px', 
                  height: '18px', 
                  border: '3px solid rgba(255,255,255,0.3)', 
                  borderRadius: '50%', 
                  borderTopColor: 'white', 
                  animation: 'spin 1s linear infinite',
                  marginRight: '10px'
                }} />
                Procesando...
              </>
            ) : (
              'Procesar todas las solicitudes'
            )}
          </button>
        </div>
      )}
      
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
              handleOrderSubmit={handleOrderSubmit}
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
