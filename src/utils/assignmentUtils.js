import { collection, doc, setDoc, updateDoc, getDocs, query, deleteDoc, addDoc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "./firebaseConfig";

/**
 * Procesa las solicitudes pendientes y asigna plazas según orden de prioridad
 * @param {Array} solicitudes - Lista de solicitudes pendientes
 * @param {Array} assignments - Lista de asignaciones existentes
 * @param {Array} availablePlazas - Lista de plazas disponibles
 * @param {Function} setProcessingMessage - Función para actualizar mensaje de estado
 * @returns {Promise<Object>} - Resultado del procesamiento
 */
export const procesarSolicitudes = async (solicitudes, assignments, availablePlazas, setProcessingMessage) => {
  try {
    // Si no hay solicitudes pendientes, no hacer nada
    if (!solicitudes.length) {
      setProcessingMessage && setProcessingMessage("No hay solicitudes pendientes para procesar");
      return { success: true, message: "No hay solicitudes pendientes para procesar" };
    }
    
    setProcessingMessage && setProcessingMessage("Iniciando procesamiento de solicitudes...");
    
    // Ordenar solicitudes por número de orden (menor primero = mayor prioridad)
    const solicitudesOrdenadas = [...solicitudes].sort((a, b) => a.orden - b.orden);
    
    
    // Crear una copia del estado de las plazas para trabajar
    let plazasActualizadas = [...availablePlazas];
    
    // --- FASE 1: Eliminar todas las asignaciones existentes para reprocesar ---
    setProcessingMessage && setProcessingMessage("Eliminando asignaciones existentes para procesar desde cero...");
    
    // Eliminar todas las asignaciones de Firebase
    for (const asignacion of assignments) {
      if (asignacion.docId) {
        try {
          await deleteDoc(doc(db, "asignaciones", asignacion.docId));
        } catch (error) {
          console.error(`Error al eliminar asignación ${asignacion.docId}:`, error);
        }
      }
    }
    
    // Restablecer contadores de plazas asignadas a cero
    for (let i = 0; i < plazasActualizadas.length; i++) {
      if (plazasActualizadas[i].docId) {
        try {
          await updateDoc(doc(db, "centros", plazasActualizadas[i].docId), {
            asignadas: 0
          });
          
          // Actualizar en memoria
          plazasActualizadas[i] = {
            ...plazasActualizadas[i],
            asignadas: 0
          };
        } catch (error) {
          console.error(`Error al resetear contadores para centro ${plazasActualizadas[i].id}:`, error);
        }
      }
    }
    
    // --- FASE 2: Procesar todas las solicitudes en orden de prioridad ---
    setProcessingMessage && setProcessingMessage(`Procesando ${solicitudesOrdenadas.length} solicitudes en orden de prioridad...`);
    
    let asignacionesNuevas = 0;
    let solicitudesProcesadas = 0;
    
    // Array para almacenar las nuevas asignaciones
    const nuevasAsignaciones = [];
    
    // Mapa de centros para registrar las plazas ocupadas
    const centrosMap = {};
    plazasActualizadas.forEach(plaza => {
      centrosMap[plaza.id] = {
        id: plaza.id,
        plazas: plaza.plazas,
        asignadas: 0,
        docId: plaza.docId,
        centro: plaza.centro,
        localidad: plaza.localidad,
        municipio: plaza.municipio
      };
    });
    
    // Conjunto para controlar órdenes ya procesados y evitar duplicados
    const ordenesYaProcesados = new Set();
    
    // Recorrer todas las solicitudes ordenadas por número de orden
    for (const solicitud of solicitudesOrdenadas) {
      solicitudesProcesadas++;
      
      const { orden, centrosIds } = solicitud;
      
      // Evitar duplicados - si ya procesamos este orden, saltarlo
      if (ordenesYaProcesados.has(orden)) {
        continue;
      }
      
      // Marcar como procesado
      ordenesYaProcesados.add(orden);
      
      // Variable para saber si ya se asignó una plaza a este orden
      let asignado = false;
      
      // Recorrer los centros en orden de preferencia del solicitante
      for (const centroId of centrosIds) {
        // Verificar si el centro existe
        const centro = centrosMap[centroId];
        if (!centro) {
          console.warn(`Centro con ID ${centroId} no encontrado para orden ${orden}`);
          continue;
        }
        
        // Verificar si quedan plazas disponibles en este centro
        if (centro.asignadas < centro.plazas) {
          
          // Verificar si ya existe una asignación para este orden (prevenir duplicados)
          const asignacionExistente = assignments.find(a => a.order === orden);
          if (asignacionExistente) {
            // Ya existe una asignación para este orden, no crear otra
            asignado = true;
            break;
          }
          
          // Usar transacción para verificar y asignar de forma atómica
          try {
            const resultado = await runTransaction(db, async (transaction) => {
              try {
                // Verificar que el centro tenga un docId válido
                if (!centro || !centro.docId) {
                  console.warn(`Centro no encontrado o docId inválido para centro ${centro?.centro || centroId}`);
                  return { 
                    success: false, 
                    message: `Centro con ID ${centroId} no encontrado o no tiene docId válido` 
                  };
                }
                
                // Obtener el estado actual del centro dentro de la transacción
                const centroRef = doc(db, "centros", centro.docId);
                const centroDoc = await transaction.get(centroRef);
                
                if (!centroDoc.exists()) {
                  return { success: false, message: `Centro con ID ${centro.docId} no encontrado` };
                }
                
                const centroData = centroDoc.data();
                const plazasOcupadas = centroData.asignadas || 0;
                const plazasDisponibles = centro.plazas - plazasOcupadas;
                
                if (plazasDisponibles <= 0) {
                  return { success: false, message: `No hay plazas disponibles en ${centro.centro}` };
                }
                
                // Verificar de nuevo que no exista ya una asignación para este orden
                const asignacionesRef = collection(db, "asignaciones");
                const asignacionesQuery = query(asignacionesRef);
                const asignacionesDocs = await transaction.get(asignacionesQuery);
                
                const yaAsignado = asignacionesDocs.docs.some(doc => {
                  const data = doc.data();
                  return data && data.order === solicitud.orden;
                });
                
                if (yaAsignado) {
                  return { success: false, message: `Ya existe asignación para orden ${solicitud.orden}` };
                }
                
                // Crear la asignación
                const asignacionData = {
                  order: solicitud.orden,
                  id: centroId,
                  centro: centro.centro,
                  municipio: centro.municipio,
                  localidad: centro.localidad,
                  timestamp: Date.now()
                };
                
                // Crear un nuevo documento para la asignación
                const nuevaAsignacionRef = doc(collection(db, "asignaciones"));
                
                // Crear la asignación primero
                transaction.set(nuevaAsignacionRef, asignacionData);
                
                // Luego actualizar el contador del centro
                transaction.update(centroRef, {
                  asignadas: plazasOcupadas + 1
                });
                
                return { 
                  success: true, 
                  message: `Asignación exitosa en ${centro.centro}`,
                  docId: nuevaAsignacionRef.id,
                  asignacionData
                };
              } catch (transactionError) {
                console.error(`Error en transacción interna para orden ${solicitud.orden}:`, transactionError);
                return { 
                  success: false,
                  message: `Error durante la transacción: ${transactionError.message}` 
                };
              }
            });
            
            if (resultado.success) {
              // Incrementar contador de plazas asignadas para este centro
              centro.asignadas++;
              
              // Añadir a las nuevas asignaciones
              const asignacionConId = { 
                ...resultado.asignacionData, 
                docId: resultado.docId 
              };
              
              nuevasAsignaciones.push(asignacionConId);
              asignacionesNuevas++;
              asignado = true;
              
              // Salir del bucle de centros una vez asignada la plaza
              break;
            } else if (resultado.message.includes("Ya existe asignación")) {
              // Ya asignado por otro proceso, marcar como completado
              asignado = true;
              break;
            }
            // Si hay otros errores, continuar con el siguiente centro
          } catch (error) {
            console.error(`Error en transacción para orden ${orden} en centro ${centro.centro}:`, error);
            // Continuar con el siguiente centro
          }
        } else {
          // No hay plazas disponibles en este centro, continuar con el siguiente
        }
      }
      
      // Actualizar mensaje de procesamiento cada cierto número de solicitudes
      if (solicitudesProcesadas % 5 === 0 || solicitudesProcesadas === solicitudesOrdenadas.length) {
        setProcessingMessage && setProcessingMessage(
          `Procesando solicitudes... ${solicitudesProcesadas}/${solicitudesOrdenadas.length} (${asignacionesNuevas} asignaciones realizadas)`
        );
      }
    }
    
    // Actualizar en memoria todas las plazas con los nuevos contadores
    plazasActualizadas = plazasActualizadas.map(plaza => {
      const centroDatos = centrosMap[plaza.id];
      return {
        ...plaza,
        asignadas: centroDatos ? centroDatos.asignadas : plaza.asignadas
      };
    });
    
    setProcessingMessage && setProcessingMessage(
      `Procesamiento completado. ${solicitudesProcesadas} solicitudes procesadas. ${asignacionesNuevas} asignaciones realizadas.`
    );
    
    return {
      success: true,
      plazasActualizadas,
      asignacionesNuevas,
      message: `Procesamiento completado. ${solicitudesProcesadas} solicitudes procesadas. ${asignacionesNuevas} asignaciones realizadas.`
    };
  } catch (error) {
    console.error("Error al procesar solicitudes:", error);
    setProcessingMessage && setProcessingMessage("Error al procesar solicitudes: " + error.message);
    return {
      success: false,
      error: error.message,
      message: "Error al procesar solicitudes: " + error.message
    };
  }
};

/**
 * Función para borrar una asignación y actualizar plazas
 * @param {Object} asignacion - Datos de la asignación a borrar
 * @param {string} docId - ID del documento de asignación
 * @param {Array} availablePlazas - Lista de plazas disponibles
 * @returns {Promise<Object>} - Resultado de la operación
 */
export const borrarAsignacion = async (asignacion, docId, availablePlazas) => {
  try {
    if (!docId) {
      return { success: false, message: "No se proporcionó ID de asignación" };
    }
    
    // Borrar el documento de asignación
    await deleteDoc(doc(db, "asignaciones", docId));
    
    // Actualizar el contador de plazas asignadas
    const centroIndex = availablePlazas.findIndex(p => p.id === asignacion.id);
    
    if (centroIndex >= 0 && availablePlazas[centroIndex].docId) {
      const centro = availablePlazas[centroIndex];
      const nuevaCantidadAsignadas = Math.max(0, centro.asignadas - 1);
      
      // Actualizar el centro en Firebase
      await updateDoc(doc(db, "centros", centro.docId), {
        asignadas: nuevaCantidadAsignadas
      });
      
      // Crear copia actualizada para devolver
      const plazasActualizadas = [...availablePlazas];
      plazasActualizadas[centroIndex] = {
        ...plazasActualizadas[centroIndex],
        asignadas: nuevaCantidadAsignadas
      };
      
      return {
        success: true,
        plazasActualizadas,
        message: "Asignación eliminada correctamente"
      };
    }
    
    return { success: true, message: "Asignación eliminada" };
  } catch (error) {
    console.error("Error al borrar asignación:", error);
    return {
      success: false,
      error: error.message,
      message: "Error al borrar asignación: " + error.message
    };
  }
};

/**
 * Procesa una única solicitud pendiente e intenta asignar una plaza
 * @param {Object} solicitud - La solicitud a procesar
 * @param {Array} availablePlazas - Lista de plazas disponibles
 * @param {Array} assignments - Lista de asignaciones existentes
 * @param {Object} db - Referencia a la base de datos Firestore
 * @param {Array} solicitudes - Lista completa de solicitudes pendientes
 * @returns {Promise<Object>} - Resultado del procesamiento
 */
export const procesarSolicitud = async (solicitud, availablePlazas, assignments, db, todasLasSolicitudes) => {
  try {
    // Validar que la solicitud sea un objeto válido
    if (!solicitud || typeof solicitud !== 'object') {
      console.error('La solicitud no es un objeto válido:', solicitud);
      return {
        success: false,
        message: `Error: La solicitud no es válida`
      };
    }

    // Validar que la solicitud contenga un número de orden
    if (solicitud.orden === undefined || solicitud.orden === null) {
      console.error('La solicitud no contiene un número de orden:', solicitud);
      return {
        success: false,
        message: `Error: La solicitud no contiene un número de orden`
      };
    }
    
    // Verificación adicional para prevenir duplicados
    // Consultar directamente a la base de datos para obtener la información más reciente
    const asignacionesQuery = query(collection(db, "asignaciones"));
    const asignacionesSnapshot = await getDocs(asignacionesQuery);
    const asignacionesActuales = asignacionesSnapshot.docs.map(doc => ({
      ...doc.data(),
      docId: doc.id
    }));
    
    // Verificar si la solicitud ya tiene una asignación en la base de datos
    const existingAssignment = asignacionesActuales.find(a => a.order === solicitud.orden);
    if (existingAssignment) {
      
      // Guardar solicitud en el historial antes de eliminarla
      try {
        // Solo si existe docId en la solicitud
        if (solicitud.docId) {
          const historialData = {
            ...solicitud,
            estado: "ASIGNADA",
            centroAsignado: existingAssignment.centro,
            centroId: existingAssignment.id,
            fechaHistorico: new Date().toISOString(),
            timestamp: Date.now()
          };
          
          // Eliminar docId para no duplicarlo
          delete historialData.docId;
          
          // Guardar en historial
          await addDoc(collection(db, "historialSolicitudes"), historialData);
          
          // Eliminar la solicitud pendiente ya que ya está procesada
          await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
        }
      } catch (error) {
        console.error(`Error al procesar historial para solicitud ${solicitud.orden}:`, error);
      }
      
      return {
        success: true,
        message: `La solicitud ${solicitud.orden} ya tiene asignación en ${existingAssignment.centro}`
      };
    }
    
    // Obtener los centros solicitados que con su orden de preferencia
    const centrosSolicitadosIds = solicitud.centrosIds || [];
    
    if (centrosSolicitadosIds.length === 0) {
      return {
        success: false,
        message: `La solicitud ${solicitud.orden} no contiene centros seleccionados.`
      };
    }
    
    // VERIFICACIÓN ADICIONAL para evitar asignaciones duplicadas
    // Verificar nuevamente si se creó una asignación para este orden en otro proceso paralelo
    const asignacionesActualizadas = await getDocs(collection(db, "asignaciones"));
    const nuevasAsignaciones = asignacionesActualizadas.docs.map(doc => ({
      ...doc.data(),
      docId: doc.id
    }));
    
    const asignacionParaEsteOrden = nuevasAsignaciones.find(a => a.order === solicitud.orden);
    if (asignacionParaEsteOrden) {
      
      // Guardar en historial y eliminar de pendientes
      try {
        if (solicitud.docId) {
          const historialData = {
            ...solicitud,
            estado: "ASIGNADA_POR_OTRO_PROCESO",
            centroAsignado: asignacionParaEsteOrden.centro,
            centroId: asignacionParaEsteOrden.id,
            fechaHistorico: new Date().toISOString(),
            timestamp: Date.now()
          };
          
          // Eliminar docId para no duplicarlo
          delete historialData.docId;
          
          // Guardar en historial
          await addDoc(collection(db, "historialSolicitudes"), historialData);
          
          // Eliminar la solicitud pendiente
          await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
        }
      } catch (error) {
        console.error(`Error al procesar solicitud ${solicitud.orden} ya asignada por otro proceso:`, error);
      }
      
      return {
        success: true,
        message: `La solicitud ${solicitud.orden} ya fue asignada a ${asignacionParaEsteOrden.centro} por otro proceso`
      };
    }
    
    // Recorrer los centros solicitados para intentar asignar uno
    for (const centroId of centrosSolicitadosIds) {
      // Buscar el centro en la lista de centros disponibles
      const centroIndex = availablePlazas.findIndex(p => p.id === centroId);
      if (centroIndex === -1) continue;
      
      const centro = availablePlazas[centroIndex];
      
      // Verificar que el centro sea válido
      if (!centro || !centro.docId) {
        console.warn(`Centro no encontrado o docId inválido para centro ID ${centroId}`);
        continue; // Probar con el siguiente centro
      }
      
      // Evaluando centro para asignar
      try {
        const resultado = await runTransaction(db, async (transaction) => {
          try {
            // Obtener el estado actual del centro dentro de la transacción
            const centroRef = doc(db, "centros", centro.docId);
            const centroDoc = await transaction.get(centroRef);
            
            if (!centroDoc.exists()) {
              return { success: false, message: `Centro con ID ${centro.docId} no encontrado` };
            }
            
            const centroData = centroDoc.data();
            const plazasOcupadas = centroData.asignadas || 0;
            const plazasDisponibles = centro.plazas - plazasOcupadas;
            
            if (plazasDisponibles <= 0) {
              return { success: false, message: `No hay plazas disponibles en ${centro.centro}` };
            }
            
            // Verificar nuevamente que no exista asignación
            const asignacionesRef = collection(db, "asignaciones");
            const asignacionesQuery = query(asignacionesRef);
            const asignacionesDocs = await transaction.get(asignacionesQuery);
            
            let yaAsignado = false;
            asignacionesDocs.forEach(doc => {
              const data = doc.data();
              if (data && data.order === solicitud.orden) {
                yaAsignado = true;
              }
            });
            
            if (yaAsignado) {
              return { success: false, message: `Ya existe asignación para orden ${solicitud.orden}` };
            }
            
            // Crear la asignación
            const asignacionData = {
              order: solicitud.orden,
              id: centroId,
              centro: centro.centro,
              municipio: centro.municipio,
              localidad: centro.localidad,
              timestamp: Date.now()
            };
            
            // Crear la nueva asignación de forma segura
            const asignacionesCol = collection(db, "asignaciones");
            const nuevaAsignacionRef = doc(asignacionesCol);
            
            // Crear la asignación primero
            transaction.set(nuevaAsignacionRef, asignacionData);
            
            // Luego actualizar el contador del centro
            transaction.update(centroRef, {
              asignadas: plazasOcupadas + 1
            });
            
            return { 
              success: true, 
              message: `Asignación exitosa en ${centro.centro}`,
              docId: nuevaAsignacionRef.id,
              asignacionData
            };
          } catch (transactionError) {
            console.error(`Error en transacción interna para orden ${solicitud.orden}:`, transactionError);
            return { 
              success: false,
              message: `Error durante la transacción: ${transactionError.message}` 
            };
          }
        });
        
        if (resultado.success) {
          // Actualizar memoria local
          availablePlazas[centroIndex] = {
            ...availablePlazas[centroIndex],
            asignadas: (availablePlazas[centroIndex].asignadas || 0) + 1
          };
          
          // Solo proceder si la solicitud tiene un docId válido
          if (solicitud.docId) {
            // Guardar en historial
            const historialSolicitudActual = {
              ...solicitud,
              estado: "ASIGNADA",
              centroAsignado: centro.centro,
              centroId: centroId,
              fechaHistorico: new Date().toISOString(),
              timestamp: Date.now()
            };
            
            // Eliminar docId para no duplicarlo
            delete historialSolicitudActual.docId;
            
            // Guardar en historial de forma atómica también
            await addDoc(collection(db, "historialSolicitudes"), historialSolicitudActual);
            
            // Eliminar la solicitud pendiente
            await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
          }
          
          return {
            success: true,
            message: `Solicitud ${solicitud.orden} asignada exitosamente al centro ${centro.centro}`,
            plazasActualizadas: availablePlazas
          };
        } else if (resultado.message.includes("No hay plazas disponibles")) {
          // Continuar con el siguiente centro
          continue;
        } else {
          // Si ya está asignado o hay otro error, terminar el procesamiento
          return {
            success: false,
            message: resultado.message
          };
        }
      } catch (error) {
        console.error(`Error en transacción para orden ${solicitud.orden} en centro ${centro.centro}:`, error);
        continue; // Intentar con el siguiente centro
      }
    }
    
    // Si llegamos aquí, es porque no se pudo asignar a ningún centro
    // Incrementar contador de intentos fallidos
    const intentosFallidos = (solicitud.intentosFallidos || 0) + 1;
    
    // Verificar si todos los centros no tienen plazas
    const plazasDisponiblesMap = {};
    let ningunCentroConPlazas = true;
    
    // Revisar cada centro seleccionado para ver si hay plazas disponibles
    for (const centroId of centrosSolicitadosIds) {
      const centro = availablePlazas.find(p => p.id === centroId);
      if (centro) {
        const plazasDisponibles = centro.plazas - (centro.asignadas || 0);
        plazasDisponiblesMap[centroId] = {
          nombre: centro.centro,
          plazasDisponibles: plazasDisponibles
        };
        
        if (plazasDisponibles > 0) {
          ningunCentroConPlazas = false;
        }
      }
    }
    
    // Actualizar la solicitud con los intentos fallidos y motivo, solo si tiene docId
    if (solicitud.docId) {
      try {
        const solicitudRef = doc(db, "solicitudesPendientes", solicitud.docId);
        await updateDoc(solicitudRef, {
          intentosFallidos: intentosFallidos,
          ultimoIntentoFallido: Date.now(),
          estadoAsignacion: ningunCentroConPlazas ? "SIN_PLAZAS_DISPONIBLES" : "FALLO_ASIGNACION",
          detalleDisponibilidad: plazasDisponiblesMap
        });
      } catch (error) {
        console.error(`Error al actualizar solicitud ${solicitud.orden} tras intento fallido:`, error);
      }
    }
    
    return {
      success: false,
      message: ningunCentroConPlazas 
        ? `No se pudo asignar la solicitud ${solicitud.orden}. No hay plazas disponibles en ninguno de los centros seleccionados.` 
        : `No se pudo asignar la solicitud ${solicitud.orden} en este intento.`,
      plazasDisponiblesMap: plazasDisponiblesMap,
      ningunCentroConPlazas: ningunCentroConPlazas
    };
  } catch (error) {
    console.error(`Error al procesar solicitud ${solicitud?.orden || 'desconocida'}:`, error);
    return {
      success: false,
      message: `Error al procesar: ${error.message}`
    };
  }
};

/**
 * Reinicia y recalcula todos los contadores de asignaciones basado en las asignaciones existentes
 * @param {Array} centros - Lista de centros disponibles
 * @param {Array} asignaciones - Lista de asignaciones existentes
 * @param {Object} db - Referencia a la base de datos Firestore
 * @returns {Promise<Object>} - Resultado de la operación
 */
export const resetearContadoresAsignaciones = async (centros, asignaciones, db) => {
  try {
    
    // 1. Primero resetear todos los contadores a cero
    
    for (const centro of centros) {
      if (centro.docId) {
        try {
          await updateDoc(doc(db, "centros", centro.docId), {
            asignadas: 0
          });
        } catch (error) {
          console.error(`Error al resetear contador para centro ${centro.centro}:`, error);
        }
      }
    }
    
    // 2. Construir mapa de conteo por centroId
    const contadoresPorCentro = {};
    
    // Contar asignaciones actuales
    for (const asignacion of asignaciones) {
      const centroId = asignacion.centroId || asignacion.id; // Asegurarnos de obtener el ID correcto
      
      if (centroId) {
        if (!contadoresPorCentro[centroId]) {
          contadoresPorCentro[centroId] = 1;
        } else {
          contadoresPorCentro[centroId]++;
        }
      }
    }
    
    
    // 3. Actualizar contadores en la base de datos con los valores recalculados
    let actualizados = 0;
    let errores = 0;
    
    for (const centro of centros) {
      const centroId = centro.id;
      
      if (centroId && contadoresPorCentro[centroId] && centro.docId) {
        const nuevoContador = contadoresPorCentro[centroId];
        
        try {
          // Actualizar el contador en la base de datos
          await updateDoc(doc(db, "centros", centro.docId), {
            asignadas: nuevoContador
          });
          
          actualizados++;
        } catch (error) {
          console.error(`Error al actualizar contador para centro ${centro.centro}:`, error);
          errores++;
        }
      }
    }
    
    
    return {
      success: true,
      actualizados,
      errores,
      message: `Contadores de asignaciones reiniciados y recalculados correctamente. ${actualizados} centros actualizados.`
    };
  } catch (error) {
    console.error("Error al resetear contadores de asignaciones:", error);
    return {
      success: false,
      error: error.message,
      message: "Error al resetear contadores de asignaciones: " + error.message
    };
  }
};