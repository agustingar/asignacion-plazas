import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { db } from './firebase';
import { collection, addDoc, getDocs, doc, updateDoc, onSnapshot, query, orderBy, deleteDoc, setDoc, limit, where, writeBatch } from 'firebase/firestore';

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
  // Última actualización (timestamp)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

  // Cargar datos del CSV al iniciar y configurar la escucha de Firebase
  useEffect(() => {
    cargarTodosLosDatos();
    
    // Limpiar al desmontar
    return () => {
      // Código de limpieza si es necesario
    };
  }, []);

  // Función para cargar todos los datos
  const cargarTodosLosDatos = async () => {
    setIsLoading(true);
    console.log("Iniciando carga de datos...");
    
    try {
      // 1. Cargar centros
      const centrosQuery = query(collection(db, "centros"));
      const centrosSnapshot = await getDocs(centrosQuery);
      const centrosData = centrosSnapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data()
      }));
      setAvailablePlazas(centrosData);
      
      // 2. Cargar asignaciones
      const asignacionesQuery = query(collection(db, "asignaciones"));
      const asignacionesSnapshot = await getDocs(asignacionesQuery);
      const asignacionesData = asignacionesSnapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data()
      }));
      setAssignments(asignacionesData);
      
      // 3. Cargar solicitudes pendientes
      const solicitudesQuery = query(collection(db, "solicitudesPendientes"));
      const solicitudesSnapshot = await getDocs(solicitudesQuery);
      const solicitudesData = solicitudesSnapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data()
      }));
      setSolicitudes(solicitudesData);
      
      // Calcular total de plazas
      const total = centrosData.reduce((acc, centro) => {
        const plazas = parseInt(centro.plazas, 10);
        return acc + (isNaN(plazas) ? 0 : plazas);
      }, 0);
      setTotalPlazas(total);
      
      // Registrar actualización
      setUltimaActualizacion(new Date().toLocaleString());
      
      setIsLoading(false);
      console.log("Datos cargados con éxito.");
    } catch (error) {
      console.error("Error al cargar todos los datos:", error);
      alert(`Error al cargar datos: ${error.message}`);
      setIsLoading(false);
    }
  };

  // Función para procesar todas las solicitudes al enviar una nueva
  const procesarAutomaticamente = async () => {
    // Mostrar mensaje de procesamiento
    setIsProcessing(true);
    
    try {
      await procesarSolicitudes();
      // Esperar un momento para mostrar el éxito
      setTimeout(() => {
        // Ocultar el indicador de carga
        setIsProcessing(false);
        // Recargar para asegurar que los datos estén actualizados
        window.location.reload();
      }, 2000);
    } catch (error) {
      console.error("Error al procesar automáticamente:", error);
      setIsProcessing(false);
      alert("Error al actualizar asignaciones: " + error.message);
    }
  };

  // Procesar solicitudes
  const procesarSolicitudes = useCallback(async () => {
    setIsProcessing(true);
    console.log("Iniciando procesamiento de solicitudes...");
    
    try {
      // Obtener datos frescos directamente desde Firebase
      console.log("Obteniendo datos frescos para el procesamiento...");
      
      // Obtener solicitudes
      const solicitudesSnapshot = await getDocs(query(collection(db, "solicitudesPendientes")));
      const todasLasSolicitudes = solicitudesSnapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data()
      }));
      
      // Obtener centros
      const centrosSnapshot = await getDocs(query(collection(db, "centros")));
      const centros = centrosSnapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data()
      }));
      
      // Obtener asignaciones existentes
      const asignacionesSnapshot = await getDocs(query(collection(db, "asignaciones")));
      const asignacionesExistentes = asignacionesSnapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data()
      }));
      
      console.log(`Procesando con: ${todasLasSolicitudes.length} solicitudes, ${centros.length} centros, ${asignacionesExistentes.length} asignaciones existentes`);
      
      if (todasLasSolicitudes.length === 0) {
        console.log("No hay solicitudes para procesar");
        setIsProcessing(false);
        alert("No hay solicitudes pendientes para procesar");
        return;
      }
      
      // Crear conjunto de órdenes ya asignados
      const ordenesYaAsignados = new Set();
      asignacionesExistentes.forEach(asignacion => {
        ordenesYaAsignados.add(asignacion.order);
      });
      
      console.log(`Órdenes ya asignados: ${Array.from(ordenesYaAsignados).join(', ')}`);
      
      // Ordenar solicitudes por número de orden (menor primero = mayor prioridad)
      console.log("Ordenando solicitudes por número de orden (menor primero)...");
      const solicitudesOrdenadas = [...todasLasSolicitudes].sort((a, b) => {
        // Convertir a números para asegurar ordenamiento correcto
        const ordenA = parseInt(a.orden, 10);
        const ordenB = parseInt(b.orden, 10);
        return ordenA - ordenB;
      });
      
      console.log(`Solicitudes ordenadas: ${solicitudesOrdenadas.map(s => s.orden).join(', ')}`);
      
      // Inicializar mapa de centros con plazas disponibles
      const centrosMap = {};
      centros.forEach(centro => {
        // Convertir plazas a número para evitar problemas
        const plazas = Number(centro.plazas) || 0;
        const asignadas = Number(centro.asignadas) || 0;
        
        centrosMap[centro.id] = {
          ...centro,
          plazas: plazas,
          asignadas: asignadas,
          disponibles: Math.max(0, plazas - asignadas) // Asegurar que nunca sea negativo
        };
      });
      
      // Verificar centros con plazas disponibles
      const centrosDisponibles = Object.values(centrosMap).filter(c => c.disponibles > 0);
      console.log(`Centros con plazas disponibles: ${centrosDisponibles.length}`);
      
      // Procesar cada solicitud en orden de prioridad
      console.log("Procesando solicitudes por orden de prioridad...");
      const nuevasAsignaciones = [];
      
      for (const solicitud of solicitudesOrdenadas) {
        const numOrden = parseInt(solicitud.orden, 10);
        
        // Verificar si este orden ya tiene asignación existente
        if (ordenesYaAsignados.has(numOrden)) {
          console.log(`El orden ${numOrden} ya tiene una asignación existente. Se omite.`);
          continue;
        }
        
        console.log(`Procesando solicitud para orden ${numOrden}`);
        
        // Verificar si hay centros seleccionados válidos
        if (!solicitud.centrosIds || solicitud.centrosIds.length === 0) {
          console.log(`La solicitud ${numOrden} no tiene centros seleccionados válidos`);
          continue;
        }
        
        // Procesar cada centro en orden de preferencia
        for (const centroId of solicitud.centrosIds) {
          const centro = centrosMap[centroId];
          
          // Verificar si el centro existe y tiene plazas disponibles
          if (centro && centro.disponibles > 0) {
            console.log(`Asignando orden ${numOrden} a centro ${centroId} (${centro.centro}). Plazas disponibles: ${centro.disponibles}`);
            
            // Actualizar plaza disponible
            centro.disponibles--;
            centro.asignadas++;
            
            // Crear nueva asignación
            const nuevaAsignacion = {
              order: numOrden,
              id: centroId,
              centro: centro.centro,
              localidad: centro.localidad,
              municipio: centro.municipio,
              timestamp: Date.now()
            };
            
            // Añadir a la lista de nuevas asignaciones
            nuevasAsignaciones.push({
              datos: nuevaAsignacion,
              centroRef: centro.docId
            });
            
            // Marcar este orden como asignado para futuras iteraciones
            ordenesYaAsignados.add(numOrden);
            
            // Terminar el bucle para este orden (ya está asignado)
            break;
          } else {
            console.log(`El centro ${centroId} no existe o no tiene plazas disponibles`);
          }
        }
      }
      
      // Guardar asignaciones en Firebase usando batch
      console.log(`Guardando ${nuevasAsignaciones.length} nuevas asignaciones en Firebase...`);
      
      if (nuevasAsignaciones.length > 0) {
        try {
          // Usar batch para operaciones múltiples
          const batch = writeBatch(db);
          
          // Procesar cada asignación
          for (const asignacion of nuevasAsignaciones) {
            // 1. Crear referencia para la nueva asignación
            const nuevaAsignacionRef = doc(collection(db, "asignaciones"));
            batch.set(nuevaAsignacionRef, asignacion.datos);
            
            // 2. Actualizar el centro correspondiente
            if (asignacion.centroRef) {
              const centroRef = doc(db, "centros", asignacion.centroRef);
              const centroId = asignacion.datos.id;
              batch.update(centroRef, {
                asignadas: centrosMap[centroId].asignadas
              });
            }
          }
          
          // Ejecutar el batch
          await batch.commit();
          
          alert(`Procesamiento completado. Se han asignado ${nuevasAsignaciones.length} plazas según prioridad por orden.`);
          
          setIsProcessing(false);
          
          // Recargar los datos para reflejar los cambios
          cargarTodosLosDatos();
        } catch (error) {
          console.error("Error al guardar asignaciones:", error);
          alert(`Error al guardar asignaciones: ${error.message}`);
          setIsProcessing(false);
        }
      } else {
        alert("No se han podido realizar nuevas asignaciones. No hay solicitudes pendientes sin asignar o todos los centros solicitados están llenos.");
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Error en procesamiento:", error);
      alert(`Error al procesar solicitudes: ${error.message}`);
      setIsProcessing(false);
    }
  }, []);

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    const numOrden = parseInt(orderNumber, 10);
    if (isNaN(numOrden) || numOrden <= 0) {
      alert('Por favor, introduce un número de orden válido');
      return;
    }
    
    if (centrosSeleccionados.length === 0) {
      alert('Por favor, selecciona al menos un centro de trabajo');
      return;
    }

    // Verificar si este número de orden ya tiene asignación
    const existingAssignment = assignments.find(a => a.order === numOrden);
    if (existingAssignment) {
      setAssignment(existingAssignment);
      alert(`Ya tienes una plaza asignada en: ${existingAssignment.centro}. Puedes seguir enviando solicitudes para otras plazas que te interesen aunque ya tengas una asignada.`);
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
      
      // Datos a guardar
      const datosParaGuardar = {
        orden: numOrden,
        centrosIds: centrosIdsNumericos,
        timestamp: Date.now()
      };
      
      // Guardar la solicitud
      if (solicitudExistente) {
        // Actualizar la solicitud existente con los nuevos centros seleccionados
        console.log("Actualizando solicitud existente:", solicitudExistente.docId);
        const solicitudRef = doc(db, "solicitudesPendientes", solicitudExistente.docId);
        await updateDoc(solicitudRef, datosParaGuardar);
        console.log("Solicitud actualizada correctamente");
      } else {
        // Crear nueva solicitud en Firebase
        console.log("Creando nueva solicitud");
        const docRef = await addDoc(collection(db, "solicitudesPendientes"), datosParaGuardar);
        console.log("Nueva solicitud creada con ID:", docRef.id);
      }
      
      // Procesar solicitudes automáticamente después de guardar
      setTimeout(async () => {
        try {
          await procesarSolicitudes();
          alert('Tu solicitud ha sido procesada. Las plazas se asignan por orden de prioridad (menor número de orden).');
        } catch (processingError) {
          console.error("Error al procesar solicitudes:", processingError);
          alert('Tu solicitud ha sido guardada, pero hubo un error al procesar las asignaciones: ' + processingError.message);
        } finally {
          setIsProcessing(false);
          // Recargar datos para mostrar cambios
          cargarTodosLosDatos();
        }
      }, 1000);
    } catch (error) {
      console.error("Error al guardar solicitud:", error);
      alert(`Error al guardar la solicitud: ${error.message}`);
      setIsProcessing(false);
    }
  };

  // Función para manejar la selección de múltiples centros con checkboxes
  const handleCentroChange = (e) => {
    const centroId = parseInt(e.target.value, 10); // Convertir a número para evitar problemas de comparación
    const isChecked = e.target.checked;
    
    if (isChecked) {
      // Añadir a la selección
      setCentrosSeleccionados(prev => [...prev, centroId]);
    } else {
      // Quitar de la selección
      setCentrosSeleccionados(prev => prev.filter(id => id !== centroId));
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      {/* Añadir estilo para la animación de carga */}
      <style>{spinnerAnimation}</style>
      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1 style={headerStyle}>
          Asignación de Plazas de Enfermería
          <div style={headerDecorationStyle}></div>
        </h1>
        {nursingDecoration}
        
        {/* Indicador de última actualización */}
        {ultimaActualizacion && (
          <div style={{ 
            backgroundColor: '#e3f2fd', 
            padding: '8px', 
            borderRadius: '4px',
            marginTop: '10px',
            fontSize: '14px',
            border: '1px solid #b3e5fc'
          }}>
            <span style={{ fontWeight: 'bold', marginRight: '5px' }}>ℹ️</span>
            Datos actualizados: {ultimaActualizacion}
            <button 
              onClick={cargarTodosLosDatos} 
              style={{
                marginLeft: '10px',
                backgroundColor: '#2196f3',
                color: 'white',
                border: 'none',
                padding: '5px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Actualizar Ahora
            </button>
          </div>
        )}
      </div>
      
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <h2>Cargando datos...</h2>
          <p>Por favor espere mientras se cargan los centros de trabajo.</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
            <h2 style={{ color: '#18539E' }}>Información General</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
              <div style={{ padding: '10px', backgroundColor: '#e3f2fd', borderRadius: '5px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Centros</h3>
                <p style={{ margin: '0', fontSize: '24px', fontWeight: 'bold' }}>{availablePlazas.length}</p>
              </div>
               
              <div style={{ padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '5px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Plazas Totales</h3>
                <p style={{ margin: '0', fontSize: '24px', fontWeight: 'bold' }}>{totalPlazas}</p>
              </div>
               
              <div style={{ padding: '10px', backgroundColor: '#fff3e0', borderRadius: '5px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Plazas Asignadas</h3>
                <p style={{ margin: '0', fontSize: '24px', fontWeight: 'bold' }}>{assignments.length}</p>
              </div>
               
              <div style={{ padding: '10px', backgroundColor: '#f3e5f5', borderRadius: '5px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Plazas Disponibles</h3>
                <p style={{ margin: '0', fontSize: '24px', fontWeight: 'bold' }}>{totalPlazas - assignments.length}</p>
              </div>
            </div>
          </div>
          
          {/* Mover el Dashboard (historial de asignaciones) al principio */}
          <div style={{ 
            marginBottom: '20px', 
            padding: '15px', 
            border: '1px solid #ddd', 
            borderRadius: '5px',
            maxHeight: '400px',
            overflowY: 'auto',
            position: 'relative'
          }}>
            <div className="scroll-indicator" style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '8px',
              height: '100px',
              backgroundColor: 'rgba(24, 83, 158, 0.2)',
              borderRadius: '4px',
              zIndex: 1,
              display: assignments.length > 10 ? 'block' : 'none'
            }}>
              <div style={{
                width: '100%',
                height: '30px',
                backgroundColor: 'rgba(24, 83, 158, 0.6)',
                borderRadius: '4px',
                position: 'absolute',
                top: '0',
                animation: 'moveDown 2s ease-in-out infinite',
              }}></div>
            </div>
            <style>
              {`
                @keyframes moveDown {
                  0% { top: 0; }
                  50% { top: calc(100% - 30px); }
                  100% { top: 0; }
                }
                @media (max-width: 768px) {
                  .scroll-indicator {
                    display: block !important;
                  }
                }
              `}
            </style>
            <Dashboard assignments={assignments} />
            
            {/* Botón para actualizar asignaciones */}
            <div style={{ 
              marginTop: '20px', 
              textAlign: 'center',
              display: solicitudes.length > 0 ? 'block' : 'none'
            }}>
              <button 
                onClick={procesarAutomaticamente} 
                disabled={isProcessing || solicitudes.length === 0}
                style={{ 
                  padding: '10px 20px', 
                  backgroundColor: isProcessing ? '#cccccc' : '#18539E', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: isProcessing || solicitudes.length === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto'
                }}
              >
                {isProcessing && (
                  <span 
                    style={{ 
                      display: 'inline-block', 
                      width: '20px', 
                      height: '20px', 
                      border: '3px solid rgba(255,255,255,0.3)', 
                      borderRadius: '50%', 
                      borderTopColor: 'white', 
                      animation: 'spin 1s ease-in-out infinite',
                      marginRight: '10px'
                    }} 
                  />
                )}
                {isProcessing ? 'Actualizando asignaciones...' : 'Actualizar Asignaciones por Número de Orden'}
              </button>
              <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                Este botón procesa todas las solicitudes pendientes y asigna plazas según prioridad por número de orden
              </p>
            </div>
          </div>
          
          {/* Solicitudes pendientes justo después de las asignaciones */}
          {solicitudes.length > 0 && (
            <div style={{ marginTop: '30px', marginBottom: '30px' }}>
              <h2 style={{ color: '#18539E' }}>Solicitudes Pendientes</h2>
              <div style={{ marginBottom: '15px', fontSize: '14px' }}>
                A continuación se muestran todas las solicitudes pendientes con sus preferencias de centros en orden.
                <p style={{ color: '#d35400', fontWeight: 'bold', marginTop: '5px' }}>
                  Las solicitudes se procesan por orden de prioridad (número de orden menor = mayor prioridad)
                </p>
              </div>
              
              {/* Buscador para solicitudes */}
              <div style={{ marginBottom: '15px' }}>
                <div style={{ marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Buscar por número de orden..."
                    value={solicitudesSearch}
                    onChange={(e) => {
                      setSolicitudesSearch(e.target.value);
                      setSolicitudesPage(1); // Resetear a página 1 al buscar
                    }}
                    style={{
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      width: '100%'
                    }}
                  />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '14px' }}>
                    {(() => {
                      // Filtrar solicitudes según la búsqueda
                      const filteredSolicitudes = solicitudes.filter(sol => 
                        solicitudesSearch === '' || 
                        String(sol.orden).includes(solicitudesSearch)
                      ).sort((a, b) => a.orden - b.orden);
                      
                      // Calcular índices para paginación
                      const indexOfLastItem = solicitudesPage * solicitudesPerPage;
                      const indexOfFirstItem = indexOfLastItem - solicitudesPerPage;
                      const currentSolicitudes = filteredSolicitudes.slice(indexOfFirstItem, indexOfLastItem);
                      
                      return `Mostrando ${filteredSolicitudes.length > 0 ? indexOfFirstItem + 1 : 0}-${Math.min(indexOfLastItem, filteredSolicitudes.length)} de ${filteredSolicitudes.length} solicitudes`;
                    })()}
                  </div>
                  
                  <div>
                    <select 
                      value={solicitudesPerPage} 
                      onChange={(e) => {
                        setSolicitudesPerPage(Number(e.target.value));
                        setSolicitudesPage(1); // Resetear a página 1 al cambiar items por página
                      }}
                      style={{
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px'
                      }}
                    >
                      <option value={10}>10 por página</option>
                      <option value={25}>25 por página</option>
                      <option value={50}>50 por página</option>
                      <option value={100}>100 por página</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div style={{ overflowX: 'auto' }}>
                <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#fdf2e9' }}>
                      <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left', color: '#d35400' }}>Nº Orden</th>
                      <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left', color: '#d35400' }}>Fecha/Hora</th>
                      <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left', color: '#d35400' }}>Centros Seleccionados (en orden de preferencia)</th>
                      <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center', color: '#d35400' }}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Filtrar solicitudes según la búsqueda
                      const filteredSolicitudes = solicitudes.filter(sol => 
                        solicitudesSearch === '' || 
                        String(sol.orden).includes(solicitudesSearch)
                      ).sort((a, b) => a.orden - b.orden);
                      
                      // Aplicar paginación
                      const indexOfLastItem = solicitudesPage * solicitudesPerPage;
                      const indexOfFirstItem = indexOfLastItem - solicitudesPerPage;
                      const currentSolicitudes = filteredSolicitudes.slice(indexOfFirstItem, indexOfLastItem);
                      
                      // Renderizar las solicitudes filtradas y paginadas
                      return currentSolicitudes.map((solicitud, index) => {
                        // Convertir timestamp a fecha legible
                        const fecha = new Date(solicitud.timestamp);
                        const fechaFormateada = `${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString()}`;
                        
                        // Verificar si tiene asignación
                        const tieneAsignacion = assignments.some(a => a.order === solicitud.orden);
                        
                        return (
                          <tr key={index} style={{ 
                            backgroundColor: tieneAsignacion ? '#e8f5e9' : (index % 2 === 0 ? 'white' : '#fdf2e9'),
                            opacity: tieneAsignacion ? 0.8 : 1
                          }}>
                            <td style={{ 
                              border: '1px solid #ddd', 
                              padding: '10px', 
                              fontWeight: 'bold',
                              backgroundColor: solicitud.orden <= 50 ? '#fff3cd' : 'inherit' // Destacar órdenes bajos
                            }}>
                              {solicitud.orden}
                              {solicitud.orden <= 50 && (
                                <span style={{ 
                                  display: 'inline-block', 
                                  marginLeft: '5px', 
                                  fontSize: '12px', 
                                  color: '#856404',
                                  backgroundColor: '#fff3cd',
                                  padding: '2px 5px',
                                  borderRadius: '3px'
                                }}>
                                  Alta prioridad
                                </span>
                              )}
                            </td>
                            <td style={{ border: '1px solid #ddd', padding: '10px' }}>{fechaFormateada}</td>
                            <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                              <ol style={{ margin: '0', paddingLeft: '20px' }}>
                                {solicitud.centrosIds.map((centroId, idx) => {
                                  // Buscar detalles del centro
                                  const centro = availablePlazas.find(p => p.id === centroId);
                                  
                                  // Buscar si este centro concreto tiene asignación para este orden
                                  const asignadoAEsteCentro = assignments.some(a => 
                                    a.order === solicitud.orden && a.id === centroId);
                                    
                                  return (
                                    <li key={idx} style={{ 
                                      marginBottom: '5px',
                                      backgroundColor: asignadoAEsteCentro ? '#e8f5e9' : 'inherit',
                                      padding: asignadoAEsteCentro ? '3px 5px' : '0',
                                      borderRadius: asignadoAEsteCentro ? '3px' : '0'
                                    }}>
                                      {centro ? (
                                        <>
                                          <strong>{centro.centro}</strong> - {centro.localidad} ({centro.municipio})
                                          {(centro.plazas - centro.asignadas) <= 0 && !asignadoAEsteCentro && (
                                            <span style={{ 
                                              color: 'red', 
                                              marginLeft: '10px', 
                                              fontSize: '12px', 
                                              fontWeight: 'bold' 
                                            }}>
                                              COMPLETO
                                            </span>
                                          )}
                                          {asignadoAEsteCentro && (
                                            <span style={{ 
                                              color: 'green', 
                                              marginLeft: '10px', 
                                              fontSize: '12px', 
                                              fontWeight: 'bold',
                                              border: '1px solid green',
                                              padding: '1px 4px',
                                              borderRadius: '3px'
                                            }}>
                                              ✓ ASIGNADO
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        `Centro ID: ${centroId} (no encontrado)`
                                      )}
                                    </li>
                                  );
                                })}
                              </ol>
                            </td>
                            <td style={{ 
                              border: '1px solid #ddd', 
                              padding: '10px', 
                              textAlign: 'center',
                              fontWeight: 'bold'
                            }}>
                              {tieneAsignacion ? (
                                <span style={{ color: 'green' }}>
                                  ASIGNADO
                                </span>
                              ) : (
                                <span style={{ color: '#d35400' }}>
                                  EN ESPERA
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
              
              {/* Paginación para solicitudes */}
              {(() => {
                // Filtrar solicitudes según la búsqueda
                const filteredSolicitudes = solicitudes.filter(sol => 
                  solicitudesSearch === '' || 
                  String(sol.orden).includes(solicitudesSearch)
                );
                
                // Calcular total de páginas
                const totalPages = Math.ceil(filteredSolicitudes.length / solicitudesPerPage);
                
                if (totalPages <= 1) return null;
                
                // Funciones para navegar entre páginas
                const paginate = (pageNumber) => setSolicitudesPage(pageNumber);
                const prevPage = () => solicitudesPage > 1 && setSolicitudesPage(solicitudesPage - 1);
                const nextPage = () => solicitudesPage < totalPages && setSolicitudesPage(solicitudesPage + 1);
                
                return (
                  <div style={{ 
                    marginTop: '20px', 
                    display: 'flex', 
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <button 
                      onClick={prevPage} 
                      disabled={solicitudesPage === 1}
                      style={{
                        padding: '5px 10px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        backgroundColor: solicitudesPage === 1 ? '#f2f2f2' : 'white',
                        cursor: solicitudesPage === 1 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      &laquo; Anterior
                    </button>
                    
                    <div style={{ display: 'flex', gap: '5px' }}>
                      {/* Primera página */}
                      {solicitudesPage > 3 && (
                        <button 
                          onClick={() => paginate(1)}
                          style={{
                            padding: '5px 10px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            backgroundColor: 'white'
                          }}
                        >
                          1
                        </button>
                      )}
                      
                      {/* Elipsis izquierdo */}
                      {solicitudesPage > 4 && <span style={{ padding: '5px' }}>...</span>}
                      
                      {/* Páginas cercanas a la actual */}
                      {[...Array(totalPages).keys()].map(number => {
                        const pageNumber = number + 1;
                        if (
                          pageNumber === 1 ||
                          pageNumber === totalPages ||
                          (pageNumber >= solicitudesPage - 1 && pageNumber <= solicitudesPage + 1)
                        ) {
                          return (
                            <button
                              key={number}
                              onClick={() => paginate(pageNumber)}
                              style={{
                                padding: '5px 10px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                backgroundColor: solicitudesPage === pageNumber ? '#d35400' : 'white',
                                color: solicitudesPage === pageNumber ? 'white' : 'black'
                              }}
                            >
                              {pageNumber}
                            </button>
                          );
                        }
                        return null;
                      })}
                      
                      {/* Elipsis derecho */}
                      {solicitudesPage < totalPages - 3 && <span style={{ padding: '5px' }}>...</span>}
                      
                      {/* Última página */}
                      {solicitudesPage < totalPages - 2 && (
                        <button 
                          onClick={() => paginate(totalPages)}
                          style={{
                            padding: '5px 10px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            backgroundColor: 'white'
                          }}
                        >
                          {totalPages}
                        </button>
                      )}
                    </div>
                    
                    <button 
                      onClick={nextPage} 
                      disabled={solicitudesPage === totalPages}
                      style={{
                        padding: '5px 10px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        backgroundColor: solicitudesPage === totalPages ? '#f2f2f2' : 'white',
                        cursor: solicitudesPage === totalPages ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Siguiente &raquo;
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
          
          {assignment && (
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e8f5e9', border: '1px solid #4CAF50', borderRadius: '5px' }}>
              <h2 style={{ color: '#18539E' }}>Tu Asignación</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <p><strong>Número de Orden:</strong> {assignment.order}</p>
                <p><strong>Localidad:</strong> {assignment.localidad}</p>
                <p><strong>Centro de Trabajo:</strong> {assignment.centro}</p>
                <p><strong>Municipio:</strong> {assignment.municipio}</p>
              </div>
            </div>
          )}
          
          <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
            <h2 style={{ color: '#18539E' }}>Solicitar Plaza</h2>
            <form onSubmit={handleOrderSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label htmlFor="orderInput" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Número de Orden:</label>
                <input 
                  id="orderInput"
                  type="number" 
                  value={orderNumber} 
                  onChange={e => setOrderNumber(e.target.value)} 
                  placeholder="Introduce tu número de orden" 
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                  required
                  min="1"
                  disabled={isProcessing}
                />
              </div>
              
              <div>
                <label htmlFor="centrosGroup" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Centros de Trabajo (selecciona múltiples en orden de preferencia):
                </label>
                
                <div style={{ marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Buscar centro por nombre, localidad o municipio..."
                    value={busquedaCentros}
                    onChange={(e) => setBusquedaCentros(e.target.value)}
                    style={{
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      width: '100%',
                      marginBottom: '8px'
                    }}
                    disabled={isProcessing}
                  />
                </div>
                
                <div className="mobile-scroll-hint" style={{
                  display: 'none',
                  marginBottom: '5px',
                  background: 'rgba(24, 83, 158, 0.1)',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  color: '#18539E',
                  fontWeight: 'bold',
                  textAlign: 'center'
                }}>
                  ↓ Desliza para ver más centros ↓
                </div>
                <div 
                  id="centrosGroup"
                  style={{
                    maxHeight: '250px',
                    overflowY: 'auto',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    padding: '10px',
                    backgroundColor: isProcessing ? '#f5f5f5' : '#fff',
                    position: 'relative'
                  }}
                >
                  <style>
                    {`
                      @media (max-width: 768px) {
                        .mobile-scroll-hint {
                          display: block !important;
                        }
                        #centrosGroup {
                          position: relative;
                          overflow-y: auto;
                          -webkit-overflow-scrolling: touch;
                          max-height: 300px !important;
                          padding-bottom: 25px !important;
                        }
                        #centrosGroup::after {
                          content: '';
                          position: absolute;
                          bottom: 0;
                          left: 0;
                          right: 0;
                          height: 25px;
                          background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(24, 83, 158, 0.1));
                          pointer-events: none;
                          z-index: 5;
                          animation: pulse 1.5s infinite alternate;
                        }
                        @keyframes pulse {
                          from { opacity: 0.3; }
                          to { opacity: 0.8; }
                        }
                        .scroll-down-arrow {
                          position: absolute;
                          bottom: 5px;
                          left: 50%;
                          transform: translateX(-50%);
                          width: 20px;
                          height: 20px;
                          background-color: rgba(24, 83, 158, 0.6);
                          border-radius: 50%;
                          display: flex;
                          align-items: center;
                          justify-content: center;
                          color: white;
                          font-size: 14px;
                          z-index: 6;
                          animation: bounce 1s infinite alternate;
                        }
                        @keyframes bounce {
                          from { transform: translateX(-50%) translateY(0); }
                          to { transform: translateX(-50%) translateY(5px); }
                        }
                      }
                    `}
                  </style>
                  <div className="scroll-down-arrow" style={{ display: 'none' }}>
                    ↓
                  </div>
                  {availablePlazas
                    .filter(plaza => 
                      busquedaCentros === '' || 
                      plaza.centro.toLowerCase().includes(busquedaCentros.toLowerCase()) ||
                      plaza.localidad.toLowerCase().includes(busquedaCentros.toLowerCase()) ||
                      plaza.municipio.toLowerCase().includes(busquedaCentros.toLowerCase()) ||
                      String(plaza.id).includes(busquedaCentros)
                    )
                    .sort((a, b) => a.id - b.id)
                    .map((plaza, index) => {
                      const sinPlazasDisponibles = (plaza.plazas - plaza.asignadas) <= 0;
                      
                      return (
                        <div key={index} style={{ 
                          marginBottom: '8px', 
                          display: 'flex', 
                          alignItems: 'center',
                          opacity: sinPlazasDisponibles ? 0.85 : 1
                        }}>
                          <input
                            type="checkbox"
                            id={`centro-${plaza.id}`}
                            value={plaza.id}
                            checked={centrosSeleccionados.includes(plaza.id)}
                            onChange={handleCentroChange}
                            style={{ marginRight: '8px' }}
                            disabled={isProcessing}
                          />
                          <label 
                            htmlFor={`centro-${plaza.id}`} 
                            style={{ 
                              fontSize: '14px', 
                              cursor: isProcessing ? 'default' : 'pointer',
                              textDecoration: sinPlazasDisponibles ? 'none' : 'none'
                            }}
                          >
                            {plaza.id}. <strong className="centro-nombre">{plaza.centro}</strong> - {plaza.localidad} ({plaza.municipio}) 
                            {plaza.plazas > 1 ? 
                              ` - ${Math.max(0, plaza.plazas - plaza.asignadas)} plaza${(plaza.plazas - plaza.asignadas) !== 1 ? 's' : ''} disponible${(plaza.plazas - plaza.asignadas) !== 1 ? 's' : ''}` : 
                              ` - ${sinPlazasDisponibles ? '0 plazas disponibles' : '1 plaza disponible'}`
                            }
                            {sinPlazasDisponibles && (
                              <span style={{ 
                                backgroundColor: '#f8d7da', 
                                color: '#721c24', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                fontSize: '12px',
                                marginLeft: '5px',
                                fontWeight: 'bold'
                              }}>
                                COMPLETO
                              </span>
                            )}
                            {sinPlazasDisponibles && (
                              <span style={{ 
                                color: '#666', 
                                fontSize: '12px',
                                marginLeft: '5px',
                                fontStyle: 'italic'
                              }}>
                                (puedes seleccionarlo, se asignará por orden prioritario)
                              </span>
                            )}
                          </label>
                        </div>
                      );
                    })}
                    
                  {availablePlazas
                    .filter(plaza => 
                      busquedaCentros !== '' && (
                        plaza.centro.toLowerCase().includes(busquedaCentros.toLowerCase()) ||
                        plaza.localidad.toLowerCase().includes(busquedaCentros.toLowerCase()) ||
                        plaza.municipio.toLowerCase().includes(busquedaCentros.toLowerCase()) ||
                        String(plaza.id).includes(busquedaCentros)
                      )
                    ).length === 0 && busquedaCentros !== '' && (
                      <div style={{ padding: '10px', textAlign: 'center', color: '#666' }}>
                        No se encontraron centros que coincidan con "{busquedaCentros}"
                      </div>
                    )}
                </div>
              </div>
              
              <button 
                type="submit" 
                disabled={isProcessing}
                style={{ 
                  padding: '10px', 
                  backgroundColor: isProcessing ? '#cccccc' : '#18539E', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {isProcessing && (
                  <span 
                    style={{ 
                      display: 'inline-block', 
                      width: '20px', 
                      height: '20px', 
                      border: '3px solid rgba(255,255,255,0.3)', 
                      borderRadius: '50%', 
                      borderTopColor: 'white', 
                      animation: 'spin 1s ease-in-out infinite',
                      marginRight: '10px'
                    }} 
                  />
                )}
                {isProcessing ? 'Guardando solicitud...' : 'Enviar Solicitud'}
              </button>
            </form>
          </div>
          
          <PlazasDisponibles availablePlazas={availablePlazas} />
          
          {/* Estado de las plazas */ }
          
          {/* Componente de Footer */}
          <div style={{ marginTop: '40px', padding: '20px 0', borderTop: '1px solid #ddd', textAlign: 'center', fontSize: '12px', color: '#888' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}>
              <p style={{ margin: 0 }}>
                Hecho por <a 
                  href="https://ag-marketing.es" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    color: '#007BFF', 
                    textDecoration: 'none', 
                    fontWeight: 'bold'
                  }}
                >
                  AG Marketing
                </a>
              </p>
              <img 
                src={`${process.env.PUBLIC_URL}/AG_LOGO.png`}
                alt="AG Marketing Logo" 
                style={{ height: '30px', width: 'auto' }} 
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Dashboard({ assignments }) {
  if (!assignments.length) return null;
  
  // Agrupar asignaciones por número de orden
  const asignacionesPorOrden = assignments.reduce((acc, asignacion) => {
    if (!acc[asignacion.order]) {
      acc[asignacion.order] = [];
    }
    acc[asignacion.order].push(asignacion);
    return acc;
  }, {});
  
  // Ordenar los números de orden
  const ordenesOrdenados = Object.keys(asignacionesPorOrden)
    .map(Number)
    .sort((a, b) => a - b);
  
  // Función para exportar a Excel
  const exportToExcel = () => {
    // Crear un nuevo libro de trabajo
    const workbook = XLSX.utils.book_new();
    
    // Convertir los datos a formato de hoja de cálculo
    const dataParaExcel = [];
    
    // Preparar datos para Excel (formato plano para la tabla)
    ordenesOrdenados.forEach(orden => {
      const asignacionesDeEsteOrden = asignacionesPorOrden[orden];
      asignacionesDeEsteOrden.forEach(asignacion => {
        dataParaExcel.push({
          'Número de Orden': asignacion.order,
          'Localidad': asignacion.localidad,
          'Centro de Trabajo': asignacion.centro,
          'Municipio': asignacion.municipio
        });
      });
    });
    
    // Crear hoja de cálculo
    const worksheet = XLSX.utils.json_to_sheet(dataParaExcel);
    
    // Añadir la hoja al libro
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asignaciones');
    
    // Generar el archivo y descargarlo
    XLSX.writeFile(workbook, 'asignaciones_plazas.xlsx');
  };
  
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2 style={{ color: '#18539E' }}>Historial de Asignaciones</h2>
        <button 
          onClick={exportToExcel} 
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#18539E', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <span style={{ marginRight: '5px' }}>📊</span>
          Exportar a Excel
        </button>
      </div>
      
      <div style={{ marginBottom: '15px', fontSize: '14px' }}>
        Las plazas se asignan por número de orden (a menor número, mayor prioridad).
      </div>
      
      <div style={{ overflowX: 'auto', paddingBottom: '5px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#EBF4FF' }}>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left', color: '#18539E' }}>Número de Orden</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left', color: '#18539E' }}>Plazas Asignadas</th>
            </tr>
          </thead>
          <tbody>
            {ordenesOrdenados.map((orden, index) => {
              const asignacionesDeEsteOrden = asignacionesPorOrden[orden];
              
              return (
                <tr key={index} style={{ 
                  backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9',
                  border: orden <= 50 ? '2px solid #fff3cd' : '1px solid #ddd' // Destacar órdenes altos
                }}>
                  <td style={{ 
                    border: '1px solid #ddd', 
                    padding: '10px', 
                    fontWeight: 'bold',
                    backgroundColor: orden <= 50 ? '#fff3cd' : 'inherit'
                  }}>
                    {orden}
                    {orden <= 50 && (
                      <span style={{ 
                        display: 'inline-block', 
                        marginLeft: '5px', 
                        fontSize: '12px', 
                        color: '#856404',
                        padding: '2px 5px',
                        borderRadius: '3px'
                      }}>
                        Alta prioridad
                      </span>
                    )}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                    <ol style={{ margin: 0, paddingLeft: '20px' }}>
                      {asignacionesDeEsteOrden.map((asignacion, idx) => {
                        // Fecha de asignación
                        const fecha = new Date(asignacion.timestamp);
                        const fechaFormateada = fecha.toLocaleDateString();
                        
                        return (
                          <li key={idx} style={{ marginBottom: '5px' }}>
                            <strong>{asignacion.centro}</strong> - {asignacion.localidad} ({asignacion.municipio})
                            <span style={{ 
                              display: 'inline-block', 
                              marginLeft: '10px', 
                              fontSize: '12px', 
                              color: '#666',
                              fontStyle: 'italic'
                            }}>
                              Asignado el {fechaFormateada}
                            </span>
                          </li>
                        );
                      })}
                    </ol>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlazasDisponibles({ availablePlazas }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Verificar si hay datos para mostrar
  if (!availablePlazas || availablePlazas.length === 0) {
    return (
      <div style={{ marginTop: '30px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px', textAlign: 'center' }}>
        <h2>Estado de las Plazas</h2>
        <p>No hay datos de plazas disponibles.</p>
      </div>
    );
  }
  
  // Ordenar por ID para mantener consistencia
  const plazasOrdenadas = [...availablePlazas].sort((a, b) => a.id - b.id);
  
  // Filtrar las plazas según la búsqueda
  const filteredPlazas = plazasOrdenadas.filter(plaza => 
    plaza.centro.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plaza.localidad.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plaza.municipio.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Calcular total de páginas
  const totalPages = Math.ceil(filteredPlazas.length / itemsPerPage);
  
  // Obtener plazas para la página actual
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredPlazas.slice(indexOfFirstItem, indexOfLastItem);
  
  // Cambiar de página
  const paginate = (pageNumber) => setCurrentPage(pageNumber);
  
  // Ir a la página anterior
  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };
  
  // Ir a la página siguiente
  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  return (
    <div style={{ marginTop: '30px' }}>
      <h2 style={{ color: '#18539E' }}>Estado de las Plazas</h2>
      
      <div style={{ marginBottom: '15px' }}>
        <div style={{ marginBottom: '10px' }}>
          <input
            type="text"
            placeholder="Buscar por centro, localidad o municipio..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1); // Resetear a página 1 al buscar
            }}
            style={{
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              width: '100%'
            }}
          />
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ marginBottom: '10px', fontSize: '14px' }}>
            Mostrando {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, filteredPlazas.length)} de {filteredPlazas.length} centros
            {searchTerm && ` (filtrados de ${plazasOrdenadas.length})`}
          </div>
          
          <div>
            <select 
              value={itemsPerPage} 
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1); // Resetear a página 1 al cambiar items por página
              }}
              style={{
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }}
            >
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
              <option value={filteredPlazas.length}>Ver todos</option>
            </select>
          </div>
        </div>
      </div>
      
      <div style={{ overflowX: 'auto' }}>
        <style>
          {`
            @media (max-width: 768px) {
              .responsive-table {
                font-size: 12px;
              }
              .responsive-table th, .responsive-table td {
                padding: 6px 4px !important;
              }
              .responsive-table .mobile-priority-low {
                display: none;
              }
              .mobile-only-column {
                display: table-cell !important;
              }
              .responsive-table .mobile-truncate {
                max-width: 120px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                position: relative;
              }
              .info-tooltip {
                display: none;
                position: fixed;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                background: rgba(24, 83, 158, 0.95);
                color: white;
                padding: 20px;
                border-radius: 8px;
                z-index: 1000;
                max-width: 90vw;
                width: auto;
                text-align: center;
                box-shadow: 0 4px 15px rgba(0,0,0,0.4);
                font-size: 16px;
                line-height: 1.4;
              }
              .info-icon {
                display: inline-block;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background-color: #18539E;
                color: white;
                font-size: 12px;
                text-align: center;
                line-height: 18px;
                margin-left: 5px;
                cursor: pointer;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              }
              .centro-info {
                display: flex;
                align-items: center;
              }
              .tooltip-backdrop {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 999;
              }
              .mas-info-btn {
                display: inline-block;
                padding: 3px 6px;
                background-color: #f0f8ff;
                border: 1px solid #18539E;
                border-radius: 4px;
                color: #18539E;
                font-size: 11px;
                cursor: pointer;
                text-align: center;
                margin-top: 4px;
              }
            }
            
            /* Ocultar elementos de información en desktop */
            @media (min-width: 769px) {
              .info-icon, 
              .info-tooltip, 
              .mas-info-btn, 
              .mobile-only-column {
                display: none !important;
              }
            }
          `}
        </style>
        <div id="tooltip-backdrop" className="tooltip-backdrop" onClick={() => {
          document.querySelectorAll('.info-tooltip').forEach(el => el.style.display = 'none');
          document.getElementById('tooltip-backdrop').style.display = 'none';
        }}></div>
        <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#EBF4FF' }}>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left', color: '#18539E' }}>ID</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left', color: '#18539E' }}>Centro de Trabajo</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left', color: '#18539E' }}>Localidad</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left', color: '#18539E' }} className="mobile-priority-low">Municipio</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center', color: '#18539E' }} className="mobile-priority-low">Total</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center', color: '#18539E' }} className="mobile-priority-low">Asig.</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center', color: '#18539E' }}>Disp.</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center', color: '#18539E' }}>Estado</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center', color: '#18539E', display: 'none' }} className="mobile-only-column">Info</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map((plaza, index) => {
              const disponibles = plaza.plazas - plaza.asignadas;
              const estaLleno = disponibles === 0;
              
              return (
                <tr 
                  key={index} 
                  style={{ 
                    backgroundColor: estaLleno 
                      ? '#ffebee' // Rojo claro si está lleno
                      : index % 2 === 0 ? 'white' : '#f9f9f9' 
                  }}
                >
                  <td style={{ border: '1px solid #ddd', padding: '10px' }}>{plaza.id}</td>
                  <td style={{ border: '1px solid #ddd', padding: '10px', fontWeight: 'bold' }} className="mobile-truncate">
                    <div className="centro-info">
                      <span>{plaza.centro || '-'}</span>
                      <span 
                        className="info-icon" 
                        onClick={(e) => {
                          e.stopPropagation();
                          const allTooltips = document.querySelectorAll('.info-tooltip');
                          allTooltips.forEach(t => t.style.display = 'none');
                          
                          const tooltip = e.currentTarget.nextElementSibling;
                          tooltip.style.display = 'block';
                          document.getElementById('tooltip-backdrop').style.display = 'block';
                        }}
                      >i</span>
                      <div className="info-tooltip">
                        <div style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '18px', borderBottom: '1px solid rgba(255,255,255,0.3)', paddingBottom: '8px' }}>
                          Centro de trabajo
                        </div>
                        {plaza.centro || '-'}
                        <div style={{ marginTop: '15px', fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                          {plaza.localidad} ({plaza.municipio})
                        </div>
                        <div style={{ marginTop: '15px', fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                          Toca fuera para cerrar
                        </div>
                      </div>
                    </div>
                    <div className="mas-info-btn" 
                      style={{ display: 'none' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const infoIcon = e.currentTarget.previousElementSibling.querySelector('.info-icon');
                        if (infoIcon) {
                          infoIcon.click();
                        }
                      }}
                    >
                      Ver nombre completo
                    </div>
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '10px' }} className="mobile-truncate">
                    {plaza.localidad || '-'}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '10px' }} className="mobile-priority-low">{plaza.municipio || '-'}</td>
                  <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }} className="mobile-priority-low">{plaza.plazas}</td>
                  <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }} className="mobile-priority-low">{plaza.asignadas}</td>
                  <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center', fontWeight: 'bold', color: estaLleno ? 'red' : 'green' }}>
                    {disponibles}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>
                    {estaLleno ? (
                      <span style={{ color: 'red', fontWeight: 'bold' }}>LLENO</span>
                    ) : (
                      <span style={{ color: 'green' }}>OK</span>
                    )}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center', display: 'none' }} className="mobile-only-column">
                    <button
                      onClick={() => {
                        const tooltip = document.createElement('div');
                        tooltip.className = 'info-tooltip';
                        tooltip.style.display = 'block';
                        
                        tooltip.innerHTML = `
                          <div style="font-weight: bold; margin-bottom: 10px; font-size: 18px; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 8px;">
                            Detalles del centro
                          </div>
                          <div style="margin-bottom: 15px;">
                            <strong>Centro:</strong> ${plaza.centro || '-'}
                          </div>
                          <div style="margin-bottom: 10px;">
                            <strong>Localidad:</strong> ${plaza.localidad || '-'}
                          </div>
                          <div style="margin-bottom: 10px;">
                            <strong>Municipio:</strong> ${plaza.municipio || '-'}
                          </div>
                          <div style="margin-bottom: 10px;">
                            <strong>Plazas totales:</strong> ${plaza.plazas}
                          </div>
                          <div style="margin-bottom: 15px;">
                            <strong>Plazas disponibles:</strong> ${plaza.plazas - plaza.asignadas}
                          </div>
                          <div style="margin-top: 15px; font-size: 13px; color: rgba(255,255,255,0.7)">
                            Toca fuera para cerrar
                          </div>
                        `;
                        
                        document.body.appendChild(tooltip);
                        
                        const backdrop = document.getElementById('tooltip-backdrop');
                        backdrop.style.display = 'block';
                        
                        backdrop.onclick = () => {
                          tooltip.remove();
                          backdrop.style.display = 'none';
                        };
                      }}
                      style={{
                        padding: '2px 6px',
                        backgroundColor: '#18539E',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer'
                      }}
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr style={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
              <td colSpan="4" style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'right' }}>TOTAL:</td>
              <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }} className="mobile-priority-low">{filteredPlazas.reduce((sum, p) => sum + p.plazas, 0)}</td>
              <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }} className="mobile-priority-low">{filteredPlazas.reduce((sum, p) => sum + p.asignadas, 0)}</td>
              <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>{filteredPlazas.reduce((sum, p) => sum + (p.plazas - p.asignadas), 0)}</td>
              <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}></td>
              <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center', display: 'none' }} className="mobile-only-column"></td>
            </tr>
          </tbody>
        </table>
      </div>
      
      {/* Controles de paginación */}
      {totalPages > 1 && (
        <div style={{ 
          marginTop: '20px', 
          display: 'flex', 
          justifyContent: 'center',
          alignItems: 'center',
          gap: '10px'
        }}>
          <button 
            onClick={prevPage} 
            disabled={currentPage === 1}
            style={{
              padding: '5px 10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: currentPage === 1 ? '#f2f2f2' : 'white',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
            }}
          >
            &laquo; Anterior
          </button>
          
          <div style={{ display: 'flex', gap: '5px' }}>
            {/* Primera página */}
            {currentPage > 3 && (
              <button 
                onClick={() => paginate(1)}
                style={{
                  padding: '5px 10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: 'white'
                }}
              >
                1
              </button>
            )}
            
            {/* Elipsis izquierdo */}
            {currentPage > 4 && <span style={{ padding: '5px' }}>...</span>}
            
            {/* Páginas cercanas a la actual */}
            {[...Array(totalPages).keys()].map(number => {
              const pageNumber = number + 1;
              // Mostrar solo la página actual y una página antes y después
              if (
                pageNumber === 1 ||
                pageNumber === totalPages ||
                (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1)
              ) {
                return (
                  <button
                    key={number}
                    onClick={() => paginate(pageNumber)}
                    style={{
                      padding: '5px 10px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      backgroundColor: currentPage === pageNumber ? '#007BFF' : 'white',
                      color: currentPage === pageNumber ? 'white' : 'black'
                    }}
                  >
                    {pageNumber}
                  </button>
                );
              }
              return null;
            })}
            
            {/* Elipsis derecho */}
            {currentPage < totalPages - 3 && <span style={{ padding: '5px' }}>...</span>}
            
            {/* Última página */}
            {currentPage < totalPages - 2 && (
              <button 
                onClick={() => paginate(totalPages)}
                style={{
                  padding: '5px 10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: 'white'
                }}
              >
                {totalPages}
              </button>
            )}
          </div>
          
          <button 
            onClick={nextPage} 
            disabled={currentPage === totalPages}
            style={{
              padding: '5px 10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: currentPage === totalPages ? '#f2f2f2' : 'white',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
            }}
          >
            Siguiente &raquo;
          </button>
        </div>
      )}
    </div>
  );
}

// Componente Footer
function Footer() {
  return (
    <div style={{ 
      marginTop: '40px',
      borderTop: '1px solid #ddd',
      padding: '15px 0',
      textAlign: 'center',
      fontSize: '14px',
      color: '#666'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px'
      }}>
        <p style={{ margin: 0 }}>
          Hecho por <a 
            href="https://ag-marketing.es" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{ 
              color: '#007BFF', 
              textDecoration: 'none', 
              fontWeight: 'bold'
            }}
          >
            AG Marketing
          </a>
        </p>
        <img 
          src={`${process.env.PUBLIC_URL}/AG_LOGO.png`}
          alt="AG Marketing Logo" 
          style={{ height: '30px', width: 'auto' }} 
        />
      </div>
    </div>
  );
}

// Añadir estilos para mostrar nombres completos de centros en la sección de selección
<style>
  {`
    @media (max-width: 768px) {
      .centro-nombre {
        display: inline;
        word-break: break-word;
        white-space: normal;
      }
      label {
        display: block;
        padding-left: 24px;
        text-indent: -24px;
        margin-bottom: 5px;
      }
      input[type="checkbox"] {
        margin-right: 6px !important;
      }
    }
  `}
</style>

export default App;
