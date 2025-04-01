import { collection, doc, setDoc, updateDoc, getDocs, query, deleteDoc, addDoc } from "firebase/firestore";
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
    
    console.log("Procesando solicitudes ordenadas por número de orden:", solicitudesOrdenadas);
    
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
    
    // Recorrer todas las solicitudes ordenadas por número de orden
    for (const solicitud of solicitudesOrdenadas) {
      solicitudesProcesadas++;
      
      const { orden, centrosIds } = solicitud;
      console.log(`Procesando solicitud para orden ${orden} con centros preferidos: ${centrosIds.join(', ')}`);
      
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
          console.log(`Encontrada plaza disponible en centro ${centro.centro} (${centro.asignadas}/${centro.plazas}) para orden ${orden}`);
          
          // Crear la asignación
          const nuevaAsignacion = {
            order: orden,
            id: centroId,
            localidad: centro.localidad,
            centro: centro.centro,
            municipio: centro.municipio,
            timestamp: Date.now()
          };
          
          try {
            // Guardar en Firebase
            const asignacionRef = await addDoc(collection(db, "asignaciones"), nuevaAsignacion);
            nuevaAsignacion.docId = asignacionRef.id;
            
            // Incrementar contador de plazas asignadas para este centro
            centro.asignadas++;
            
            // Actualizar en Firebase
            await updateDoc(doc(db, "centros", centro.docId), {
              asignadas: centro.asignadas
            });
            
            // Añadir a las nuevas asignaciones
            nuevasAsignaciones.push(nuevaAsignacion);
            asignacionesNuevas++;
            asignado = true;
            
            console.log(`✅ Asignación exitosa: Orden ${orden} asignado a centro ${centro.centro} (preferencia ${centrosIds.indexOf(centroId) + 1})`);
            
            // Salir del bucle de centros una vez asignada la plaza
            break;
          } catch (error) {
            console.error(`Error al crear asignación para orden ${orden} en centro ${centro.centro}:`, error);
          }
        } else {
          console.log(`Centro ${centro.centro} sin plazas disponibles (${centro.asignadas}/${centro.plazas}) para orden ${orden}`);
        }
      }
      
      if (!asignado) {
        console.log(`⚠️ No se pudo asignar plaza para orden ${orden}. Todos sus centros preferidos están completos con solicitantes de mayor prioridad.`);
        return {
          success: false,
          message: `No se pudo asignar plaza para orden ${orden}. Todos sus centros preferidos están ocupados por solicitantes con menor número de orden (mayor prioridad). Puedes probar con otros centros o esperar a que se liberen plazas.`
        };
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
    // Verificar si la solicitud ya fue procesada y tiene una asignación
    const existingAssignment = assignments.find(a => a.order === solicitud.orden);
    if (existingAssignment) {
      console.log(`La solicitud ${solicitud.orden} ya tiene una plaza asignada en: ${existingAssignment.centro}`);
      
      // Guardar solicitud en el historial antes de eliminarla
      try {
        const historialData = {
          ...solicitud,
          estado: "ASIGNADA",
          centroAsignado: existingAssignment.centro,
          centroId: existingAssignment.centroId,
          fechaHistorico: new Date().toISOString(),
          timestamp: Date.now()
        };
        
        // Eliminar docId para no duplicarlo
        delete historialData.docId;
        
        // Guardar en historial
        await addDoc(collection(db, "historialSolicitudes"), historialData);
        console.log(`Solicitud ${solicitud.orden} guardada en historial`);
        
        // Eliminar la solicitud pendiente ya que ya está procesada
        const docRef = doc(db, "solicitudesPendientes", solicitud.docId);
        await deleteDoc(docRef);
        console.log(`Solicitud ${solicitud.orden} eliminada de pendientes porque ya tiene asignación`);
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
      console.log(`La solicitud ${solicitud.orden} no tiene centros seleccionados.`);
      return {
        success: false,
        message: `La solicitud ${solicitud.orden} no contiene centros seleccionados.`
      };
    }
    
    console.log(`Procesando solicitud para orden ${solicitud.orden} con prioridad de centros: ${centrosSolicitadosIds.join(', ')}`);
    
    // Verificar cada centro solicitado en orden de preferencia
    for (const centroId of centrosSolicitadosIds) {
      // Buscar el centro en las plazas disponibles
      const centro = availablePlazas.find(c => c.id === centroId);
      
      if (!centro) {
        console.warn(`El centro con ID ${centroId} no existe para la solicitud ${solicitud.orden}`);
        continue;
      }
      
      console.log(`Evaluando centro ${centro.centro} para orden ${solicitud.orden}...`);
      
      // Comprobar si hay plazas disponibles directamente
      const plazasDisponibles = centro.plazas - (centro.asignadas || 0);
      
      if (plazasDisponibles > 0) {
        // Hay plazas disponibles - asignar directamente
        console.log(`✅ Hay ${plazasDisponibles} plazas disponibles en ${centro.centro} para orden ${solicitud.orden}`);
        
        // Crear la asignación
        const asignacionData = {
          order: solicitud.orden,
          centroId: centro.id,
          centro: centro.centro,
          municipio: centro.municipio,
          codigo: centro.codigo,
          timestamp: Date.now()
        };
        
        // Guardar la asignación en la colección "asignaciones"
        const docRef = await addDoc(collection(db, "asignaciones"), asignacionData);
        console.log(`Asignación directa creada con ID: ${docRef.id}`);
        
        // Actualizar el contador de plazas asignadas en el centro
        const centroRef = doc(db, "centros", centro.docId);
        await updateDoc(centroRef, {
          asignadas: (centro.asignadas || 0) + 1
        });
        
        // Guardar la solicitud en el historial antes de eliminarla
        try {
          const historialData = {
            ...solicitud,
            centroAsignado: centro.centro,
            centroId: centro.id,
            estado: "ASIGNADA",
            fechaHistorico: new Date().toISOString(),
            timestamp: Date.now()
          };
          
          // Eliminar docId para no duplicarlo
          delete historialData.docId;
          
          // Guardar en historial
          await addDoc(collection(db, "historialSolicitudes"), historialData);
          console.log(`Solicitud ${solicitud.orden} guardada en historial con asignación a ${centro.centro}`);
        } catch (error) {
          console.error(`Error al guardar historial para solicitud ${solicitud.orden}:`, error);
        }
        
        // Eliminar la solicitud de las pendientes
        await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
        
        return {
          success: true,
          message: `Plaza asignada en ${centro.centro} para orden ${solicitud.orden}`
        };
      } else {
        // No hay plazas disponibles - verificar si podemos desplazar a alguien
        console.log(`⚠️ No hay plazas disponibles en ${centro.centro} para orden ${solicitud.orden}. Verificando si se puede reasignar...`);
        
        // Buscar todas las asignaciones para este centro
        const asignacionesCentro = assignments.filter(a => a.centroId === centro.id);
        
        if (asignacionesCentro.length === 0) {
          console.log(`No hay asignaciones registradas para el centro ${centro.centro}`);
          continue; // Probar con el siguiente centro preferido
        }
        
        // Buscar asignaciones con número de orden mayor (menor prioridad)
        const asignacionesMenorPrioridad = asignacionesCentro.filter(a => a.order > solicitud.orden);
        
        if (asignacionesMenorPrioridad.length === 0) {
          console.log(`No hay asignaciones de menor prioridad en ${centro.centro} para desplazar`);
          continue; // Probar con el siguiente centro preferido
        }
        
        // Ordenar por número de orden descendente (mayor número = menor prioridad)
        const asignacionesOrdenadas = [...asignacionesMenorPrioridad].sort((a, b) => b.order - a.order);
        const asignacionADesplazar = asignacionesOrdenadas[0]; // La de menor prioridad
        
        console.log(`🔄 Desplazando orden ${asignacionADesplazar.order} (prioridad menor) para asignar orden ${solicitud.orden} (prioridad mayor) en ${centro.centro}`);
        
        try {
          // 1. Buscar primero si hay datos en historial de la persona a desplazar
          let centrosPreferidos = [];
          try {
            // Buscar en historial
            const queryHistorial = await getDocs(collection(db, "historialSolicitudes"));
            const historialesSolicitud = queryHistorial.docs
              .map(doc => ({ ...doc.data() }))
              .filter(h => h.orden === asignacionADesplazar.order);
            
            if (historialesSolicitud.length > 0) {
              // Usar el historial más reciente
              const historialMasReciente = historialesSolicitud.sort((a, b) => b.timestamp - a.timestamp)[0];
              centrosPreferidos = historialMasReciente.centrosIds || [];
              console.log(`Encontrados ${centrosPreferidos.length} centros preferidos del historial para orden ${asignacionADesplazar.order}`);
            }
          } catch (error) {
            console.error(`Error al buscar historial para orden ${asignacionADesplazar.order}:`, error);
          }
          
          // Buscar también en solicitudes pendientes actuales
          const solicitudDesplazada = todasLasSolicitudes.find(s => s.orden === asignacionADesplazar.order);
          if (solicitudDesplazada && solicitudDesplazada.centrosIds) {
            centrosPreferidos = solicitudDesplazada.centrosIds;
            console.log(`Encontrados ${centrosPreferidos.length} centros preferidos de solicitud pendiente para orden ${asignacionADesplazar.order}`);
          }
          
          // Si no encontramos centros preferidos, usar al menos el centro actual
          if (centrosPreferidos.length === 0) {
            centrosPreferidos = [centro.id];
            console.log(`No se encontraron preferencias para orden ${asignacionADesplazar.order}, usando centro actual`);
          }
          
          // 2. Eliminar la asignación existente
          if (asignacionADesplazar.docId) {
            await deleteDoc(doc(db, "asignaciones", asignacionADesplazar.docId));
            console.log(`Eliminada asignación anterior de orden ${asignacionADesplazar.order}`);
          }
          
          // 3. Crear la nueva asignación para la solicitud actual
          const asignacionData = {
            order: solicitud.orden,
            centroId: centro.id,
            centro: centro.centro,
            municipio: centro.municipio,
            codigo: centro.codigo,
            timestamp: Date.now()
          };
          
          const docRef = await addDoc(collection(db, "asignaciones"), asignacionData);
          console.log(`Nueva asignación creada con ID: ${docRef.id}`);
          
          // 4. Guardar la solicitud actual en el historial
          const historialSolicitudActual = {
            ...solicitud,
            centroAsignado: centro.centro,
            centroId: centro.id,
            estado: "ASIGNADA",
            fechaHistorico: new Date().toISOString(),
            timestamp: Date.now(),
            desplazoA: asignacionADesplazar.order
          };
          
          // Eliminar docId para no duplicarlo
          delete historialSolicitudActual.docId;
          
          // Guardar en historial
          await addDoc(collection(db, "historialSolicitudes"), historialSolicitudActual);
          console.log(`Solicitud ${solicitud.orden} guardada en historial con asignación mediante desplazamiento`);
          
          // 5. Crear una nueva solicitud pendiente para el orden desplazado
          const nuevaSolicitudPendiente = {
            orden: asignacionADesplazar.order,
            centrosIds: centrosPreferidos,
            timestamp: Date.now(),
            desplazadoPor: solicitud.orden
          };
          
          await addDoc(collection(db, "solicitudesPendientes"), nuevaSolicitudPendiente);
          console.log(`Nueva solicitud pendiente creada para orden ${asignacionADesplazar.order} con ${centrosPreferidos.length} centros preferidos`);
          
          // 6. Guardar también un registro en historial para el desplazado
          const historialDesplazado = {
            ...nuevaSolicitudPendiente,
            estado: "DESPLAZADO",
            centroDesplazado: centro.centro,
            fechaHistorico: new Date().toISOString()
          };
          
          await addDoc(collection(db, "historialSolicitudes"), historialDesplazado);
          console.log(`Registro de desplazamiento guardado en historial para orden ${asignacionADesplazar.order}`);
          
          // 7. Eliminar nuestra solicitud de las pendientes
          await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
          
          return {
            success: true,
            message: `Plaza reasignada en ${centro.centro}. Se desplazó al usuario con orden ${asignacionADesplazar.order} (menor prioridad).`,
            desplazamiento: true,
            ordenDesplazado: asignacionADesplazar.order
          };
        } catch (error) {
          console.error(`Error al realizar el desplazamiento: ${error.message}`);
          // Continuar con el siguiente centro preferido
          continue;
        }
      }
    }
    
    // Si llegamos aquí, no se pudo asignar plaza en ninguno de los centros preferidos
    console.log(`❌ No se pudo asignar plaza para orden ${solicitud.orden} en ninguno de sus centros preferidos`);
    
    // Verificar si es porque todos están ocupados por personas con mayor prioridad
    let todosCentrosOcupadosPorMayorPrioridad = true;
    
    for (const centroId of centrosSolicitadosIds) {
      const centro = availablePlazas.find(c => c.id === centroId);
      if (!centro) continue;
      
      const asignacionesCentro = assignments.filter(a => a.centroId === centro.id);
      const hayAsignacionesMenorPrioridad = asignacionesCentro.some(a => a.order > solicitud.orden);
      
      if (hayAsignacionesMenorPrioridad) {
        todosCentrosOcupadosPorMayorPrioridad = false;
        break;
      }
    }
    
    // En cualquier caso, guardar la solicitud en historial con estado de error o rechazo
    try {
      const historialData = {
        ...solicitud,
        estado: todosCentrosOcupadosPorMayorPrioridad ? "RECHAZADA_ORDEN_MENOR" : "ERROR_PROCESAMIENTO",
        fechaHistorico: new Date().toISOString(),
        timestamp: Date.now(),
        mensaje: todosCentrosOcupadosPorMayorPrioridad ? 
          "Todos los centros ocupados por orden menor" : 
          "Error al procesar la solicitud"
      };
      
      // Eliminar docId para no duplicarlo
      delete historialData.docId;
      
      // Guardar en historial
      await addDoc(collection(db, "historialSolicitudes"), historialData);
      console.log(`Solicitud ${solicitud.orden} guardada en historial con estado de error/rechazo`);
    } catch (error) {
      console.error(`Error al guardar historial para solicitud fallida ${solicitud.orden}:`, error);
    }
    
    if (todosCentrosOcupadosPorMayorPrioridad) {
      return {
        success: false,
        message: `No hay plazas disponibles en los centros solicitados. Las plazas están ocupadas por solicitudes con números de orden menores (mayor prioridad).`,
        razon: "COMPLETO_POR_ORDENES_MENORES"
      };
    } else {
      return {
        success: false,
        message: `No se pudieron procesar las asignaciones en este momento. Por favor, intente nuevamente más tarde.`,
        razon: "ERROR_PROCESAMIENTO"
      };
    }
  } catch (error) {
    console.error(`Error al procesar solicitud ${solicitud.orden}:`, error);
    return {
      success: false,
      message: `Error al procesar: ${error.message}`
    };
  }
};