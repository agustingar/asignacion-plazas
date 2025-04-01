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
export const procesarSolicitud = async (solicitud, availablePlazas, assignments, db, solicitudes = []) => {
  try {
    const { orden, centrosIds, docId: solicitudDocId } = solicitud;
    
    // Comprobar si ya existe una asignación para este orden
    const asignacionExistente = assignments.find(a => a.order === orden);
    if (asignacionExistente) {
      console.log(`El orden ${orden} ya tiene una asignación en ${asignacionExistente.centro}`);
      return { 
        success: true, 
        message: `El orden ${orden} ya tiene una asignación en ${asignacionExistente.centro}`,
        yaAsignado: true 
      };
    }
    
    // Crear mapa para acceso rápido a las plazas
    const plazasMap = {};
    availablePlazas.forEach(plaza => {
      plazasMap[plaza.id] = { ...plaza };
    });
    
    // Variable para saber si ya se asignó una plaza
    let asignado = false;
    
    // Recorrer los centros en orden de preferencia
    for (const centroId of centrosIds) {
      const centro = plazasMap[centroId];
      if (!centro) {
        console.warn(`Centro con ID ${centroId} no encontrado para orden ${orden}`);
        continue;
      }
      
      // Verificar disponibilidad
      const disponibles = centro.plazas - (centro.asignadas || 0);
      
      if (disponibles > 0) {
        // Hay plazas disponibles, asignar directamente
        const asignacionId = await asignarPlaza(orden, centroId, centro, solicitudDocId, centrosIds);
        console.log(`✅ Asignación directa completada: Orden ${orden} → ${centro.centro} (plazas disponibles)`);
        
        asignado = true;
        return {
          success: true,
          message: `Plaza asignada para orden ${orden} en ${centro.centro}`,
          desplazado: false,
          asignacionId
        };
      } else {
        // NO hay plazas disponibles, verificar si podemos desplazar a alguien con mayor número de orden
        // Buscar todas las asignaciones actuales para este centro
        const asignacionesCentro = assignments.filter(a => a.id === centroId);
        
        if (asignacionesCentro.length === 0) {
          console.warn(`No se encontraron asignaciones para el centro ${centro.centro} aunque figura como completo`);
          continue;
        }
        
        // Obtener todas las asignaciones ordenadas por número de orden (mayor primero = menor prioridad)
        const asignacionesOrdenadas = [...asignacionesCentro].sort((a, b) => b.order - a.order);
        const asignacionMayorOrden = asignacionesOrdenadas[0];
        
        console.log(`Centro ${centro.centro}: asignaciones existentes ${asignacionesOrdenadas.map(a => a.order).join(', ')}`);
        
        // Verificar si podemos desplazar (si nuestro orden es menor que el mayor orden asignado)
        if (asignacionMayorOrden && asignacionMayorOrden.order > orden) {
          // Encontramos a alguien con menor prioridad, podemos desplazarlo
          console.log(`⚠️ Desplazando: orden ${asignacionMayorOrden.order} (menor prioridad) para asignar ${orden} (mayor prioridad) en ${centro.centro}`);
          
          // Eliminar la asignación anterior
          await deleteDoc(doc(db, "asignaciones", asignacionMayorOrden.docId));
          
          // Asignar la plaza a la nueva solicitud
          const asignacionId = await asignarPlaza(orden, centroId, centro, solicitudDocId, centrosIds);
          
          // Buscar todas las solicitudes originales para tener un historial completo
          // Primero, buscar en la colección de solicitudes históricas
          let solicitudHistorica = null;
          try {
            const historicoSnapshot = await getDocs(collection(db, "historialSolicitudes"));
            solicitudHistorica = historicoSnapshot.docs
              .map(doc => ({ ...doc.data(), docId: doc.id }))
              .find(s => s.orden === asignacionMayorOrden.order);
          } catch (error) {
            console.log("No se pudo buscar en historial de solicitudes:", error.message);
          }
          
          // Buscar en solicitudes pendientes actuales
          const solicitudOriginal = solicitudes.find(s => s.orden === asignacionMayorOrden.order);
          
          let centrosPreferidos;
          if (solicitudOriginal) {
            // Si encontramos la solicitud original, usamos sus centros preferidos
            centrosPreferidos = solicitudOriginal.centrosIds;
            console.log(`Encontrada solicitud original para orden ${asignacionMayorOrden.order} con ${centrosPreferidos.length} centros preferidos`);
          } else if (solicitudHistorica) {
            // Si encontramos en el historial, usamos esos centros
            centrosPreferidos = solicitudHistorica.centrosIds;
            console.log(`Encontrada solicitud histórica para orden ${asignacionMayorOrden.order} con ${centrosPreferidos.length} centros preferidos`);
          } else {
            // Si no encontramos la solicitud, creamos una con este centro
            console.log(`No se encontró solicitud para orden ${asignacionMayorOrden.order}, usando solo el centro actual`);
            centrosPreferidos = [centroId];
          }
          
          // Asegurarnos que el centro actual esté incluido (por si acaso)
          if (!centrosPreferidos.includes(centroId)) {
            centrosPreferidos.push(centroId);
          }
          
          // Crear una nueva solicitud pendiente para la persona desplazada
          const solicitudNueva = {
            orden: asignacionMayorOrden.order,
            centrosIds: centrosPreferidos,
            timestamp: Date.now(),
            desplazadoPor: orden // Guardar quién lo desplazó para seguimiento
          };
          
          // Guardar en solicitudes pendientes
          const docRef = await addDoc(collection(db, "solicitudesPendientes"), solicitudNueva);
          console.log(`⚠️ Nueva solicitud pendiente creada para el orden desplazado ${asignacionMayorOrden.order}`);
          
          // También guardar una copia en el historial para no perder centros preferidos
          try {
            await addDoc(collection(db, "historialSolicitudes"), {
              ...solicitudNueva,
              fechaHistorico: new Date().toISOString()
            });
          } catch (error) {
            console.log("Error al guardar en historial:", error.message);
          }
          
          asignado = true;
          return {
            success: true,
            message: `Plaza reasignada para orden ${orden} en ${centro.centro}, desplazando a orden ${asignacionMayorOrden.order}`,
            desplazado: true,
            ordenDesplazado: asignacionMayorOrden.order,
            asignacionId
          };
        } else {
          console.log(`No se puede desplazar en ${centro.centro}: la orden ${orden} tiene menor prioridad que las existentes`);
        }
      }
    }
    
    if (!asignado) {
      console.log(`⚠️ No se pudo asignar plaza para orden ${orden}. Todos sus centros preferidos están completos con solicitantes de mayor prioridad.`);
      return {
        success: false,
        message: `No se pudo asignar plaza para orden ${orden}. Todos sus centros preferidos están ocupados por solicitantes con menor número de orden (mayor prioridad). Puedes probar con otros centros o esperar a que se liberen plazas.`
      };
    }
  } catch (error) {
    console.error("Error al procesar solicitud:", error);
    return {
      success: false,
      error: error.message,
      message: "Error al procesar solicitud: " + error.message
    };
  }
  
  // Función interna para asignar plaza
  async function asignarPlaza(orden, centroId, centro, solicitudDocId, centrosPreferidos) {
    // Crear la asignación
    const nuevaAsignacion = {
      order: orden,
      id: centroId,
      localidad: centro.localidad || centro.municipio,
      centro: centro.centro,
      municipio: centro.municipio,
      timestamp: Date.now()
    };
    
    // Guardar en Firebase
    const asignacionRef = await addDoc(collection(db, "asignaciones"), nuevaAsignacion);
    
    // Incrementar el contador de plazas asignadas
    const nuevasAsignadas = (centro.asignadas || 0) + 1;
    await updateDoc(doc(db, "centros", centro.docId), {
      asignadas: nuevasAsignadas
    });
    
    // Eliminar la solicitud procesada de solicitudes pendientes
    if (solicitudDocId) {
      await deleteDoc(doc(db, "solicitudesPendientes", solicitudDocId));
    }
    
    // Guardar también en historial de solicitudes para mantener registro
    try {
      await addDoc(collection(db, "historialSolicitudes"), {
        orden,
        centrosIds: centrosPreferidos,
        centroAsignado: centroId,
        timestamp: Date.now(),
        fechaHistorico: new Date().toISOString()
      });
    } catch (error) {
      console.log("Error al guardar en historial:", error.message);
    }
    
    console.log(`✅ Plaza asignada: Orden ${orden} → ${centro.centro}`);
    
    return asignacionRef.id;
  }
};