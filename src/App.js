import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { db } from './firebase';
import { collection, addDoc, getDocs, doc, updateDoc, onSnapshot, query, orderBy, deleteDoc } from 'firebase/firestore';

// Definir el estilo para la animación del spinner
const spinnerAnimation = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;



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

  // Cargar datos del CSV al iniciar y configurar la escucha de Firebase
  useEffect(() => {
    setIsLoading(true);
    
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
        console.log("Intentando cargar datos desde Firebase...");
        
        // Verificar si hay datos en Firebase
        const centrosSnapshot = await getDocs(collection(db, "centros"));
        const tieneDataEnFirebase = !centrosSnapshot.empty;
        
        if (tieneDataEnFirebase) {
          console.log("Se encontraron datos en Firebase, usando estos datos...");
          
          // Configurar escuchas en tiempo real para las colecciones
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
            setIsLoading(false); // Ya no estamos cargando
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
          return { 
            unsubscribe: () => {
              unsubscribeCentros();
              unsubscribeAsignaciones();
              unsubscribeSolicitudes();
            },
            datosEncontrados: true 
          };
        } else {
          console.log("No se encontraron datos en Firebase, se cargarán desde CSV...");
          return { 
            unsubscribe: () => {}, 
            datosEncontrados: false 
          };
        }
      } catch (error) {
        console.error("Error al cargar datos de Firebase:", error);
        return { 
          unsubscribe: () => {}, 
          datosEncontrados: false 
        };
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
            console.log('CSV cargado. Total de filas:', resultado.data.length);
            
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
            console.log('Total de centros en CSV (sin procesar):', datosCentros.length);
            
            // Función para examinar las filas con problemas
            const diagnosticarDatos = (filas) => {
              // Conteo de filas con diferentes longitudes
              const conteoLongitud = {};
              filas.forEach((fila, idx) => {
                const longitud = fila.length;
                if (!conteoLongitud[longitud]) {
                  conteoLongitud[longitud] = [];
                }
                // Guardar solo las primeras 5 filas de cada longitud para no sobrecargar el log
                if (conteoLongitud[longitud].length < 5) {
                  conteoLongitud[longitud].push({
                    indice: idx + 4, // Ajustar el índice al archivo original
                    contenido: fila
                  });
                }
              });
              
              console.log('Distribución de longitudes de filas:', Object.keys(conteoLongitud).map(k => 
                `${k} columnas: ${filas.filter(f => f.length == k).length} filas`
              ).join(', '));
              
              // Examinar algunas filas de cada longitud
              Object.keys(conteoLongitud).forEach(longitud => {
                if (longitud < 6) { // Solo mostrar filas potencialmente problemáticas
                  console.log(`Ejemplos de filas con ${longitud} columnas:`, conteoLongitud[longitud]);
                }
              });
              
              // Verificar valores de plazas
              const valoresPlazas = filas
                .filter(fila => fila.length >= 6 && fila[5])
                .map(fila => {
                  // Guardar el valor original para diagnóstico
                  const valorOriginal = fila[5].toString().trim();
                  
                  // Intentar varias formas de parseo
                  const valorInt = parseInt(valorOriginal.replace(',', '.'), 10);
                  const valorFloat = parseFloat(valorOriginal.replace(',', '.'));
                  
                  return {
                    original: valorOriginal,
                    comoCadena: valorOriginal,
                    comoEntero: valorInt,
                    comoDecimal: valorFloat,
                    esNaN: isNaN(valorInt)
                  };
                });
              
              // Filtrar por valores problemáticos
              const valoresProblematicos = valoresPlazas.filter(v => 
                isNaN(v.comoEntero) || v.comoEntero === 0 || v.comoEntero !== v.comoDecimal
              );
              
              if (valoresProblematicos.length > 0) {
                console.log(`Encontrados ${valoresProblematicos.length} valores de plazas problemáticos.`);
                console.log('Primeros 10 ejemplos:', valoresProblematicos.slice(0, 10));
              }
              
              // Verificar valores extremos
              const valoresExtremos = valoresPlazas
                .filter(v => !isNaN(v.comoEntero) && v.comoEntero > 100)
                .sort((a, b) => b.comoEntero - a.comoEntero);
                
              if (valoresExtremos.length > 0) {
                console.log(`Encontrados ${valoresExtremos.length} valores de plazas inusualmente altos (>100).`);
                console.log('Primeros 5 ejemplos:', valoresExtremos.slice(0, 5));
              }
            };
            
            // Ejecutar diagnóstico sobre los datos
            diagnosticarDatos(datosCentros);
            
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
                
                // Procesar el número de plazas correctamente
                let plazas = 0;
                if (fila[5]) {
                  // Limpiar el valor y asegurar que sea un número
                  const plazasStr = fila[5].toString().trim().replace(/\./g, '').replace(',', '.');
                  
                  // Intentar convertir a entero primero
                  plazas = parseInt(plazasStr, 10);
                  // Si no es un entero válido, probar como float y redondear
                  if (isNaN(plazas)) {
                    const plazasFloat = parseFloat(plazasStr);
                    if (!isNaN(plazasFloat)) {
                      plazas = Math.round(plazasFloat);
                    }
                  }
                  
                  // Para diagnóstico, verificar casos específicos
                  if (plazas > 100) {
                    console.log(`Valor inusualmente alto de plazas: ${plazas} (original: "${fila[5]}") en centro: ${fila[3] || 'sin nombre'}`);
                  }
                  
                  // Asegurar que sea al menos 0
                  plazas = plazas || 0;
                }
                
                return {
                  id: index + 1,
                  codigo: fila[2] ? fila[2].toString().trim() : '',
                  localidad: fila[0] ? fila[0].toString().trim() : '',
                  departamento: fila[1] ? fila[1].toString().trim() : '',
                  centro: fila[3] ? fila[3].toString().trim() : '',
                  municipio: fila[4] ? fila[4].toString().trim() : '',
                  plazas: plazas
                };
              })
              .filter(centro => {
                // Filtrar solo los que tienen datos válidos y plazas > 0
                const esValido = centro.centro && centro.plazas > 0;
                if (!esValido) {
                  console.warn(`Centro inválido descartado: ${JSON.stringify(centro)}`);
                }
                return esValido;
              });
            
            console.log('Centros procesados del CSV:', centrosProcesados.length);
            console.log('Primeros 5 centros procesados:', centrosProcesados.slice(0, 5));
            console.log('Últimos 5 centros procesados:', centrosProcesados.slice(-5));
            
            // Verificar si el total de plazas es el esperado
            const totalPlazas = centrosProcesados.reduce((suma, centro) => suma + centro.plazas, 0);
            console.log(`Total de plazas calculado: ${totalPlazas}`);
            
            // Si el total no coincide aproximadamente con el esperado (7066), hay un problema
            const totalEsperado = 7066;
            const diferenciaPermitida = 100; // Permitir cierta diferencia por redondeo
            if (Math.abs(totalPlazas - totalEsperado) > diferenciaPermitida) {
              console.warn(`Alerta: El total de plazas calculado (${totalPlazas}) difiere significativamente del esperado (${totalEsperado})`);
              
              // Crear archivo de diagnóstico
              const datosDiagnostico = {
                totalCalculado: totalPlazas,
                totalEsperado: totalEsperado,
                diferenciaAbsoluta: Math.abs(totalPlazas - totalEsperado),
                diferenciaPorcentaje: Math.abs((totalPlazas - totalEsperado) / totalEsperado * 100).toFixed(2) + '%',
                totalCentros: centrosProcesados.length,
                distribucionPlazas: {}
              };
              
              // Calcular distribución de plazas para diagnóstico
              centrosProcesados.forEach(c => {
                const plazoKey = c.plazas.toString();
                if (datosDiagnostico.distribucionPlazas[plazoKey]) {
                  datosDiagnostico.distribucionPlazas[plazoKey]++;
                } else {
                  datosDiagnostico.distribucionPlazas[plazoKey] = 1;
                }
              });
              
              // Exportar los datos a la consola en formato JSON
              console.log('DATOS DE DIAGNÓSTICO:', JSON.stringify(datosDiagnostico, null, 2));
              
              // Detectar los centros con mayor número de plazas (posibles errores)
              const centrosConMasPlazas = [...centrosProcesados]
                .sort((a, b) => b.plazas - a.plazas)
                .slice(0, 10);
              console.log('Centros con más plazas (revisar posibles errores):', centrosConMasPlazas);
              
              // Imprimir algunas estadísticas adicionales
              const totalPlazasMayores100 = centrosProcesados
                .filter(c => c.plazas > 100)
                .reduce((suma, c) => suma + c.plazas, 0);
              
              console.log(`Total de plazas en centros con más de 100 plazas: ${totalPlazasMayores100} (${(totalPlazasMayores100/totalPlazas*100).toFixed(2)}% del total)`);
            }
            
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
            
            console.log(`CSV procesado con éxito. Total de centros: ${centrosProcesados.length}, Total plazas: ${totalPlazas}`);
            
            // Actualizar el estado de la aplicación
            setExcelData(centrosProcesados);
            setAvailablePlazas(plazasIniciales);
            setTotalPlazas(totalPlazas);
            setIsLoading(false);
            
            // Inicializar datos en Firebase
            limpiarYActualizarFirebase(plazasIniciales);
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
    
    // Función para limpiar colecciones previas y actualizar con nuevos datos
    const limpiarYActualizarFirebase = async (centros) => {
      try {
        console.log("Limpiando y actualizando datos en Firebase...");
        
        // 1. Limpiar las colecciones existentes
        const centrosSnapshot = await getDocs(collection(db, "centros"));
        const borradosCentros = [];
        
        // Borrar documentos existentes en la colección de centros
        for (const docSnap of centrosSnapshot.docs) {
          borradosCentros.push(deleteDoc(doc(db, "centros", docSnap.id)));
        }
        
        // Esperar a que se completen todas las operaciones de borrado
        await Promise.all(borradosCentros);
        console.log(`Borrados ${borradosCentros.length} centros antiguos de Firebase`);
        
        // 2. Crear nuevos documentos con los centros procesados
        console.log(`Iniciando carga de ${centros.length} centros en Firebase...`);
        const lotes = [];
        const tamanoLote = 100; // Procesar en lotes para evitar sobrecargar Firestore
        
        for (let i = 0; i < centros.length; i += tamanoLote) {
          const lote = centros.slice(i, i + tamanoLote);
          const promesasLote = lote.map(centro => 
            addDoc(collection(db, "centros"), {
              ...centro,
              timestamp: Date.now()
            })
          );
          
          // Ejecutar el lote y esperar a que termine
          await Promise.all(promesasLote);
          console.log(`Procesado lote ${i/tamanoLote + 1} de ${Math.ceil(centros.length/tamanoLote)}`);
        }
        
        console.log("Firebase actualizado correctamente con todos los centros");
      } catch (error) {
        console.error("Error al limpiar y actualizar Firebase:", error);
      }
    };

    // Intentaremos primero cargar de Firebase
    const cargarDatos = async () => {
      // Primero intentamos cargar desde Firebase
      const { unsubscribe, datosEncontrados } = await cargarDatosFirebase();
      
      // Si no hay datos en Firebase, intentamos cargar desde CSV
      if (!datosEncontrados) {
        console.log("No se encontraron datos en Firebase, cargando desde CSV...");
        await cargarCSV();
      }
      
      // Devolver función para limpiar
      return unsubscribe;
    };
    
    // Comenzar la carga de datos
    let unsubscribeFunc = () => {};
    cargarDatos().then(unsubscribe => {
      unsubscribeFunc = unsubscribe;
    });
    
    // Limpieza al desmontar el componente
    return () => {
      unsubscribeFunc();
    };
  }, []);

  // Función para procesar todas las solicitudes pendientes
  const procesarSolicitudes = async () => {
    setIsProcessing(true);
    
    try {
      // Ordenar solicitudes por número de orden (prioridad)
      const solicitudesOrdenadas = [...solicitudes].sort((a, b) => a.orden - b.orden);
      
      // Lista de nuevas asignaciones realizadas
      const nuevasAsignaciones = [];
      
      // Copia de las plazas disponibles para trabajar
      const plazasActualizadas = [...availablePlazas];
      
      // Registro de centros ya ocupados para evitar asignar el mismo centro más de una vez
      const centrosOcupados = new Set();
      
      // Conjunto para almacenar los IDs de orden ya procesados (no necesariamente asignados)
      const ordenesProcesados = new Set();
      
      // Mapa para almacenar todas las asignaciones por orden
      const asignacionesPorOrden = new Map();
      
      console.log("Procesando solicitudes en orden de prioridad...");
      console.log(`Total de solicitudes a procesar: ${solicitudesOrdenadas.length}`);
      
      // Primera pasada: Procesar cada solicitud en orden de prioridad (menor a mayor)
      for (const solicitud of solicitudesOrdenadas) {
        const numOrden = solicitud.orden;
        
        // Verificar si este número de orden ya tiene asignación
        const asignacionExistente = assignments.find(a => a.order === numOrden);
        if (asignacionExistente || ordenesProcesados.has(numOrden)) {
          console.log(`Orden ${numOrden} ya tiene asignación o fue procesado. Se omite.`);
          continue;
        }
        
        console.log(`Procesando solicitud para orden ${numOrden} con ${solicitud.centrosIds?.length || 0} centros seleccionados`);
        
        // Verificar si hay centros seleccionados válidos
        if (!solicitud.centrosIds || solicitud.centrosIds.length === 0) {
          console.log(`Orden ${numOrden} no tiene centros seleccionados válidos.`);
          ordenesProcesados.add(numOrden);
          continue;
        }
        
        // Crear un array para almacenar las asignaciones para este orden
        const asignacionesParaEsteOrden = [];
        
        // Verificar cada centro solicitado en orden de preferencia
        for (const centroId of solicitud.centrosIds) {
          // Si el centro ya está ocupado, continuar con el siguiente
          if (centrosOcupados.has(centroId)) {
            console.log(`Centro ${centroId} ya está ocupado. Verificando siguiente preferencia.`);
            continue;
          }
          
          // Buscar el centro solicitado
          const centroBuscado = plazasActualizadas.find(p => p.id === centroId);
          
          if (centroBuscado && centroBuscado.asignadas < centroBuscado.plazas) {
            // Hay plaza disponible en el centro solicitado
            console.log(`Asignando centro ${centroId} (${centroBuscado.centro}) a orden ${numOrden}`);
            
            // Actualizar plazas
            const idx = plazasActualizadas.findIndex(p => p.id === centroId);
            plazasActualizadas[idx] = {
              ...plazasActualizadas[idx],
              asignadas: plazasActualizadas[idx].asignadas + 1
            };
            
            // Crear nueva asignación
            const nuevaAsignacion = {
              order: numOrden,
              id: centroBuscado.id,
              localidad: centroBuscado.localidad,
              centro: centroBuscado.centro,
              municipio: centroBuscado.municipio,
              timestamp: new Date().getTime()
            };
            
            // Guardar la asignación
            asignacionesParaEsteOrden.push(nuevaAsignacion);
            centrosOcupados.add(centroId);
            
            // Si ya no hay más plazas disponibles en este centro, marcarlo como ocupado
            if (plazasActualizadas[idx].asignadas >= plazasActualizadas[idx].plazas) {
              console.log(`Centro ${centroId} ahora está completamente ocupado.`);
            }
          } else {
            console.log(`No hay plazas disponibles en centro ${centroId} o no existe.`);
          }
        }
        
        // Guardar las asignaciones para este orden
        if (asignacionesParaEsteOrden.length > 0) {
          asignacionesPorOrden.set(numOrden, asignacionesParaEsteOrden);
          nuevasAsignaciones.push(...asignacionesParaEsteOrden);
        } else {
          console.log(`No se pudieron asignar centros para el orden ${numOrden}`);
        }
        
        // Marcar este orden como procesado
        ordenesProcesados.add(numOrden);
      }
      
      console.log(`Total de nuevas asignaciones: ${nuevasAsignaciones.length}`);
      console.log(`Órdenes procesados: ${ordenesProcesados.size}`);
      
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
            if (ordenesProcesados.has(solicitud.orden) && solicitud.docId) {
              const solicitudRef = doc(db, "solicitudesPendientes", solicitud.docId);
              await deleteDoc(solicitudRef);
            }
          }
          
          // Encontrar y establecer la asignación para el número de orden actual si existe
          if (orderNumber) {
            const ordenActual = parseInt(orderNumber, 10);
            const misAsignaciones = asignacionesPorOrden.get(ordenActual) || [];
            if (misAsignaciones.length > 0) {
              // Mostrar la primera asignación (generalmente la de mayor preferencia)
              setAssignment(misAsignaciones[0]);
            }
          }
          
          alert(`Procesamiento completado. Se han asignado ${nuevasAsignaciones.length} plazas para ${ordenesProcesados.size} solicitudes.`);
        } catch (error) {
          console.error("Error al actualizar Firebase:", error);
          alert("Error al procesar solicitudes. Inténtelo de nuevo.");
        }
      } else {
        alert("No se han podido realizar nuevas asignaciones. Todas las plazas solicitadas ya están ocupadas o no hay solicitudes pendientes.");
      }
    } finally {
      // Asegurarse de ocultar el loader incluso si hay error
      setTimeout(() => {
        setIsProcessing(false);
      }, 1000);
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
        timestamp: Date.now() // Usar Date.now() es más simple y funciona igual
      };
      
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
      
      // Esperar un momento para que se completen las actualizaciones
      setTimeout(() => {
        // Reiniciar la página para refrescar todos los datos
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error("Error al guardar solicitud:", error);
      // Mostrar error pero mantener el formulario para permitir intentar de nuevo
      alert("Error al guardar la solicitud: " + error.message);
      // Ocultar indicador de carga
      setIsProcessing(false);
    }
    // No ocultamos el indicador de carga porque vamos a recargar la página
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
                  disabled={isProcessing}
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
                    backgroundColor: isProcessing ? '#f5f5f5' : '#fff'
                  }}
                >
                  {availablePlazas
                    .filter(plaza => (plaza.plazas - plaza.asignadas) > 0)
                    .sort((a, b) => a.id - b.id)
                    .map((plaza, index) => (
                      <div key={index} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                        <input
                          type="checkbox"
                          id={`centro-${plaza.id}`}
                          value={plaza.id}
                          checked={centrosSeleccionados.includes(plaza.id)}
                          onChange={handleCentroChange}
                          style={{ marginRight: '8px' }}
                          disabled={isProcessing}
                        />
                        <label htmlFor={`centro-${plaza.id}`} style={{ fontSize: '14px', cursor: isProcessing ? 'default' : 'pointer' }}>
                          {plaza.id}. <strong>{plaza.centro}</strong> - {plaza.localidad} ({plaza.municipio}) 
                          {plaza.plazas > 1 && ` - ${plaza.plazas - plaza.asignadas} plaza${(plaza.plazas - plaza.asignadas) !== 1 ? 's' : ''} disponible${(plaza.plazas - plaza.asignadas) !== 1 ? 's' : ''}`}
                        </label>
                      </div>
                    ))}
                </div>
              </div>
              
              <button 
                type="submit" 
                disabled={isProcessing}
                style={{ 
                  padding: '10px', 
                  backgroundColor: isProcessing ? '#cccccc' : '#4CAF50', 
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
  const [isProcessing, setIsProcessing] = useState(false);
  
  const handleProcesar = async () => {
    setIsProcessing(true);
    await procesarSolicitudes();
    setTimeout(() => setIsProcessing(false), 1000);
  };
  
  if (!solicitudes.length) return null;
  
  // Ordenar solicitudes por número de orden
  const solicitudesOrdenadas = [...solicitudes].sort((a, b) => a.orden - b.orden);
  
  return (
    <div style={{ marginTop: '30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2>Solicitudes Pendientes</h2>
        <button 
          onClick={handleProcesar}
          disabled={isProcessing} 
          style={{ 
            padding: '8px 16px', 
            backgroundColor: isProcessing ? '#FFB74D' : '#FF9800', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          {isProcessing && (
            <span 
              style={{ 
                display: 'inline-block', 
                width: '16px', 
                height: '16px', 
                border: '2px solid rgba(255,255,255,0.3)', 
                borderRadius: '50%', 
                borderTopColor: 'white', 
                animation: 'spin 1s ease-in-out infinite',
                marginRight: '8px'
              }} 
            />
          )}
          {isProcessing ? 'Procesando...' : 'Procesar Solicitudes'}
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
              const centrosSolicitados = (solicitud.centrosIds || [])
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
      <h2>Estado de las Plazas</h2>
      
      <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
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
              width: '300px'
            }}
          />
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
              borderRadius: '4px',
              marginLeft: '10px'
            }}
          >
            <option value={25}>25 por página</option>
            <option value={50}>50 por página</option>
            <option value={100}>100 por página</option>
            <option value={filteredPlazas.length}>Ver todos</option>
          </select>
        </div>
      </div>
      
      <div style={{ marginBottom: '10px', fontSize: '14px' }}>
        Mostrando {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, filteredPlazas.length)} de {filteredPlazas.length} centros
        {searchTerm && ` (filtrados de ${plazasOrdenadas.length})`}
      </div>
      
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
              <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>{filteredPlazas.reduce((sum, p) => sum + p.plazas, 0)}</td>
              <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>{filteredPlazas.reduce((sum, p) => sum + p.asignadas, 0)}</td>
              <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}>{filteredPlazas.reduce((sum, p) => sum + (p.plazas - p.asignadas), 0)}</td>
              <td style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'center' }}></td>
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
              <th style={{ border: '1px solid #ddd', padding: '10px', textAlign: 'left' }}>Plazas Asignadas</th>
            </tr>
          </thead>
          <tbody>
            {ordenesOrdenados.map((orden, index) => {
              const asignacionesDeEsteOrden = asignacionesPorOrden[orden];
              
              return (
                <tr key={index} style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9' }}>
                  <td style={{ border: '1px solid #ddd', padding: '10px', fontWeight: 'bold' }}>
                    {orden}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '10px' }}>
                    <ol style={{ margin: 0, paddingLeft: '20px' }}>
                      {asignacionesDeEsteOrden.map((asignacion, idx) => (
                        <li key={idx} style={{ marginBottom: '5px' }}>
                          <strong>{asignacion.centro}</strong> - {asignacion.localidad} ({asignacion.municipio})
                        </li>
                      ))}
                    </ol>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666', fontStyle: 'italic', textAlign: 'center' }}>
        Resumen: {assignments.length} plazas asignadas para {ordenesOrdenados.length} solicitantes
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
