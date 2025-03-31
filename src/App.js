import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

function App() {
  const [excelData, setExcelData] = useState([]);
  const [orderNumber, setOrderNumber] = useState('');
  const [centroSeleccionado, setCentroSeleccionado] = useState('');
  const [assignment, setAssignment] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [totalPlazas, setTotalPlazas] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [availablePlazas, setAvailablePlazas] = useState([]);

  // Cargar datos del CSV al iniciar
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
    
    // Intentamos cargar el CSV primero
    cargarCSV();
  }, []);

  // Función para procesar todas las solicitudes pendientes
  const procesarSolicitudes = () => {
    // Ordenar solicitudes por número de orden (prioridad)
    const solicitudesOrdenadas = [...solicitudes].sort((a, b) => a.orden - b.orden);
    
    // Lista de nuevas asignaciones realizadas
    const nuevasAsignaciones = [];
    const plazasActualizadas = [...availablePlazas];
    
    // Procesar cada solicitud en orden de prioridad
    for (const solicitud of solicitudesOrdenadas) {
      // Verificar si este número de orden ya tiene asignación
      const asignacionExistente = assignments.find(a => a.order === solicitud.orden);
      if (asignacionExistente) continue;
      
      // Buscar el centro solicitado
      const centroBuscado = plazasActualizadas.find(p => p.id === solicitud.centroId);
      
      if (centroBuscado && centroBuscado.asignadas < centroBuscado.plazas) {
        // Hay plaza disponible en el centro solicitado
        // Actualizar plazas
        const idx = plazasActualizadas.findIndex(p => p.id === solicitud.centroId);
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
          municipio: centroBuscado.municipio
        };
        
        nuevasAsignaciones.push(nuevaAsignacion);
      }
    }
    
    // Actualizar estado con las nuevas asignaciones
    if (nuevasAsignaciones.length > 0) {
      setAssignments(prev => [...prev, ...nuevasAsignaciones]);
      setAvailablePlazas(plazasActualizadas);
      
      // Encontrar y establecer la asignación para el número de orden actual si existe
      if (orderNumber) {
        const miAsignacion = nuevasAsignaciones.find(a => a.order === parseInt(orderNumber, 10));
        if (miAsignacion) {
          setAssignment(miAsignacion);
        }
      }
      
      // Eliminar solicitudes procesadas
      const ordenesAsignados = nuevasAsignaciones.map(a => a.order);
      setSolicitudes(prev => prev.filter(s => !ordenesAsignados.includes(s.orden)));
    }
  };

  const handleOrderSubmit = (e) => {
    e.preventDefault();
    const numOrden = parseInt(orderNumber, 10);
    if (isNaN(numOrden) || numOrden <= 0) {
      alert('Por favor, introduce un número de orden válido');
      return;
    }
    
    if (!centroSeleccionado) {
      alert('Por favor, selecciona un centro de trabajo');
      return;
    }

    // Verificar si este número de orden ya tiene asignación
    const existingAssignment = assignments.find(a => a.order === numOrden);
    if (existingAssignment) {
      setAssignment(existingAssignment);
      return;
    }
    
    // Verificar si ya existe una solicitud para este número de orden
    const solicitudExistente = solicitudes.find(s => s.orden === numOrden);
    if (solicitudExistente) {
      // Actualizar la solicitud existente con el nuevo centro seleccionado
      setSolicitudes(prev => 
        prev.map(s => s.orden === numOrden ? { ...s, centroId: parseInt(centroSeleccionado, 10) } : s)
      );
    } else {
      // Crear nueva solicitud
      const nuevaSolicitud = {
        orden: numOrden,
        centroId: parseInt(centroSeleccionado, 10)
      };
      
      // Añadir a la lista de solicitudes
      setSolicitudes(prev => [...prev, nuevaSolicitud]);
    }
    
    // Procesar solicitudes para asignar plazas según prioridad
    setTimeout(procesarSolicitudes, 100);
    
    // Limpiar formulario
    setCentroSeleccionado('');
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
          <div style={{ 
            backgroundColor: '#f8f9fa', 
            borderRadius: '5px', 
            padding: '15px', 
            marginBottom: '20px',
            border: '1px solid #ddd'
          }}>
            <p style={{ margin: '0', fontSize: '16px' }}>
              <strong>Total de plazas disponibles:</strong> {totalPlazas} en {availablePlazas.length} centros de trabajo
            </p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <form onSubmit={handleOrderSubmit} style={{ marginBottom: '25px' }}>
                <h2>Seleccionar número de orden y centro</h2>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    Número de orden:
                  </label>
                  <input
                    type="number"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    required
                    min="1"
                    style={{ 
                      width: '100%', 
                      padding: '8px', 
                      borderRadius: '4px', 
                      border: '1px solid #ddd',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
                
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    Centro de trabajo:
                  </label>
                  <select
                    value={centroSeleccionado}
                    onChange={(e) => setCentroSeleccionado(e.target.value)}
                    required
                    style={{ 
                      width: '100%', 
                      padding: '8px', 
                      borderRadius: '4px', 
                      border: '1px solid #ddd',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="">Seleccione un centro</option>
                    {availablePlazas
                      .filter(plaza => (plaza.plazas - plaza.asignadas) > 0)
                      .map(plaza => (
                        <option key={plaza.id} value={plaza.id}>
                          {plaza.centro} - {plaza.municipio} ({plaza.plazas - plaza.asignadas} plazas disp.)
                        </option>
                      ))}
                  </select>
                </div>
                
                <button 
                  type="submit" 
                  style={{ 
                    backgroundColor: '#28a745', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: '4px', 
                    padding: '10px 15px', 
                    cursor: 'pointer', 
                    fontSize: '16px',
                    width: '100%'
                  }}
                >
                  Añadir solicitud
                </button>
              </form>
              
              <SolicitudesPendientes 
                solicitudes={solicitudes} 
                centros={availablePlazas} 
                procesarSolicitudes={procesarSolicitudes} 
              />
            </div>
            
            <div>
              <PlazasDisponibles availablePlazas={availablePlazas} />
            </div>
          </div>
          
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
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left' }}>Centro Solicitado</th>
            </tr>
          </thead>
          <tbody>
            {solicitudesOrdenadas.map((solicitud, index) => {
              const centro = centros.find(c => c.id === solicitud.centroId);
              return (
                <tr key={index} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9' }}>
                  <td style={{ border: '1px solid #ddd', padding: '10px' }}>{solicitud.orden}</td>
                  <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                    {centro ? centro.centro : 'Centro no encontrado'}
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
      <p>
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
    </div>
  );
}

export default App;
