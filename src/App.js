import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { db } from './firebase';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  onSnapshot, 
  setDoc, 
  increment, 
  deleteDoc 
} from 'firebase/firestore';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Definir el estilo para la animación del spinner
const spinnerAnimation = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

// Estilos relacionados con enfermería
const headerStyle = {
  textAlign: 'center',
  marginBottom: '10px',
  color: '#18539E', // Azul médico/enfermería
  position: 'relative',
  paddingBottom: '15px',
  fontFamily: '"Montserrat", "Arial", sans-serif'
};

const headerDecorationStyle = {
  content: '',
  position: 'absolute',
  width: '60px',
  height: '4px',
  backgroundColor: '#E63946', // Color rojo/cruz médica
  bottom: 0,
  left: '50%',
  transform: 'translateX(-50%)'
};

const nursingDecoration = (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '10px 0' }}>
    <div style={{ fontSize: '24px', color: '#E63946', margin: '0 10px' }}>+</div>
    <div style={{ 
      width: '40px', 
      height: '40px', 
      borderRadius: '50%', 
      border: '2px solid #18539E', 
      backgroundColor: 'white',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      color: '#18539E',
      fontWeight: 'bold',
      fontSize: '24px'
    }}>
      E
    </div>
    <div style={{ fontSize: '24px', color: '#E63946', margin: '0 10px' }}>+</div>
  </div>
);

function App() {
  const [excelData, setExcelData] = useState([]);
  const [orderNumber, setOrderNumber] = useState('');
  const [centrosSeleccionados, setCentrosSeleccionados] = useState([]);
  const [assignment, setAssignment] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [totalPlazas, setTotalPlazas] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [availablePlazas, setAvailablePlazas] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [busquedaCentros, setBusquedaCentros] = useState('');
  const [loadingProcess, setLoadingProcess] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  // Estados para paginación y búsqueda de solicitudes pendientes
  const [solicitudesPage, setSolicitudesPage] = useState(1);
  const [solicitudesPerPage, setSolicitudesPerPage] = useState(10);
  const [solicitudesSearch, setSolicitudesSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [unsubscribes, setUnsubscribes] = useState([]);
  const [plazas, setPlazas] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [procesarAutomaticamente, setProcesarAutomaticamente] = useState(true);

  // Procesar solicitudes
  const procesarSolicitudes = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      console.log('Iniciando procesamiento de solicitudes...');
      
      // 1. Obtener todas las solicitudes pendientes de Firestore
      const solicitudesSnapshot = await getDocs(collection(db, 'solicitudes'));
      const todasLasSolicitudes = solicitudesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        orden: parseInt(doc.data().orden || 0, 10)
      }));
      
      console.log(`Total de solicitudes encontradas: ${todasLasSolicitudes.length}`);
      
      if (todasLasSolicitudes.length === 0) {
        toast.info('No hay solicitudes pendientes para procesar');
        setIsProcessing(false);
        return;
      }
      
      // 2. Obtener todos los centros con sus plazas disponibles
      const centrosSnapshot = await getDocs(collection(db, 'centros'));
      const centrosDisponibles = centrosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        plazas: parseInt(doc.data().plazas || 0, 10),
        asignadas: parseInt(doc.data().asignadas || 0, 10)
      })).filter(c => c.plazas > 0);
      
      console.log(`Total de centros disponibles: ${centrosDisponibles.length}`);
      
      // 3. Obtener asignaciones existentes
      const asignacionesSnapshot = await getDocs(collection(db, 'asignaciones'));
      const asignacionesExistentes = asignacionesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        order: parseInt(doc.data().order || 0, 10)
      }));
      
      console.log(`Total de asignaciones existentes: ${asignacionesExistentes.length}`);
      
      // 4. Crear mapa de centros con plazas disponibles
      const mapaCentros = {};
      centrosDisponibles.forEach(centro => {
        mapaCentros[centro.id] = {
          ...centro,
          disponibles: centro.plazas - centro.asignadas
        };
      });
      
      // 5. Ordenar solicitudes por número de orden (menor primero)
      const solicitudesOrdenadas = [...todasLasSolicitudes].sort((a, b) => 
        parseInt(a.orden, 10) - parseInt(b.orden, 10)
      );
      
      console.log('Solicitudes ordenadas por número de orden:', 
        solicitudesOrdenadas.map(s => s.orden).join(", "));
      
      // 6. Procesar cada solicitud en orden
      const nuevasAsignaciones = [];
      const ordenesAsignadas = new Set(asignacionesExistentes.map(a => a.order));
      const actualizacionesCentros = {};
      
      for (const solicitud of solicitudesOrdenadas) {
        const numOrden = parseInt(solicitud.orden, 10);
        console.log(`Procesando solicitud orden ${numOrden}`);
        
        // Verificar si ya tiene asignación
        if (ordenesAsignadas.has(numOrden)) {
          console.log(`Orden ${numOrden} ya tiene asignación. Se omite.`);
          continue;
        }
        
        // Verificar si centrosIds existe y es válido
        if (!solicitud.centrosIds || !Array.isArray(solicitud.centrosIds) || solicitud.centrosIds.length === 0) {
          console.log(`La solicitud con orden ${numOrden} no tiene centros seleccionados válidos.`);
          continue;
        }
        
        // Intentar asignar a uno de los centros preferidos
        let asignado = false;
        
        for (const centroId of solicitud.centrosIds) {
          // Convertir a string si es necesario (para asegurar que la comparación funcione)
          const centroIdStr = String(centroId);
          const centro = mapaCentros[centroIdStr];
          
          if (!centro) {
            console.log(`Centro ${centroIdStr} no encontrado en el mapa.`);
            continue;
          }
          
          if (centro.disponibles > 0) {
            // Asignar plaza
            centro.disponibles--;
            centro.asignadas++;
            ordenesAsignadas.add(numOrden);
            asignado = true;
            
            // Crear la nueva asignación
            const nuevaAsignacion = {
              id: centroIdStr,
              order: numOrden,
              centro: centro.centro,
              localidad: centro.localidad,
              municipio: centro.municipio,
              timestamp: new Date().toISOString()
            };
            
            nuevasAsignaciones.push(nuevaAsignacion);
            
            // Registrar centro para actualización
            actualizacionesCentros[centroIdStr] = centro;
            
            console.log(`Asignada plaza en ${centro.centro} a orden ${numOrden}`);
            break;
          }
        }
        
        if (!asignado) {
          console.log(`No se pudo asignar plaza para orden ${numOrden}. Todos los centros solicitados están llenos.`);
        }
      }
      
      // 7. Guardar los cambios en Firebase
      if (nuevasAsignaciones.length > 0) {
        console.log(`Guardando ${nuevasAsignaciones.length} nuevas asignaciones`);
        
        // Usamos promesas por separado para manejar mejor los errores
        const operaciones = [];
        
        // Guardar nuevas asignaciones
        for (const asignacion of nuevasAsignaciones) {
          const asignacionId = `${asignacion.order}-${asignacion.id}`;
          operaciones.push(
            setDoc(doc(db, 'asignaciones', asignacionId), asignacion)
              .catch(err => {
                console.error(`Error al guardar asignación ${asignacionId}:`, err);
                throw err;
              })
          );
        }
        
        // Actualizar centros
        for (const centroId in actualizacionesCentros) {
          const centro = actualizacionesCentros[centroId];
          operaciones.push(
            updateDoc(doc(db, 'centros', centroId), { asignadas: centro.asignadas })
              .catch(err => {
                console.error(`Error al actualizar centro ${centroId}:`, err);
                throw err;
              })
          );
        }
        
        // Esperar a que todas las operaciones terminen
        await Promise.all(operaciones);
        
        // Actualizar el estado local
        setAssignments(prev => {
          // Filtrar las asignaciones existentes y añadir las nuevas
          const asignacionesExistentesIds = asignacionesExistentes.map(a => a.id);
          const asignacionesFiltradas = prev.filter(a => asignacionesExistentesIds.includes(a.id));
          
          return [...asignacionesFiltradas, ...nuevasAsignaciones];
        });
        
        // Actualizar plazas disponibles
        setAvailablePlazas(prevPlazas => {
          return prevPlazas.map(plaza => {
            if (actualizacionesCentros[plaza.id]) {
              return {
                ...plaza,
                asignadas: actualizacionesCentros[plaza.id].asignadas
              };
            }
            return plaza;
          });
        });
        
        toast.success(`Se han asignado ${nuevasAsignaciones.length} plazas según prioridad por orden.`);
      } else {
        toast.info('No se han podido realizar nuevas asignaciones. Todas las plazas solicitadas están ocupadas.');
      }
    } catch (error) {
      console.error('Error al procesar las solicitudes:', error);
      toast.error('Error al procesar las solicitudes. Por favor, inténtelo de nuevo.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Función para cargar datos desde Firebase
  const cargarTodosLosDatos = () => {
    setIsLoading(true);
    try {
      console.log('Cargando datos desde Firebase...');
      
      // Usar onSnapshot para escuchar cambios en tiempo real
      const unsubscribeCentros = onSnapshot(
        collection(db, 'centros'),
        (snapshot) => {
          const centrosData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            plazas: parseInt(doc.data().plazas || '0', 10),
            asignadas: parseInt(doc.data().asignadas || '0', 10)
          }));
          
          console.log(`Centros cargados: ${centrosData.length}`);
          setPlazas(centrosData);
          setAvailablePlazas(centrosData);
          
          // Calcular total de plazas
          const total = centrosData.reduce((sum, centro) => sum + centro.plazas, 0);
          setTotalPlazas(total);
          
          setIsLoading(false);
        },
        (error) => {
          console.error('Error al cargar centros:', error);
          toast.error('Error al cargar los centros');
          setIsLoading(false);
        }
      );
      
      const unsubscribeAsignaciones = onSnapshot(
        collection(db, 'asignaciones'),
        (snapshot) => {
          const asignacionesData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            order: parseInt(doc.data().order || '0', 10)
          })).sort((a, b) => a.order - b.order); // Ordenar por número de orden
          
          console.log(`Asignaciones cargadas: ${asignacionesData.length}`);
          setAssignments(asignacionesData);
        },
        (error) => {
          console.error('Error al cargar asignaciones:', error);
          toast.error('Error al cargar las asignaciones');
        }
      );
      
      const unsubscribeSolicitudes = onSnapshot(
        collection(db, 'solicitudes'),
        (snapshot) => {
          const solicitudesData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            orden: parseInt(doc.data().orden || '0', 10)
          })).sort((a, b) => a.orden - b.orden); // Ordenar por número de orden
          
          console.log(`Solicitudes pendientes cargadas: ${solicitudesData.length}`);
          setSolicitudes(solicitudesData);
          
          // Procesar automáticamente si hay solicitudes y está habilitado
          if (solicitudesData.length > 0 && procesarAutomaticamente) {
            console.log('Procesamiento automático activado, procesando solicitudes...');
            setTimeout(() => {
              procesarSolicitudes();
            }, 2000); // Esperar 2 segundos para dar tiempo a cargar todos los datos
          }
        },
        (error) => {
          console.error('Error al cargar solicitudes pendientes:', error);
          toast.error('Error al cargar las solicitudes pendientes');
        }
      );
      
      // Retornar función de limpieza para desuscribirse cuando el componente se desmonte
      return () => {
        console.log('Desuscribiendo listeners de Firebase...');
        unsubscribeCentros();
        unsubscribeAsignaciones();
        unsubscribeSolicitudes();
      };
    } catch (e) {
      console.error('Error al inicializar la carga de datos:', e);
      toast.error('Error al cargar los datos');
      setIsLoading(false);
      // Importante: devolver una función de limpieza también en caso de error
      return () => {};
    }
  };

  // Cargar datos al inicio
  useEffect(() => {
    let unsubscribeFunc = null;
    
    try {
      console.log('Inicializando carga de datos...');
      unsubscribeFunc = cargarTodosLosDatos();
      console.log('Listeners de Firebase inicializados correctamente');
    } catch (error) {
      console.error('Error al inicializar listeners de Firebase:', error);
      toast.error('Error al cargar los datos. Por favor, recargue la página.');
    }
    
    // Función de limpieza
    return () => {
      console.log('Desmontando componente, limpiando listeners...');
      if (typeof unsubscribeFunc === 'function') {
        unsubscribeFunc();
      }
    };
  }, []); // Sin dependencias para ejecutar solo una vez

  // Función para procesar todas las solicitudes al enviar una nueva
  const procesarTodasLasSolicitudes = async () => {
    // Mostrar mensaje de procesamiento
    setIsProcessing(true);
    
    try {
      await procesarSolicitudes();
      // El procesamiento ya maneja la notificación de éxito
    } catch (error) {
      console.error("Error al procesar automáticamente:", error);
      setIsProcessing(false);
      
      // Verificar si es un error de cuota excedida
      if (error.message && error.message.includes('quota')) {
        toast.error('Firebase Quota Exceeded: Se ha superado el límite de operaciones gratuitas. Intente más tarde o contacte al administrador para actualizar el plan de Firebase.');
      } else {
        toast.error("Error al actualizar asignaciones: " + error.message);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    const numOrden = parseInt(orderNumber, 10);
    if (isNaN(numOrden) || numOrden <= 0) {
      toast.error('Por favor, introduce un número de orden válido');
      return;
    }
    
    if (centrosSeleccionados.length === 0) {
      toast.error('Por favor, selecciona al menos un centro de trabajo');
      return;
    }

    // Verificar si este número de orden ya tiene asignación
    const existingAssignment = assignments.find(a => a.order === numOrden);
    if (existingAssignment) {
      setAssignment(existingAssignment);
      toast.info(`Ya tienes una plaza asignada en: ${existingAssignment.centro}. Puedes seguir enviando solicitudes para otras plazas que te interesen aunque ya tengas una asignada.`);
      // Permitimos continuar para que el usuario pueda añadir más solicitudes si lo desea
    }
    
    // Mostrar el indicador de carga
    setIsSubmitting(true);
    
    try {
      // Convertir todos los IDs a números para asegurar compatibilidad
      const centrosIdsNumericos = centrosSeleccionados.map(id => Number(id));
      
      console.log("Intentando guardar solicitud con centros:", centrosIdsNumericos);
      
      // Datos a guardar
      const datosParaGuardar = {
        orden: numOrden,
        centrosIds: centrosIdsNumericos,
        timestamp: Date.now()
      };
      
      // Verificar si ya existe una solicitud para este número de orden
      // Hacerlo con datos locales primero para reducir consultas Firebase
      const solicitudExistenteLocal = solicitudes.find(s => s.orden === numOrden);
      
      let guardadoExitoso = false;
      
      if (solicitudExistenteLocal) {
        // Actualizar la solicitud existente con los nuevos centros seleccionados
        console.log("Actualizando solicitud existente:", solicitudExistenteLocal.id);
        try {
          const solicitudRef = doc(db, "solicitudes", solicitudExistenteLocal.id);
          await updateDoc(solicitudRef, datosParaGuardar);
          console.log("Solicitud actualizada correctamente");
          guardadoExitoso = true;
        } catch (error) {
          console.error("Error al actualizar solicitud:", error);
          if (error.message && (error.message.includes('quota') || error.message.includes('permission'))) {
            setIsSubmitting(false);
            toast.error('Error de permisos en Firebase: No se pudo actualizar la solicitud. Contacte al administrador.');
            return;
          }
          throw error;
        }
      } else {
        // Crear nueva solicitud en Firebase
        console.log("Creando nueva solicitud");
        try {
          const docRef = await addDoc(collection(db, "solicitudes"), datosParaGuardar);
          console.log("Nueva solicitud creada con ID:", docRef.id);
          guardadoExitoso = true;
        } catch (error) {
          console.error("Error al crear solicitud:", error);
          if (error.message && (error.message.includes('quota') || error.message.includes('permission'))) {
            setIsSubmitting(false);
            toast.error('Error de permisos en Firebase: No se pudo crear la solicitud. Contacte al administrador.');
            return;
          }
          throw error;
        }
      }
      
      // Si el guardado fue exitoso, actualizar localmente las solicitudes
      if (guardadoExitoso) {
        if (solicitudExistenteLocal) {
          // Actualizar la solicitud existente
          setSolicitudes(prevSolicitudes => 
            prevSolicitudes.map(sol => 
              sol.orden === numOrden ? {...sol, centrosIds: centrosIdsNumericos, timestamp: Date.now()} : sol
            )
          );
        } else {
          // Añadir la nueva solicitud
          setSolicitudes(prevSolicitudes => [
            ...prevSolicitudes, 
            {
              orden: numOrden,
              centrosIds: centrosIdsNumericos,
              timestamp: Date.now(),
              id: `temp-${Date.now()}` // ID temporal hasta que se recargue
            }
          ]);
        }
        
        // Informar al usuario
        toast.success(`Tu solicitud ha sido ${solicitudExistenteLocal ? 'actualizada' : 'registrada'} correctamente. Se procesará según prioridad por número de orden.`);
        
        // Limpiar el formulario
        setOrderNumber('');
        setCentrosSeleccionados([]);
        
        // Intentar procesar automáticamente las solicitudes
        try {
          console.log("Procesando todas las solicitudes automáticamente...");
          await procesarTodasLasSolicitudes();
        } catch (error) {
          console.error("Error al procesar solicitudes automáticamente:", error);
          
          // Si es un error de permisos, informar al usuario pero la solicitud ya está guardada
          if (error.message && (error.message.includes('quota') || error.message.includes('permission'))) {
            toast.error('Tu solicitud ha sido guardada, pero no se pudieron procesar las asignaciones debido a restricciones de Firebase. Las asignaciones se procesarán más tarde.');
            return;
          }
          
          // Para otros errores, informar
          toast.error("Se ha guardado tu solicitud, pero ha ocurrido un error al procesar las asignaciones. Por favor, intenta más tarde.");
        }
      } else {
        // Si no se pudo guardar, informar al usuario
        toast.error("No se pudo procesar tu solicitud. Por favor, intenta más tarde.");
      }
    } catch (error) {
      console.error("Error al guardar solicitud:", error);
      // Mostrar error pero mantener el formulario para permitir intentar de nuevo
      toast.error("Error al guardar la solicitud: " + error.message);
    } finally {
      // Ocultar indicador de carga
      setIsSubmitting(false);
    }
  };
}

export default App;