import { collection, doc, setDoc, updateDoc, getDocs, query, deleteDoc, addDoc, getDoc, runTransaction, where } from "firebase/firestore";
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
          // console.error(`Error al eliminar asignación ${asignacion.docId}:`, error);
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
          // console.error(`Error al resetear contadores para centro ${plazasActualizadas[i].id}:`, error);
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
          // console.warn(`Centro con ID ${centroId} no encontrado para orden ${orden}`);
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
              // Verificar una última vez que no exista duplicado antes de crear (dentro de la transacción)
              const asignacionesRef = collection(db, "asignaciones");
              const asignacionesQuery = query(asignacionesRef);
              const asignacionesDocs = await transaction.get(asignacionesQuery);
              
              const yaExisteAsignacion = asignacionesDocs.docs.some(doc => doc.data().order === orden);
              if (yaExisteAsignacion) {
                return { success: false, message: `Ya existe asignación para orden ${orden}` };
              }
              
              // Obtener el estado actual del centro dentro de la transacción
              const centroRef = doc(db, "centros", centro.docId);
              const centroDoc = await transaction.get(centroRef);
              
              if (!centroDoc.exists()) {
                return { success: false, message: `Centro con ID ${centro.docId} no encontrado` };
              }
              
              const centroData = centroDoc.data();
              const plazasOcupadas = centroData.asignadas || 0;
              
              // Verificar si aún hay plazas disponibles (por si cambiaron durante el procesamiento)
              if (plazasOcupadas >= centro.plazas) {
                return { success: false, message: `No hay plazas disponibles en ${centro.centro}` };
              }
              
              // Crear la asignación
              const nuevaAsignacion = {
                order: orden,
                id: centroId,
                localidad: centro.localidad,
                centro: centro.centro,
                municipio: centro.municipio,
                timestamp: Date.now()
              };
              
              // Crear un nuevo documento para la asignación
              const nuevaAsignacionRef = doc(collection(db, "asignaciones"));
              
              // Verificar que el centro existe antes de proceder
              if (!centro.docId) {
                return { 
                  success: false, 
                  message: `Error: Centro ${centro.centro} no tiene ID de documento válido` 
                };
              }
              
              // Crear la asignación primero
              transaction.set(nuevaAsignacionRef, nuevaAsignacion);
              
              // Luego actualizar el contador del centro
              transaction.update(centroRef, {
                asignadas: plazasOcupadas + 1
              });
              
              return { 
                success: true, 
                message: `Asignación exitosa en ${centro.centro}`,
                docId: nuevaAsignacionRef.id,
                nuevaAsignacion
              };
            });
            
            if (resultado.success) {
              // Incrementar contador de plazas asignadas para este centro
              centro.asignadas++;
              
              // Añadir a las nuevas asignaciones
              const asignacionConId = { 
                ...resultado.nuevaAsignacion, 
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
            // console.error(`Error en transacción para orden ${orden} en centro ${centro.centro}:`, error);
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
    // console.error("Error al procesar solicitudes:", error);
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
    // console.error("Error al borrar asignación:", error);
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
 * @param {Array} centrosDisponibles - Lista de centros disponibles
 * @param {Object} db - Referencia a la base de datos Firestore
 * @returns {Promise<Object>} - Resultado del procesamiento
 */
export const procesarSolicitud = async (solicitud, centrosDisponibles, db) => {
  try {
    // Primero verificar si ya existe una asignación para esta solicitud
    const asignacionesRef = collection(db, "asignaciones");
    const asignacionesQuery = query(asignacionesRef, 
      where("order", "==", solicitud.orden)
    );
    const asignacionesSnapshot = await getDocs(asignacionesQuery);
    
    if (!asignacionesSnapshot.empty) {
      // Ya existe una asignación, mover la solicitud pendiente al historial como completada
      if (solicitud.docId) {
        try {
          // Crear entrada en historial
          const historialRef = doc(collection(db, "historialSolicitudes"));
          await setDoc(historialRef, {
            orden: solicitud.orden,
            centrosIds: solicitud.centrosIds,
            estado: "ASIGNADA",
            mensaje: "Ya existía una asignación previa",
            fechaHistorico: new Date().toISOString(),
            timestamp: Date.now()
          });
          
          // Eliminar la solicitud pendiente
          await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
        } catch (error) {
          // Error al mover al historial
        }
      }
      return { success: true, message: "Ya existía una asignación" };
    }
    
    // Verificar que la solicitud tiene centros solicitados válidos
    if (!solicitud.centrosIds || !Array.isArray(solicitud.centrosIds) || solicitud.centrosIds.length === 0) {
      // Solicitud sin centros válidos, mover al historial
      try {
        // Crear entrada en historial
        const historialRef = doc(collection(db, "historialSolicitudes"));
        await setDoc(historialRef, {
          orden: solicitud.orden,
          centrosIds: solicitud.centrosIds || [],
          estado: "NO_ASIGNABLE",
          mensaje: "Solicitud sin centros válidos",
          fechaHistorico: new Date().toISOString(),
          timestamp: Date.now()
        });
        
        // Eliminar la solicitud pendiente
        if (solicitud.docId) {
          await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
        }
      } catch (error) {
        // Error al mover al historial
      }
      return { success: false, message: "Solicitud sin centros válidos", noAsignable: true };
    }
    
    // Obtener todas las solicitudes pendientes para verificar órdenes menores
    const solicitudesPendientesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
    const todasSolicitudesPendientes = solicitudesPendientesSnapshot.docs.map(doc => ({
      ...doc.data(),
      docId: doc.id
    }));
    
    // Examinar TODOS los centros disponibles en la lista de solicitudes
    // y guardar información sobre por qué no se pueden asignar
    const centrosInfo = [];
    let hayOrdenMenorBloqueante = false;
    let centrosConOrdenMenor = [];
    
    for (let i = 0; i < solicitud.centrosIds.length; i++) {
      const centroId = solicitud.centrosIds[i];
      const centro = centrosDisponibles.find(c => c.id === centroId);
      
      if (!centro) {
        centrosInfo.push({
          id: centroId,
          razon: "Centro no encontrado",
          disponible: false
        });
        continue;
      }
      
      if (centro.plazas <= centro.asignadas) {
        centrosInfo.push({
          id: centroId,
          nombre: centro.centro,
          razon: "No hay plazas disponibles",
          disponible: false
        });
        continue;
      }
      
      // Verificar si hay solicitudes con número de orden menor para este centro
      const solicitudesConOrdenMenor = todasSolicitudesPendientes.filter(s => 
        s.orden < solicitud.orden && // Número de orden menor
        s.centrosIds && s.centrosIds.includes(centroId) && // Incluye este centro
        s.docId !== solicitud.docId // No es la misma solicitud
      );
      
      // Si hay solicitudes con orden menor y pocas plazas disponibles
      const plazasDisponibles = centro.plazas - centro.asignadas;
      if (solicitudesConOrdenMenor.length >= plazasDisponibles) {
        centrosInfo.push({
          id: centroId,
          nombre: centro.centro,
          razon: `Plazas reservadas para órdenes menores (${solicitudesConOrdenMenor.map(s => s.orden).join(', ')})`,
          disponible: false,
          ordenMenor: true
        });
        
        hayOrdenMenorBloqueante = true;
        centrosConOrdenMenor.push({
          centroId,
          centro: centro.centro,
          ordenesConPrioridad: solicitudesConOrdenMenor.map(s => s.orden)
        });
        
        continue;
      }
      
      centrosInfo.push({
        id: centroId,
        nombre: centro.centro,
        centro: centro,
        disponible: true
      });
    }
    
    // Si todos los centros están bloqueados por órdenes menores o no disponibles, mover a historial como NO_ASIGNABLE
    if (centrosInfo.every(c => !c.disponible)) {
      let mensaje = "";
      let razones = "";
      
      // Determinar si la causa principal es por órdenes menores o por otras razones
      if (hayOrdenMenorBloqueante) {
        mensaje = `Centros bloqueados por solicitudes con orden de prioridad superior: ${centrosConOrdenMenor.map(c => `${c.centro}(${c.ordenesConPrioridad.join(',')})`).join('; ')}`;
      } else {
        // Ningún centro disponible por otras razones
        razones = centrosInfo.map(c => `${c.nombre || c.id}: ${c.razon}`).join(", ");
        mensaje = `No hay plazas disponibles en ninguno de los centros solicitados. Razones: ${razones}`;
      }
      
      // Mover la solicitud al historial
      try {
        // Crear entrada en historial
        const historialRef = doc(collection(db, "historialSolicitudes"));
        await setDoc(historialRef, {
          orden: solicitud.orden,
          centrosIds: solicitud.centrosIds,
          estado: "NO_ASIGNABLE",
          mensaje: mensaje,
          fechaHistorico: new Date().toISOString(),
          timestamp: Date.now()
        });
        
        // Eliminar la solicitud pendiente
        if (solicitud.docId) {
          await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
        }
        
        return { 
          success: true, 
          message: `Solicitud trasladada a historial como NO_ASIGNABLE. ${mensaje}`,
          noAsignable: true
        };
      } catch (error) {
        // Error al mover al historial, mantener solicitud pendiente
        return {
          success: false,
          message: `Error al mover a historial: ${error.message}`,
          error
        };
      }
    }
    
    // Filtrar solo los centros disponibles
    const centrosDisponiblesParaSolicitud = centrosInfo.filter(c => c.disponible);
    
    // Intentar asignar cada centro disponible en orden de preferencia
    let asignacionExitosa = false;
    let ultimoError = null;
    
    for (const centroInfo of centrosDisponiblesParaSolicitud) {
      const centroAsignado = centroInfo.centro;
      
      // Usar una transacción para asegurar atomicidad en la asignación
      let maxIntentos = 3;
      let intento = 0;
      let exito = false;
      
      while (intento < maxIntentos && !exito) {
        try {
          intento++;
          
          const resultado = await runTransaction(db, async (transaction) => {
            // Verificar nuevamente el estado del centro dentro de la transacción
            const centroRef = doc(db, "centros", centroAsignado.docId);
            const centroDoc = await transaction.get(centroRef);
            
            if (!centroDoc.exists()) {
              throw new Error(`El centro con ID ${centroAsignado.id} no existe`);
            }
            
            const centroData = centroDoc.data();
            
            // Verificar que aún hay plazas disponibles
            if (centroData.plazas <= centroData.asignadas) {
              throw new Error(`No hay plazas disponibles en el centro ${centroAsignado.centro}`);
            }
            
            // Incrementar contador de asignaciones
            transaction.update(centroRef, {
              asignadas: (centroData.asignadas || 0) + 1
            });
            
            // Buscar si ya existe una asignación para este orden (verificación adicional)
            const asignacionesQueryFinal = query(collection(db, "asignaciones"), 
              where("order", "==", solicitud.orden)
            );
            const asignacionesDocsSnapshot = await getDocs(asignacionesQueryFinal);
            
            if (!asignacionesDocsSnapshot.empty) {
              // Ya existe una asignación, no crear otra, mover a historial
              const solicitudRef = doc(db, "solicitudesPendientes", solicitud.docId);
              transaction.delete(solicitudRef);
              
              // Como ya había una asignación, revertir el contador del centro
              transaction.update(centroRef, {
                asignadas: centroData.asignadas
              });
              
              // Crear entrada en historial
              const historialRef = doc(collection(db, "historialSolicitudes"));
              transaction.set(historialRef, {
                orden: solicitud.orden,
                centrosIds: solicitud.centrosIds,
                estado: "ASIGNADA",
                mensaje: "Ya existía una asignación previa (verificado en transacción)",
                fechaHistorico: new Date().toISOString(),
                timestamp: Date.now()
              });
              
              return { success: true, message: "Ya existía una asignación (verificado en transacción)" };
            }
            
            // Crear nueva asignación
            const nuevaAsignacionRef = doc(collection(db, "asignaciones"));
            
            const datosAsignacion = {
              order: solicitud.orden,
              id: centroAsignado.id,
              centro: centroAsignado.centro,
              municipio: centroAsignado.municipio,
              localidad: centroAsignado.localidad,
              timestamp: Date.now()
            };
            
            transaction.set(nuevaAsignacionRef, datosAsignacion);
            
            // Mover a historial como asignada
            const historialRef = doc(collection(db, "historialSolicitudes"));
            const historialData = {
              orden: solicitud.orden,
              centrosIds: solicitud.centrosIds,
              estado: "ASIGNADA",
              centroAsignado: centroAsignado.centro,
              centroId: centroAsignado.id,
              fechaHistorico: new Date().toISOString(),
              timestamp: Date.now()
            };
            
            // Eliminar valores undefined para evitar errores en Firebase
            Object.keys(historialData).forEach(key => {
              if (historialData[key] === undefined) {
                delete historialData[key];
              }
            });
            
            if (historialData.orden && historialData.centroId) {
              transaction.set(historialRef, historialData);
            }
            
            // Eliminar la solicitud pendiente
            if (solicitud.docId) {
              const solicitudRef = doc(db, "solicitudesPendientes", solicitud.docId);
              transaction.delete(solicitudRef);
            }
            
            return { success: true };
          });
          
          // Si la transacción fue exitosa
          if (resultado && resultado.success) {
            exito = true;
            asignacionExitosa = true;
            
            return {
              success: true,
              message: "Asignación exitosa",
              centroAsignado: centroAsignado
            };
          }
          
          // Si ya existe una asignación, también es exitoso
          if (resultado && resultado.message && resultado.message.includes("Ya existía una asignación")) {
            exito = true;
            asignacionExitosa = true;
            return {
              success: true,
              message: resultado.message,
              centroAsignado: centroAsignado
            };
          }
          
        } catch (e) {
          ultimoError = e;
          
          // Si es un error de precondición, esperar un tiempo aleatorio antes de reintentar
          if (e.code === 'failed-precondition') {
            const tiempoEspera = Math.floor(Math.random() * 500) + 100; // Entre 100 y 600ms
            await new Promise(resolve => setTimeout(resolve, tiempoEspera));
          }
          
          // Si agotamos los intentos con este centro, intentar con el siguiente
          if (intento >= maxIntentos) {
            break; // Salir del bucle de intentos para este centro
          }
        }
      }
      
      // Si ya tuvimos éxito con este centro, no continuar con los demás
      if (asignacionExitosa) {
        break;
      }
    }
    
    // Si después de intentar con todos los centros no hubo éxito
    if (!asignacionExitosa) {
      // Mover a historial como NO_ASIGNABLE
      const mensajeError = ultimoError?.message || 'Error desconocido al intentar asignar';
      
      try {
        // Crear entrada en historial
        const historialRef = doc(collection(db, "historialSolicitudes"));
        await setDoc(historialRef, {
          orden: solicitud.orden,
          centrosIds: solicitud.centrosIds,
          estado: "NO_ASIGNABLE",
          mensaje: `No se pudo asignar después de múltiples intentos: ${mensajeError}`,
          fechaHistorico: new Date().toISOString(),
          timestamp: Date.now()
        });
        
        // Eliminar la solicitud pendiente
        if (solicitud.docId) {
          await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
        }
        
        return { 
          success: true, 
          message: "Solicitud trasladada a historial como NO_ASIGNABLE después de múltiples intentos fallidos",
          noAsignable: true
        };
      } catch (deleteError) {
        // Error al mover al historial
        return {
          success: false,
          message: `Error al mover solicitud a historial: ${deleteError.message}`,
          error: deleteError
        };
      }
    }
    
  } catch (error) {
    // Error general - intentar mover a historial como NO_ASIGNABLE
    try {
      const historialRef = doc(collection(db, "historialSolicitudes"));
      await setDoc(historialRef, {
        orden: solicitud.orden,
        centrosIds: solicitud.centrosIds || [],
        estado: "NO_ASIGNABLE",
        mensaje: `Error general: ${error.message || 'Desconocido'}`,
        fechaHistorico: new Date().toISOString(),
        timestamp: Date.now()
      });
      
      // Eliminar la solicitud pendiente
      if (solicitud.docId) {
        await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
      }
      
      return { 
        success: false, 
        message: `Error general movido a historial: ${error.message}`,
        noAsignable: true
      };
    } catch (historialError) {
      return { success: false, message: error.message, error };
    }
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
          // console.error(`Error al resetear contador para centro ${centro.centro}:`, error);
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
          // console.error(`Error al actualizar contador para centro ${centro.centro}:`, error);
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
    // console.error("Error al resetear contadores de asignaciones:", error);
    return {
      success: false,
      error: error.message,
      message: "Error al resetear contadores de asignaciones: " + error.message
    };
  }
};

export const eliminarAsignacion = async (asignacionId, db) => {
  try {
    const asignacionesRef = doc(db, "asignaciones", asignacionId);
    await deleteDoc(asignacionesRef);
    return { success: true };
  } catch (error) {
    // console.error(`Error al eliminar asignación ${asignacion.docId}:`, error);
    return { success: false, error: error.message };
  }
};

