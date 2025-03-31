import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { db } from './firebase';
import { collection, addDoc, getDocs, doc, updateDoc, onSnapshot, query, orderBy, deleteDoc } from 'firebase/firestore';

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

  // Cargar datos del CSV al iniciar y configurar la escucha de Firebase
  useEffect(() => {
    // Función para usar datos simulados (solo como respaldo)
    const usarDatosSimulados = () => {
      // Datos simulados de centros de trabajo (como respaldo)
      const datosSimulados = [
        { id: 1, localidad: "Valencia", centro: "Hospital La Fe", municipio: "Valencia", plazas: 5 },
        { id: 2, localidad: "Alicante", centro: "Hospital General", municipio: "Alicante", plazas: 3 },
        { id: 3, localidad: "Castellón", centro: "Hospital Provincial", municipio: "Castellón", plazas: 4 },
        { id: 4, localidad: "Elche", centro: "Hospital del Vinalopó", municipio: "Elche", plazas: 2 },
        { id: 5, localidad: "Torrevieja", centro: "Hospital de Torrevieja", municipio: "Torrevieja", plazas: 3 },
        { id: 6, localidad: "Gandía", centro: "Hospital Francesc de Borja", municipio: "Gandía", plazas: 2 },
        { id: 7, localidad: "Alcoy", centro: "Hospital Virgen de los Lirios", municipio: "Alcoy", plazas: 3 },
        { id: 8, localidad: "Dénia", centro: "Hospital Marina Salud", municipio: "Dénia", plazas: 2 },
        { id: 9, localidad: "Valencia", centro: "Hospital Clínico", municipio: "Valencia", plazas: 4 },
        { id: 10, localidad: "Valencia", centro: "Hospital Dr. Peset", municipio: "Valencia", plazas: 3 },
        { id: 11, localidad: "Alicante", centro: "Hospital San Juan", municipio: "San Juan", plazas: 2 },
        { id: 12, localidad: "Sagunto", centro: "Hospital de Sagunto", municipio: "Sagunto", plazas: 1 },
        { id: 13, localidad: "Requena", centro: "Hospital de Requena", municipio: "Requena", plazas: 2 },
        { id: 14, localidad: "Alcira", centro: "Hospital La Ribera", municipio: "Alcira", plazas: 3 },
        { id: 15, localidad: "Játiva", centro: "Hospital Lluís Alcanyís", municipio: "Játiva", plazas: 2 }
      ];
      
      setExcelData(datosSimulados);
      setAvailablePlazas(datosSimulados.map(plaza => ({...plaza, asignadas: 0})));
      
      // Calcular total de plazas
      const total = datosSimulados.reduce((sum, item) => sum + item.plazas, 0);
      setTotalPlazas(total);
      setIsLoading(false);
      console.log("Usando datos simulados con éxito. Total centros: " + datosSimulados.length);
      
      // Inicializar colección en Firebase si no existe
      initializeFirebaseCollections(datosSimulados);
    };

    // Inicializar colecciones de Firebase
    const initializeFirebaseCollections = async (centros) => {
      try {
        // Verificar si ya existen datos en Firebase
        const centrosSnapshot = await getDocs(collection(db, "centros"));
        
        if (centrosSnapshot.empty) {
          console.log("Inicializando colección de centros en Firebase...");
          // Guardar los centros en Firebase
          for (const centro of centros) {
            await addDoc(collection(db, "centros"), {
              ...centro,
              asignadas: 0,
              timestamp: new Date().getTime()
            });
          }
        }
      } catch (error) {
        console.error("Error al inicializar colecciones Firebase:", error);
      }
    };

    // Función para cargar datos de Firebase
    const cargarDatosFirebase = async () => {
      try {
        // Configurar escuchas en tiempo real para ambas colecciones
        // 1. Escuchar cambios en los centros
        const q1 = query(collection(db, "centros"), orderBy("id"));
        const unsubscribeCentros = onSnapshot(q1, (snapshot) => {
          const centrosData = snapshot.docs.map(doc => ({
            id: doc.data().id,
            docId: doc.id, // Guardamos la referencia al documento
            localidad: doc.data().localidad,
            departamento: doc.data().departamento,
            centro: doc.data().centro,
            municipio: doc.data().municipio,
            plazas: doc.data().plazas,
            asignadas: doc.data().asignadas || 0
          }));
          
          setAvailablePlazas(centrosData);
          setExcelData(centrosData);
          
          // Calcular el total de plazas
          const total = centrosData.reduce((sum, item) => sum + item.plazas, 0);
          setTotalPlazas(total);
        });
        
        // 2. Escuchar cambios en las asignaciones
        const q2 = query(collection(db, "asignaciones"), orderBy("order"));
        const unsubscribeAsignaciones = onSnapshot(q2, (snapshot) => {
          const asignacionesData = snapshot.docs.map(doc => ({
            docId: doc.id,
            order: doc.data().order,
            id: doc.data().id,
            localidad: doc.data().localidad,
            centro: doc.data().centro,
            municipio: doc.data().municipio,
            timestamp: doc.data().timestamp
          }));
          
          setAssignments(asignacionesData);
        });
        
        // 3. Escuchar cambios en las solicitudes pendientes
        const q3 = query(collection(db, "solicitudesPendientes"), orderBy("orden"));
        const unsubscribeSolicitudes = onSnapshot(q3, (snapshot) => {
          const solicitudesData = snapshot.docs.map(doc => ({
            docId: doc.id,
            orden: doc.data().orden,
            centrosIds: doc.data().centrosIds || [],
            timestamp: doc.data().timestamp
          }));
          
          setSolicitudes(solicitudesData);
        });
        
        // Devolver funciones para cancelar las escuchas cuando se desmonte el componente
        return () => {
          unsubscribeCentros();
          unsubscribeAsignaciones();
          unsubscribeSolicitudes();
        };
      } catch (error) {
        console.error("Error al cargar datos de Firebase:", error);
        return null;
      }
    };

    // Intentaremos primero cargar el CSV
    const cargarCSV = async () => {
      try {
        setIsLoading(true);
        
        // Rutas posibles para el archivo CSV (intentar varias opciones)
        const posiblesRutas = [
          '/plazas.csv',            // Carpeta public
          './plazas.csv',           // Relativa a public
          '/src/plazas.csv',        // Src en public
          './src/plazas.csv',       // Relativa a src
          `${process.env.PUBLIC_URL}/plazas.csv` // Con PUBLIC_URL
        ];
        
        let texto = null;
        let rutaCargada = '';
        
        // Intentar cargar el archivo de cada ruta posible
        for (const ruta of posiblesRutas) {
          try {
            console.log(`Intentando cargar desde: ${ruta}`);
            const respuesta = await fetch(ruta);
            if (respuesta.ok) {
              texto = await respuesta.text();
              rutaCargada = ruta;
              console.log(`Archivo CSV cargado correctamente desde: ${ruta}`);
              break;
            }
          } catch (e) {
            console.warn(`No se pudo cargar desde ${ruta}: ${e.message}`);
          }
        }
        
        if (!texto) {
          throw new Error('No se pudo cargar el archivo CSV desde ninguna ruta');
        }
        
        // Parsear el CSV con PapaParse
        Papa.parse(texto, {
          delimiter: ';', // Especificar punto y coma como delimitador
          skipEmptyLines: true,
          complete: (resultado) => {
            console.log('CSV cargado. Contenido completo:', resultado);
            
            // Saltamos las primeras 3 filas (encabezados y títulos del documento)
            const datosSinEncabezados = resultado.data.slice(3);
            
            if (datosSinEncabezados.length === 0) {
              throw new Error('El archivo CSV no contiene datos después de saltar encabezados');
            }
            
            // Usar la cuarta fila como nombres de columna
            const nombresColumnas = resultado.data[3];
            console.log('Nombres de columnas detectados:', nombresColumnas);
            
            // Procesar datos a partir de la quinta fila
            const datosCentros = resultado.data.slice(4);
            console.log('Primeras filas de datos:', datosCentros.slice(0, 3));
            
            // Procesar cada fila en el formato específico de este CSV
            const centrosProcesados = datosCentros
              .filter(fila => fila.length >= 6) // Asegurar que la fila tiene suficientes columnas
              .map((fila, index) => {
                // En este CSV específico:
                // fila[0] = A.S.I. (Localidad)
                // fila[1] = Departamento
                // fila[2] = Código Centro Trabajo
                // fila[3] = Centro de Trabajo
                // fila[4] = Municipio
                // fila[5] = Número de plazas
                
                const plazasStr = fila[5] ? fila[5].trim() : '0';
                const plazas = parseInt(plazasStr, 10) || 0;
                
                return {
                  id: index + 1,
                  localidad: fila[0] ? fila[0].trim() : '',
                  departamento: fila[1] ? fila[1].trim() : '',
                  centro: fila[3] ? fila[3].trim() : '',
                  municipio: fila[4] ? fila[4].trim() : '',
                  plazas: plazas
                };
              })
              .filter(centro => centro.plazas > 0); // Filtrar solo los que tienen plazas
            
            console.log('Centros procesados del CSV:', centrosProcesados.length);
            console.log('Ejemplos de centros procesados:', centrosProcesados.slice(0, 3));
            
            if (centrosProcesados.length === 0) {
              console.error('No se pudieron extraer centros con plazas > 0');
              usarDatosSimulados();
              return;
            }
            
            // Inicializar el estado de plazas disponibles
            const plazasIniciales = centrosProcesados.map(centro => ({
              ...centro,
              asignadas: 0
            }));
            
            setExcelData(centrosProcesados);
            setAvailablePlazas(plazasIniciales);
            
            // Calcular el total de plazas
            const totalPlazas = plazasIniciales.reduce((suma, centro) => suma + centro.plazas, 0);
            setTotalPlazas(totalPlazas);
            console.log(`CSV procesado. Total de centros: ${centrosProcesados.length}, Total plazas: ${totalPlazas}`);
            setIsLoading(false);
            
            // Inicializar datos en Firebase
            initializeFirebaseCollections(plazasIniciales);
          },
          error: (error) => {
            console.error('Error al parsear el CSV:', error);
            usarDatosSimulados();
          }
        });
      } catch (error) {
        console.error('Error al cargar el CSV:', error);
        // Usar datos simulados como respaldo en caso de error
        usarDatosSimulados();
      }
    };
    
    // Cargamos primero el CSV para obtener los datos iniciales
    cargarCSV().then(() => {
      // Después configuramos Firebase para escuchar actualizaciones en tiempo real
      const unsubscribe = cargarDatosFirebase();
      
      // Limpieza al desmontar
      return () => {
        if (unsubscribe) unsubscribe();
      };
    });
  }, []);

  // Función para procesar todas las solicitudes pendientes
  const procesarSolicitudes = async () => {
    // Ordenar solicitudes por número de orden (prioridad)
    const solicitudesOrdenadas = [...solicitudes].sort((a, b) => a.orden - b.orden);
    
    // Lista de nuevas asignaciones realizadas
    const nuevasAsignaciones = [];
    const plazasActualizadas = [...availablePlazas];
    
    // Conjunto para almacenar los IDs de orden ya asignados
    const ordenesAsignados = new Set();
    
    // Procesar cada solicitud en orden de prioridad
    for (const solicitud of solicitudesOrdenadas) {
      // Verificar si este número de orden ya tiene asignación
      const asignacionExistente = assignments.find(a => a.order === solicitud.orden);
      if (asignacionExistente || ordenesAsignados.has(solicitud.orden)) continue;
      
      // Verificar cada centro solicitado en orden de preferencia
      for (const centroId of solicitud.centrosIds) {
        // Buscar el centro solicitado
        const centroBuscado = plazasActualizadas.find(p => p.id === centroId);
        
        if (centroBuscado && centroBuscado.asignadas < centroBuscado.plazas) {
          // Hay plaza disponible en el centro solicitado
          // Actualizar plazas
          const idx = plazasActualizadas.findIndex(p => p.id === centroId);
          plazasActualizadas[idx] = {
            ...plazasActualizadas[idx],
            asignadas: plazasActualizadas[idx].asignadas + 1
          };
          
          // Crear nueva asignación
          const nuevaAsignacion = {
            order: solicitud.orden,
            id: centroBuscado.id,
            localidad: centroBuscado.localidad,
            centro: centroBuscado.centro,
            municipio: centroBuscado.municipio,
            timestamp: new Date().getTime()
          };
          
          nuevasAsignaciones.push(nuevaAsignacion);
          ordenesAsignados.add(solicitud.orden);
          
          // Una vez asignado, pasamos al siguiente número de orden
          break;
        }
      }
    }
    
    // Actualizar Firebase con las nuevas asignaciones
    if (nuevasAsignaciones.length > 0) {
      try {
        // 1. Guardar las nuevas asignaciones
        for (const asignacion of nuevasAsignaciones) {
          await addDoc(collection(db, "asignaciones"), asignacion);
        }
        
        // 2. Actualizar las plazas disponibles
        for (const plaza of plazasActualizadas) {
          if (plaza.docId) { // Solo si tiene ID de documento
            const centroRef = doc(db, "centros", plaza.docId);
            await updateDoc(centroRef, { asignadas: plaza.asignadas });
          }
        }
        
        // 3. Eliminar las solicitudes procesadas
        for (const solicitud of solicitudesOrdenadas) {
          if (ordenesAsignados.has(solicitud.orden) && solicitud.docId) {
            const solicitudRef = doc(db, "solicitudesPendientes", solicitud.docId);
            await deleteDoc(solicitudRef);
          }
        }
        
        // Encontrar y establecer la asignación para el número de orden actual si existe
        if (orderNumber) {
          const miAsignacion = nuevasAsignaciones.find(a => a.order === parseInt(orderNumber, 10));
          if (miAsignacion) {
            setAssignment(miAsignacion);
          }
        }
      } catch (error) {
        console.error("Error al actualizar Firebase:", error);
        alert("Error al procesar solicitudes. Inténtelo de nuevo.");
      }
    }
  };

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
      return;
    }
    
    try {
      // Verificar si ya existe una solicitud para este número de orden
      const solicitudExistente = solicitudes.find(s => s.orden === numOrden);
      
      if (solicitudExistente) {
        // Actualizar la solicitud existente con los nuevos centros seleccionados
        const solicitudRef = doc(db, "solicitudesPendientes", solicitudExistente.docId);
        await updateDoc(solicitudRef, { 
          centrosIds: centrosSeleccionados.map(id => parseInt(id, 10)),
          timestamp: new Date().getTime()
        });
      } else {
        // Crear nueva solicitud en Firebase
        await addDoc(collection(db, "solicitudesPendientes"), {
          orden: numOrden,
          centrosIds: centrosSeleccionados.map(id => parseInt(id, 10)),
          timestamp: new Date().getTime()
        });
      }
      
      // Limpiar formulario
      setCentrosSeleccionados([]);
      
      // Procesar solicitudes
      setTimeout(procesarSolicitudes, 500);
    } catch (error) {
      console.error("Error al guardar solicitud:", error);
      alert("Error al guardar la solicitud. Inténtelo de nuevo.");
    }
  };

  // Función para manejar la selección de múltiples centros con checkboxes
  const handleCentroChange = (e) => {
    const centroId = e.target.value;
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
      <h1 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>Asignación de Plazas</h1>
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '50px' }}>
          <h2>Cargando datos...</h2>
          <p>Por favor espere mientras se cargan los centros de trabajo.</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
            <h2>Información General</h2>
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
               
              <div style={{ padding: '10px', backgroundColor: '#e0f7fa', borderRadius: '5px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Solicitudes Pendientes</h3>
                <p style={{ margin: '0', fontSize: '24px', fontWeight: 'bold' }}>{solicitudes.length}</p>
              </div>
            </div>
          </div>
          
          <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px' }}>
            <h2>Solicitar Plaza</h2>
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
                />
              </div>
              
              <div>
                <label htmlFor="centrosGroup" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Centros de Trabajo (selecciona múltiples en orden de preferencia):
                </label>
                <div 
                  id="centrosGroup"
                  style={{
                    maxHeight: '250px',
                    overflowY: 'auto',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    padding: '10px',
                    backgroundColor: '#fff'
                  }}
                >
                  {availablePlazas
                    .filter(plaza => (plaza.plazas - plaza.asignadas) > 0)
                    .sort((a, b) => a.id - b.id)
                    .map((plaza) => {
                      const disponibles = plaza.plazas - plaza.asignadas;
                      const estaLleno = disponibles === 0;
                      return (
                        <div 
                          key={plaza.id}
                          style={{
                            padding: '8px',
                            borderBottom: '1px solid #eee',
                            display: 'flex',
                            alignItems: 'center',
                            opacity: estaLleno ? 0.5 : 1
                          }}
                        >
                          <input
                            type="checkbox"
                            id={`centro-${plaza.id}`}
                            value={plaza.id}
                            checked={centrosSeleccionados.includes(plaza.id.toString())}
                            onChange={handleCentroChange}
                            disabled={estaLleno}
                            style={{ marginRight: '10px' }}
                          />
                          <label 
                            htmlFor={`centro-${plaza.id}`}
                            style={{ 
                              cursor: estaLleno ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              flexDirection: 'column'
                            }}
                          >
                            <span style={{ fontWeight: 'bold' }}>{plaza.centro} - {plaza.localidad}</span>
                            <span style={{ fontSize: '0.9em', color: '#666' }}>
                              {plaza.municipio} ({disponibles} de {plaza.plazas} plazas disponibles)
                            </span>
                          </label>
                        </div>
                      );
                    })}
                </div>
                <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
                  Marca las casillas de los centros que te interesan. El orden de selección determina la prioridad.
                </p>
              </div>
              
              <button 
                type="submit" 
                style={{ 
                  padding: '10px 16px', 
                  backgroundColor: '#4CAF50', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: 'pointer',
                  marginTop: '10px',
                  alignSelf: 'flex-start'
                }}
              >
                Solicitar Plaza
              </button>
            </form>
            
            <SolicitudesPendientes 
              solicitudes={solicitudes} 
              centros={availablePlazas} 
              procesarSolicitudes={procesarSolicitudes} 
            />
          </div>
          
          <PlazasDisponibles availablePlazas={availablePlazas} />
          
          {assignment && (
            <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9f9f9', border: '1px solid #ddd', borderRadius: '5px' }}>
              <h2>Tu Asignación</h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <p><strong>Número de Orden:</strong> {assignment.order}</p>
                <p><strong>Localidad:</strong> {assignment.localidad}</p>
                <p><strong>Centro de Trabajo:</strong> {assignment.centro}</p>
                <p><strong>Municipio:</strong> {assignment.municipio}</p>
              </div>
            </div>
          )}
          
          <Dashboard assignments={assignments} />
          <Footer />
        </>
      )}
    </div>
  );
}

function SolicitudesPendientes({ solicitudes, centros, procesarSolicitudes }) {
  if (!solicitudes.length) return null;
  
  // Ordenar solicitudes por número de orden
  const solicitudesOrdenadas = [...solicitudes].sort((a, b) => a.orden - b.orden);
  
  return (
    <div style={{ marginTop: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2>Solicitudes Pendientes</h2>
        <button 
          onClick={procesarSolicitudes} 
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#FF9800', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: 'pointer' 
          }}
        >
          Procesar Solicitudes
        </button>
      </div>
      
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f2f2f2' }}>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left' }}>Número de Orden</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left' }}>Centros Solicitados (por orden de preferencia)</th>
            </tr>
          </thead>
          <tbody>
            {solicitudesOrdenadas.map((solicitud, index) => {
              // Mapear cada ID de centro a su objeto completo
              const centrosSolicitados = solicitud.centrosIds
                .map(id => centros.find(c => c.id === id))
                .filter(c => c); // Filtrar indefinidos
              
              return (
                <tr key={index} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9' }}>
                  <td style={{ border: '1px solid #ddd', padding: '10px' }}>{solicitud.orden}</td>
                  <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                    {centrosSolicitados.length > 0 ? (
                      <ol style={{ margin: 0, paddingLeft: '20px' }}>
                        {centrosSolicitados.map((centro, idx) => (
                          <li key={idx}>
                            <strong>{centro.centro}</strong> - {centro.localidad} ({centro.municipio})
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <span>No hay centros válidos seleccionados</span>
                    )}
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
  
  return (
    <div style={{ marginTop: '30px' }}>
      <h2>Estado de las Plazas</h2>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f2f2f2' }}>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left' }}>ID</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left' }}>Centro de Trabajo</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left' }}>Localidad</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left' }}>Municipio</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>Plazas Totales</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>Asignadas</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>Disponibles</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {plazasOrdenadas.map((plaza, index) => {
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
                  <td style={{ border: '1px solid #ddd', padding: '10px', fontWeight: 'bold' }}>{plaza.centro || '-'}</td>
                  <td style={{ border: '1px solid #ddd', padding: '10px' }}>{plaza.localidad || '-'}</td>
                  <td style={{ border: '1px solid #ddd', padding: '10px' }}>{plaza.municipio || '-'}</td>
                  <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>{plaza.plazas}</td>
                  <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>{plaza.asignadas}</td>
                  <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center', fontWeight: 'bold', color: estaLleno ? 'red' : 'green' }}>
                    {disponibles}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>
                    {estaLleno ? (
                      <span style={{ color: 'red', fontWeight: 'bold' }}>COMPLETO</span>
                    ) : (
                      <span style={{ color: 'green' }}>Disponible</span>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr style={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
              <td colSpan="4" style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'right' }}>TOTAL:</td>
              <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>{plazasOrdenadas.reduce((sum, p) => sum + p.plazas, 0)}</td>
              <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>{plazasOrdenadas.reduce((sum, p) => sum + p.asignadas, 0)}</td>
              <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>{plazasOrdenadas.reduce((sum, p) => sum + (p.plazas - p.asignadas), 0)}</td>
              <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Dashboard({ assignments }) {
  if (!assignments.length) return null;
  
  // Ordenar las asignaciones por número de orden
  const sortedAssignments = [...assignments].sort((a, b) => a.order - b.order);
  
  // Función para exportar a Excel
  const exportToExcel = () => {
    // Crear un nuevo libro de trabajo
    const workbook = XLSX.utils.book_new();
    
    // Convertir los datos a formato de hoja de cálculo
    const worksheet = XLSX.utils.json_to_sheet(sortedAssignments.map(a => ({
      'Número de Orden': a.order,
      'Localidad': a.localidad,
      'Centro de Trabajo': a.centro,
      'Municipio': a.municipio
    })));
    
    // Añadir la hoja al libro
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asignaciones');
    
    // Generar el archivo y descargarlo
    XLSX.writeFile(workbook, 'asignaciones_plazas.xlsx');
  };
  
  return (
    <div style={{ marginTop: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2>Historial de Asignaciones</h2>
        <button 
          onClick={exportToExcel} 
          style={{ 
            padding: '8px 16px', 
            backgroundColor: '#007BFF', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: 'pointer' 
          }}
        >
          Exportar a Excel
        </button>
      </div>
      
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f2f2f2' }}>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left' }}>Número de Orden</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left' }}>Localidad</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left' }}>Centro de Trabajo</th>
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left' }}>Municipio</th>
            </tr>
          </thead>
          <tbody>
            {sortedAssignments.map((a, index) => (
              <tr key={index} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9' }}>
                <td style={{ border: '1px solid #ddd', padding: '10px' }}>{a.order}</td>
                <td style={{ border: '1px solid #ddd', padding: '10px' }}>{a.localidad}</td>
                <td style={{ border: '1px solid #ddd', padding: '10px' }}>{a.centro}</td>
                <td style={{ border: '1px solid #ddd', padding: '10px' }}>{a.municipio}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

export default App;
