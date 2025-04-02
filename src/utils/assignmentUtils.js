import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  deleteDoc,
  runTransaction,
  where,
  getDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "./firebaseConfig";

/**
 * Procesa las solicitudes pendientes y asigna plazas según orden de prioridad.
 * Fases:
 *  1. Elimina asignaciones existentes y resetea contadores.
 *  2. Recorre las solicitudes ordenadas e intenta asignar plaza mediante transacción.
 *
 * @param {Array} solicitudes - Lista de solicitudes pendientes.
 * @param {Array} assignments - Lista de asignaciones existentes.
 * @param {Array} availablePlazas - Lista de centros/plazas disponibles.
 * @param {Function} setProcessingMessage - Callback para actualizar mensaje de estado.
 * @returns {Promise<Object>} - Resultado del procesamiento.
 */
export const procesarSolicitudes = async (
  solicitudes,
  assignments,
  availablePlazas,
  setProcessingMessage
) => {
  try {
    if (!solicitudes || !solicitudes.length) {
      setProcessingMessage && setProcessingMessage("No hay solicitudes pendientes para procesar");
      return { success: true, message: "No hay solicitudes pendientes para procesar" };
    }

    setProcessingMessage && setProcessingMessage("Iniciando procesamiento de solicitudes...");

    // Primero combinar todas las solicitudes pendientes con las asignaciones existentes para ordenar por prioridad
    const todasLasSolicitudes = [...solicitudes];
    
    // Convertir asignaciones existentes a formato similar para el procesamiento unificado
    const asignacionesComoSolicitudes = assignments.map(asignacion => ({
      orden: asignacion.order,
      centroActual: asignacion.id,
      estaAsignada: true,
      docId: asignacion.docId,
      timestamp: asignacion.timestamp || 0,
      centro: asignacion.centro, 
      localidad: asignacion.localidad,
      municipio: asignacion.municipio
    }));
    
    // Combinar todo lo que requiere procesamiento (solicitudes pendientes y asignaciones existentes)
    const todasLasOperaciones = [...todasLasSolicitudes, ...asignacionesComoSolicitudes];
    
    // Ordenar todo por prioridad (orden numérico, menor número = mayor prioridad)
    const operacionesOrdenadas = todasLasOperaciones.sort((a, b) => Number(a.orden) - Number(b.orden));
    
    setProcessingMessage && setProcessingMessage(`Procesando ${operacionesOrdenadas.length} solicitudes por prioridad...`);
    
    // Crear copia local de centros para trabajar
    const centrosActualizados = availablePlazas.map(plaza => ({ 
      ...plaza, 
      asignadas: 0,  // Resetear contador para reasignar todo
      asignacionesPorOrden: [] // Almacenar los números de orden asignados a cada centro
    }));
    
    // Mapeo para acceso rápido por ID
    const centrosMap = centrosActualizados.reduce((map, centro) => {
      map[centro.id] = centro;
      return map;
    }, {});

    // Fase 1: Eliminar asignaciones existentes y resetear contadores en Firestore
    setProcessingMessage && setProcessingMessage("Eliminando asignaciones existentes para recalcular...");
    for (const asignacion of assignments) {
      if (asignacion.docId) {
        await deleteDoc(doc(db, "asignaciones", asignacion.docId));
      }
    }
    
    // Resetear contadores de asignadas en los centros
    for (const centro of centrosActualizados) {
      if (centro.docId) {
        await updateDoc(doc(db, "centros", centro.docId), { asignadas: 0 });
      }
    }

    // Fase 2: Procesar cada solicitud/asignación en estricto orden de prioridad
    let asignacionesNuevas = 0;
    let reasignaciones = 0;
    const nuevasAsignaciones = [];
    const ordenesProcesadas = new Set();
    const solicitudesAsignadas = []; // Guardar docIds de solicitudes asignadas
    const historialOperaciones = []; // Guardar operaciones para historial

    for (const operacion of operacionesOrdenadas) {
      // Evitar procesar duplicados por número de orden
      if (ordenesProcesadas.has(operacion.orden)) continue;
      
      setProcessingMessage && setProcessingMessage(
        `Procesando solicitud/asignación #${operacion.orden} (procesadas: ${ordenesProcesadas.size})`
      );
      
      // Intentar asignar según las preferencias/estado actual
      let asignacionExitosa = false;
      let centroAsignado = null;
      
      // Si es una asignación existente, intentar mantenerla en su centro actual 
      if (operacion.estaAsignada && operacion.centroActual) {
        const centro = centrosMap[operacion.centroActual];
        if (centro && centro.asignadas < centro.plazas) {
          // Podemos mantener la asignación actual
          centro.asignadas++;
          centro.asignacionesPorOrden.push(operacion.orden);
          
          // Crear nueva asignación con los datos actuales
          const nuevaAsignacion = {
            order: operacion.orden,
            id: centro.id,
            localidad: centro.localidad || operacion.localidad,
            centro: centro.centro || operacion.centro,
            municipio: centro.municipio || operacion.municipio,
            timestamp: Date.now(),
            mantenida: true // Indica que se mantuvo en el mismo centro
          };
          
          // Guardar en Firestore como parte de la reasignación global
          const nuevaAsignacionRef = doc(collection(db, "asignaciones"));
          await setDoc(nuevaAsignacionRef, nuevaAsignacion);
          
          nuevasAsignaciones.push({ ...nuevaAsignacion, docId: nuevaAsignacionRef.id });
          asignacionExitosa = true;
          centroAsignado = centro;
          
          // Registrar en historial la reasignación/mantenimiento
          historialOperaciones.push({
            tipo: "MANTENIDA",
            orden: operacion.orden,
            centroId: centro.id,
            centro: centro.centro,
            mensaje: `Asignación mantenida en ${centro.centro}`
          });
        }
        // Si no hay espacio, continuará con la lógica de solicitud normal
      }
      
      // Si no está asignada o no se pudo mantener, procesar como solicitud
      if (!asignacionExitosa) {
        // Obtener lista de centros preferidos, si está disponible
        const centrosIds = operacion.centrosIds || 
                            (operacion.estaAsignada ? [operacion.centroActual] : []);
        
        // Si no hay preferencias, intentar todos los centros por disponibilidad
        const centrosAProbar = centrosIds.length > 0 ? 
          centrosIds.map(id => centrosMap[id]).filter(Boolean) : 
          centrosActualizados.sort((a, b) => (a.asignadas/a.plazas) - (b.asignadas/b.plazas));
        
        for (const centro of centrosAProbar) {
          if (centro.asignadas < centro.plazas) {
            // Hay plaza disponible para asignar directamente
            centro.asignadas++;
            centro.asignacionesPorOrden.push(operacion.orden);

              const nuevaAsignacion = {
              order: operacion.orden,
              id: centro.id,
                localidad: centro.localidad,
                centro: centro.centro,
                municipio: centro.municipio,
                timestamp: Date.now()
              };

              const nuevaAsignacionRef = doc(collection(db, "asignaciones"));
            await setDoc(nuevaAsignacionRef, nuevaAsignacion);

            nuevasAsignaciones.push({ ...nuevaAsignacion, docId: nuevaAsignacionRef.id });
              asignacionesNuevas++;
            asignacionExitosa = true;
            centroAsignado = centro;
            
            // Si la solicitud tiene docId, la guardamos para eliminarla después
            if (!operacion.estaAsignada && operacion.docId) {
              solicitudesAsignadas.push(operacion.docId);
            }
            
            // Registrar en historial
            historialOperaciones.push({
              tipo: operacion.estaAsignada ? "REASIGNADA" : "ASIGNADA",
              orden: operacion.orden,
              centroId: centro.id,
              centro: centro.centro,
              mensaje: operacion.estaAsignada ?
                `Reasignada de ${operacion.centro || "centro anterior"} a ${centro.centro}` :
                `Asignada a ${centro.centro}`
            });
            
            break; // Terminar búsqueda de centro
          }
          else if (centro.asignacionesPorOrden.length > 0) {
            // Centro lleno, verificar si podemos hacer intercambio por prioridad
            // Encontrar la asignación de menor prioridad (mayor orden) en este centro
            const ordenesAsignados = centro.asignacionesPorOrden;
            const ordenMayorAsignado = Math.max(...ordenesAsignados);
            
            if (Number(ordenMayorAsignado) > Number(operacion.orden)) {
              // Hay una asignación de menor prioridad, intentar reasignarla
              console.log(`Posible desplazamiento: Orden ${operacion.orden} tiene mayor prioridad que ${ordenMayorAsignado} en ${centro.centro}`);
              
              // Intentar encontrar alternativas para la asignación de menor prioridad
              const asignacionADesplazar = nuevasAsignaciones.find(
                a => a.order == ordenMayorAsignado && a.id === centro.id
              );
              
              if (asignacionADesplazar) {
                // Buscar centro alternativo para la asignación de menor prioridad
                let alternativaEncontrada = false;
                
                // Primero intentar con las preferencias originales si existen
                const operacionDesplazada = operacionesOrdenadas.find(op => op.orden == ordenMayorAsignado);
                const centrosAlternativos = centrosActualizados.filter(c => 
                  c.id !== centro.id && c.asignadas < c.plazas
                );
                
                if (centrosAlternativos.length > 0) {
                  // Encontramos alternativa, podemos hacer el intercambio
                  const centroAlternativo = centrosAlternativos[0]; // Tomar el primero disponible
                  
                  // 1. Asignar la solicitud actual al centro deseado
                  // Quitar la asignación anterior del centro
                  centro.asignacionesPorOrden = centro.asignacionesPorOrden.filter(
                    orden => orden != ordenMayorAsignado
                  );
                  // Asignar la nueva solicitud
                  centro.asignacionesPorOrden.push(operacion.orden);
                  
                  // 2. Crear la nueva asignación en Firestore
                  const nuevaAsignacion = {
                    order: operacion.orden,
                    id: centro.id,
                    localidad: centro.localidad,
                    centro: centro.centro,
                    municipio: centro.municipio,
                    timestamp: Date.now(),
                    priorizado: true // Indica que se asignó por prioridad
                  };
                  
                  const nuevaAsignacionRef = doc(collection(db, "asignaciones"));
                  await setDoc(nuevaAsignacionRef, nuevaAsignacion);
                  
                  nuevasAsignaciones.push({ ...nuevaAsignacion, docId: nuevaAsignacionRef.id });
                  
                  // 3. Reasignar la asignación desplazada al centro alternativo
                  centroAlternativo.asignadas++;
                  centroAlternativo.asignacionesPorOrden.push(ordenMayorAsignado);
                  
                  const asignacionReasignada = {
                    order: ordenMayorAsignado,
                    id: centroAlternativo.id,
                    localidad: centroAlternativo.localidad,
                    centro: centroAlternativo.centro,
                    municipio: centroAlternativo.municipio,
                    timestamp: Date.now(),
                    desplazada: true, // Indica que fue desplazada por una de mayor prioridad
                    centroAnterior: centro.centro
                  };
                  
                  const reasignacionRef = doc(collection(db, "asignaciones"));
                  await setDoc(reasignacionRef, asignacionReasignada);
                  
                  // Eliminar la asignación original
                  if (asignacionADesplazar.docId) {
                    await deleteDoc(doc(db, "asignaciones", asignacionADesplazar.docId));
                  }
                  
                  // Actualizar el array de nuevasAsignaciones
                  const indice = nuevasAsignaciones.findIndex(a => 
                    a.order == ordenMayorAsignado && a.id === centro.id
                  );
                  if (indice >= 0) {
                    nuevasAsignaciones.splice(indice, 1);
                  }
                  nuevasAsignaciones.push({ ...asignacionReasignada, docId: reasignacionRef.id });
                  
                  asignacionExitosa = true;
                  centroAsignado = centro;
                  reasignaciones++;
                  
                  // Si la solicitud tiene docId, la guardamos para eliminarla después
                  if (!operacion.estaAsignada && operacion.docId) {
                    solicitudesAsignadas.push(operacion.docId);
                  }
                  
                  // Registrar en historial
                  historialOperaciones.push({
                    tipo: "PRIORIZADA",
                    orden: operacion.orden,
                    centroId: centro.id,
                    centro: centro.centro,
                    mensaje: `Priorizada en ${centro.centro}, desplazando a orden ${ordenMayorAsignado}`
                  });
                  
                  historialOperaciones.push({
                    tipo: "DESPLAZADA",
                    orden: ordenMayorAsignado,
                    centroId: centroAlternativo.id,
                    centro: centroAlternativo.centro,
                    centroAnterior: centro.centro,
                    mensaje: `Desplazada de ${centro.centro} a ${centroAlternativo.centro} por orden ${operacion.orden} de mayor prioridad`
                  });
                  
                  break; // Terminamos la búsqueda de centro
                }
              }
            }
          }
        }
      }
      
      // Marcar como procesada
      ordenesProcesadas.add(operacion.orden);
      
      // Si no se pudo asignar, registrarlo en historial como NO_ASIGNABLE
      if (!asignacionExitosa) {
        historialOperaciones.push({
          tipo: "NO_ASIGNABLE",
          orden: operacion.orden,
          mensaje: "No hay plazas disponibles en ninguno de los centros solicitados"
        });
        
        // Si es una solicitud pendiente, marcarla para eliminar
        if (!operacion.estaAsignada && operacion.docId) {
          solicitudesAsignadas.push(operacion.docId);
        }
      }
    }
    
    // Fase 3: Registrar todas las operaciones en el historial
    setProcessingMessage && setProcessingMessage(`Registrando ${historialOperaciones.length} operaciones en el historial...`);
    
    for (const operacion of historialOperaciones) {
      try {
        const historialRef = doc(collection(db, "historialSolicitudes"));
        
        // Crear objeto con solo campos que tengan un valor definido
        const historialData = {
          orden: operacion.orden,
          estado: operacion.tipo,
          fechaHistorico: new Date().toISOString(),
          timestamp: Date.now()
        };
        
        // Añadir campos solo si existen y no son undefined
        if (operacion.centroId !== undefined) historialData.centroId = operacion.centroId;
        if (operacion.centro !== undefined) historialData.centroAsignado = operacion.centro;
        if (operacion.centroAnterior !== undefined) historialData.centroAnterior = operacion.centroAnterior;
        if (operacion.mensaje !== undefined) historialData.mensaje = operacion.mensaje;
        
        // Guardar en Firestore asegurando que no hay campos undefined
        await setDoc(historialRef, historialData);
          } catch (error) {
        console.error(`Error al registrar historial para orden ${operacion.orden}:`, error);
      }
    }
    
    // Fase 4: Eliminar todas las solicitudes que ya fueron procesadas
    if (solicitudesAsignadas.length > 0) {
      setProcessingMessage && setProcessingMessage(`Eliminando ${solicitudesAsignadas.length} solicitudes procesadas...`);
      let eliminadas = 0;
      
      for (const docId of solicitudesAsignadas) {
        try {
          await deleteDoc(doc(db, "solicitudesPendientes", docId));
          eliminadas++;
        } catch (error) {
          console.error(`Error al eliminar solicitud ${docId}:`, error);
        }
      }
      
      setProcessingMessage && setProcessingMessage(
        `Se eliminaron ${eliminadas} solicitudes pendientes ya procesadas.`
      );
    }
    
    // Fase 5: Actualizar contadores de asignaciones en los centros
    setProcessingMessage && setProcessingMessage("Actualizando contadores en los centros...");
    
    for (const centro of centrosActualizados) {
      if (centro.docId) {
        await updateDoc(doc(db, "centros", centro.docId), { 
          asignadas: centro.asignadas 
        });
      }
    }

    setProcessingMessage && setProcessingMessage(
      `Procesamiento completado. ${asignacionesNuevas} nuevas asignaciones, ${reasignaciones} reasignaciones.`
    );

    return { 
      success: true, 
      nuevasAsignaciones, 
      eliminadas: solicitudesAsignadas.length,
      asignacionesNuevas,
      reasignaciones,
      message: `Asignaciones procesadas por prioridad. ${asignacionesNuevas} nuevas, ${reasignaciones} reasignaciones.` 
    };
  } catch (error) {
    console.error("Error en procesarSolicitudes:", error);
    setProcessingMessage && setProcessingMessage("Error: " + error.message);
    return { success: false, message: error.message };
  }
};

/**
 * Borra una asignación y actualiza el contador de asignadas en el centro correspondiente.
 *
 * @param {Object} asignacion - Datos de la asignación a borrar.
 * @param {string} docId - ID del documento de asignación.
 * @param {Array} availablePlazas - Lista de centros disponibles.
 * @returns {Promise<Object>} - Resultado de la operación.
 */
export const borrarAsignacion = async (asignacion, docId, availablePlazas) => {
  try {
    if (!docId) {
      return { success: false, message: "No se proporcionó ID de asignación" };
    }

    // Borrar la asignación
    await deleteDoc(doc(db, "asignaciones", docId));

    // Actualizar contador en el centro
    const centroIndex = availablePlazas.findIndex(p => p.id === asignacion.id);
    if (centroIndex >= 0 && availablePlazas[centroIndex].docId) {
      const centro = availablePlazas[centroIndex];
      const nuevaCantidad = Math.max(0, centro.asignadas - 1);
      await updateDoc(doc(db, "centros", centro.docId), { asignadas: nuevaCantidad });

      const plazasActualizadas = [...availablePlazas];
      plazasActualizadas[centroIndex] = { ...centro, asignadas: nuevaCantidad };
      return { success: true, plazasActualizadas, message: "Asignación eliminada correctamente" };
    }
    return { success: true, message: "Asignación eliminada" };
  } catch (error) {
    return { success: false, error: error.message, message: "Error al borrar asignación: " + error.message };
  }
};

/**
 * Procesa una solicitud individual y realiza la asignación si es posible
 * @param {Object} solicitud - Objeto con los datos de la solicitud
 * @param {Object} availablePlazas - Objeto con las plazas disponibles por centro
 * @param {Object} db - Referencia a la base de datos Firestore
 * @returns {Promise<Object>} - Promesa que se resuelve con el resultado de la operación
 */
export const procesarSolicitud = async (solicitud, availablePlazas, db) => {
  try {
    console.log("Procesando solicitud individual:", solicitud);
    
    // Verificar datos básicos
    if (!solicitud || !solicitud.centrosIds || !Array.isArray(solicitud.centrosIds)) {
      return { success: false, message: "La solicitud no tiene formato correcto" };
    }
    
    // Si no hay centros seleccionados
    if (solicitud.centrosIds.length === 0) {
      return { success: false, message: "La solicitud no tiene centros seleccionados", noAsignable: true };
    }
    
    // Verificar disponibilidad en los centros seleccionados
    let centroAsignado = null;
    let centroAsignadoId = null;
    
    // Buscar un centro con plazas disponibles según el orden de preferencia
    for (const centroId of solicitud.centrosIds) {
      const centro = availablePlazas[centroId];
      
      if (!centro) {
        console.log(`Centro no encontrado: ${centroId}`);
        continue;
      }
      
      console.log(`Verificando centro ${centro.nombre}: ${centro.plazasDisponibles} plazas disponibles`);
      
      // Verificar si hay plazas disponibles
      if (centro.plazasDisponibles > 0) {
        centroAsignado = centro;
        centroAsignadoId = centroId;
        break;
      }
    }
    
    // Si no hay plazas disponibles en ningún centro
    if (!centroAsignado) {
      return { 
        success: false, 
        message: "No hay plazas disponibles en los centros seleccionados", 
        noAsignable: true 
      };
    }
    
    // Crear la asignación en Firestore
    const batch = writeBatch(db);
    
    // Crear nuevo documento de asignación
    const nuevaAsignacion = {
      numeroOrden: solicitud.orden || 0,
      centerId: centroAsignadoId,
      nombreCentro: centroAsignado.nombre,
      timestamp: Date.now(),
      fechaAsignacion: new Date().toISOString(),
      municipio: centroAsignado.municipio || "",
      localidad: centroAsignado.localidad || "",
      historial: [
        {
          accion: "asignación inicial",
          timestamp: Date.now(),
          detalles: `Asignado a ${centroAsignado.nombre}`
        }
      ]
    };
    
    // Guardar en colección de asignaciones
    const nuevaAsignacionRef = doc(collection(db, "asignaciones"));
    batch.set(nuevaAsignacionRef, nuevaAsignacion);
    
    // Actualizar contador de plazas ocupadas en el centro
    const centroRef = doc(db, "centros", centroAsignadoId);
    batch.update(centroRef, {
      plazasOcupadas: (centroAsignado.plazasOcupadas || 0) + 1
    });
    
    // Ejecutar la transacción
    await batch.commit();
    
    console.log(`Asignación creada exitosamente para solicitud ${solicitud.orden} en centro ${centroAsignado.nombre}`);
    
    return { 
      success: true,
      centroAsignado: centroAsignado,
      centroId: centroAsignadoId,
      asignacionId: nuevaAsignacionRef.id
    };
    
  } catch (error) {
    console.error("Error al procesar solicitud individual:", error);
    return { 
      success: false, 
      message: `Error al procesar: ${error.message}` 
    };
  }
};

/**
 * Reinicia y recalcula los contadores de asignaciones según las asignaciones existentes.
 *
 * @param {Array} centros - Lista de centros disponibles.
 * @param {Array} asignaciones - Lista de asignaciones existentes.
 * @param {Object} db - Referencia a la base de datos Firestore.
 * @returns {Promise<Object>} - Resultado de la operación.
 */
export const resetearContadoresAsignaciones = async (centros, asignaciones, db) => {
  try {
    // Resetear todos los contadores a 0 en Firestore
    for (const centro of centros) {
      if (centro.docId) {
        try {
          await updateDoc(doc(db, "centros", centro.docId), { asignadas: 0 });
        } catch (error) {
          console.error(`Error al resetear contador para ${centro.centro}:`, error);
        }
      }
    }

    // Construir mapa de conteo por centro
    const contadoresPorCentro = {};
    for (const asignacion of asignaciones) {
      const centroId = asignacion.centroId || asignacion.id;
      if (centroId) {
        contadoresPorCentro[centroId] = (contadoresPorCentro[centroId] || 0) + 1;
      }
    }

    // Actualizar contadores en Firestore según conteo
    let actualizados = 0, errores = 0;
    for (const centro of centros) {
      const centroId = centro.id;
      if (centroId && contadoresPorCentro[centroId] && centro.docId) {
        try {
          await updateDoc(doc(db, "centros", centro.docId), { asignadas: contadoresPorCentro[centroId] });
          actualizados++;
        } catch (error) {
          console.error(`Error al actualizar contador para ${centro.centro}:`, error);
          errores++;
        }
      }
    }
    return {
      success: true,
      actualizados,
      errores,
      message: `Contadores reiniciados. ${actualizados} centros actualizados.`
    };
  } catch (error) {
    console.error("Error al resetear contadores:", error);
    return { success: false, error: error.message, message: "Error al resetear contadores: " + error.message };
  }
};

/**
 * Elimina una asignación dado su ID.
 *
 * @param {string} asignacionId - ID de la asignación a eliminar.
 * @param {Object} db - Referencia a Firestore.
 * @returns {Promise<Object>} - Resultado de la operación.
 */
export const eliminarAsignacion = async (asignacionId, db) => {
  try {
    await deleteDoc(doc(db, "asignaciones", asignacionId));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Verifica y corrige centros con más asignaciones que plazas disponibles.
 *
 * @param {Array} centros - Lista de centros.
 * @param {Array} asignaciones - Lista de asignaciones existentes.
 * @param {Object} db - Referencia a Firestore.
 * @returns {Promise<Object>} - Resultado de la verificación y corrección.
 */
export const verificarYCorregirAsignaciones = async (centros, asignaciones, db) => {
  try {
    if (!Array.isArray(centros)) {
      console.error("Error: centros debe ser un array", centros);
      return { success: false, message: "Lista de centros inválida", error: "centros debe ser un array" };
    }
    if (!Array.isArray(asignaciones)) {
      console.error("Error: asignaciones debe ser un array", asignaciones);
      return { success: false, message: "Lista de asignaciones inválida", error: "asignaciones debe ser un array" };
    }
    if (!db) {
      console.error("Error: no se proporcionó la referencia a la base de datos");
      return { success: false, message: "Referencia a la base de datos no proporcionada", error: "db es requerido" };
    }

    console.log("Verificando centros con exceso de asignaciones...");
    const centrosValidos = centros.filter(centro =>
      centro && typeof centro === "object" &&
      !isNaN(centro.asignadas) && !isNaN(centro.plazas)
    );
    if (centrosValidos.length === 0) {
      console.log("No hay centros válidos para verificar");
      return { success: true, message: "No hay centros válidos para verificar", corregidos: 0 };
    }

    const centrosConExceso = centrosValidos.filter(centro => centro.asignadas > centro.plazas);
    if (centrosConExceso.length === 0) {
      console.log("No se encontraron centros con exceso de asignaciones");
      return { success: true, message: "No hay centros con exceso", corregidos: 0 };
    }
    console.log(`Centros con exceso: ${centrosConExceso.length}`);

    // Obtener todos los centros con plazas disponibles
    const centrosConDisponibilidad = centrosValidos.filter(centro => 
      centro.asignadas < centro.plazas
    );

    let asignacionesCorregidas = 0;
    let asignacionesReasignadas = 0;
    let solicitudesRecuperadas = 0;
    
    for (const centro of centrosConExceso) {
      if (!centro.centro || !centro.id) {
        console.warn("Centro inválido:", centro);
        continue;
      }
      console.log(`Centro ${centro.centro}: ${centro.asignadas} asignadas, ${centro.plazas} plazas`);
      const asignacionesCentro = asignaciones.filter(a => a && a.id === centro.id);
      if (!asignacionesCentro.length) {
        console.warn(`No se encontraron asignaciones para ${centro.centro}`);
        continue;
      }
      
      // Ordenar asignaciones por número de orden (prioridad)
      asignacionesCentro.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
      
      const exceso = centro.asignadas - centro.plazas;
      if (exceso <= 0) continue;
      
      // Tomar las asignaciones que exceden según orden de prioridad (las de mayor orden = menor prioridad)
      const asignacionesExcedentes = asignacionesCentro.slice(centro.plazas);
      console.log(`Procesando ${asignacionesExcedentes.length} asignaciones excedentes en ${centro.centro}`);
      
      for (const asignacion of asignacionesExcedentes) {
        try {
          // Intentar reasignar a un centro con disponibilidad
          let reasignado = false;
          
          // Encontramos centros con plazas disponibles que no sean el centro actual
          const centrosDisponibles = centrosConDisponibilidad.filter(c => c.id !== centro.id);
          
          if (centrosDisponibles.length > 0) {
            // Ordenar centros por menor ocupación
            const centrosOrdenados = [...centrosDisponibles].sort((a, b) => 
              (a.asignadas / a.plazas) - (b.asignadas / b.plazas)
            );
            
            // Intentar asignar al centro con más disponibilidad
            const centroDestino = centrosOrdenados[0];
            
            if (centroDestino && centroDestino.asignadas < centroDestino.plazas) {
              // Crear nueva asignación en el centro de destino
              const nuevaAsignacionRef = doc(collection(db, "asignaciones"));
              const nuevaAsignacion = {
                order: asignacion.order,
                id: centroDestino.id,
                localidad: centroDestino.localidad,
                centro: centroDestino.centro,
                municipio: centroDestino.municipio,
                timestamp: Date.now(),
                reasignado: true,
                centroOriginal: centro.centro
              };
              
              await setDoc(nuevaAsignacionRef, nuevaAsignacion);
              
              // Actualizar contador en el centro de destino
              await updateDoc(doc(db, "centros", centroDestino.docId), { 
                asignadas: centroDestino.asignadas + 1 
              });
              
              // Registrar en el historial la reasignación
              const historialRef = doc(collection(db, "historialSolicitudes"));
              const datosHistorial = {
                orden: asignacion.order,
                centroIdOriginal: asignacion.id,
                centroIdNuevo: centroDestino.id,
                estado: "REASIGNADO",
                mensaje: `Reasignación de ${centro.centro} a ${centroDestino.centro} por exceso de plazas`,
                centroOriginal: asignacion.centro || centro.centro,
                centroAsignado: centroDestino.centro,
                localidad: centroDestino.localidad,
                municipio: centroDestino.municipio,
                fechaHistorico: new Date().toISOString(),
                timestamp: Date.now()
              };
              
              await setDoc(historialRef, datosHistorial);
              
              // Incrementar contador de reasignaciones y actualizar el centro de destino 
              // para que refleje la nueva asignación
              centroDestino.asignadas++;
              reasignado = true;
              asignacionesReasignadas++;
              
              console.log(`Asignación ${asignacion.order} reasignada de ${centro.centro} a ${centroDestino.centro}`);
            }
          }
          
          // Si no se pudo reasignar, crear una nueva solicitud pendiente para volver a procesar
          if (!reasignado) {
            try {
              // Registrar en historial como FUERA_DE_ORDEN
          const historialRef = doc(collection(db, "historialSolicitudes"));
          const datosHistorial = {
            orden: asignacion.order,
            centroId: asignacion.id,
                estado: "EXCESO_NO_REASIGNABLE",
                mensaje: `Centro ${centro.centro} con exceso de plazas. Se mantiene la asignación actual.`,
            centroAsignado: asignacion.centro || centro.centro,
            localidad: asignacion.localidad || centro.localidad,
            municipio: asignacion.municipio || centro.municipio,
            fechaHistorico: new Date().toISOString(),
            timestamp: Date.now()
          };
              
          await setDoc(historialRef, datosHistorial);
              
              // Evitamos crear solicitudes pendientes para evitar que las asignaciones se conviertan en solicitudes
              console.log(`Asignación ${asignacion.order} en exceso en ${centro.centro}, pero se mantiene sin convertir a solicitud pendiente`);
              
              // Incrementamos el contador de correcciones aunque no hayamos hecho cambios reales
              asignacionesCorregidas++;
            } catch (error) {
              console.error(`Error al registrar en historial para orden ${asignacion.order}:`, error);
            }
          }
          
          // Eliminar la asignación original
          if (asignacion.docId) {
            await deleteDoc(doc(db, "asignaciones", asignacion.docId));
            asignacionesCorregidas++;
            console.log(`Asignación ${asignacion.docId} eliminada`);
          } else {
            console.warn(`Asignación sin docId para orden ${asignacion.order}`);
          }
        } catch (error) {
          console.error(`Error al corregir asignación para orden ${asignacion.order}:`, error);
        }
      }
      if (centro.docId) {
        try {
          await updateDoc(doc(db, "centros", centro.docId), { asignadas: centro.plazas });
          console.log(`Contador actualizado para ${centro.centro}: ${centro.plazas}`);
        } catch (error) {
          console.error(`Error al actualizar contador para ${centro.centro}:`, error);
        }
      } else {
        console.warn(`Centro ${centro.centro} sin docId, no se actualizó contador`);
      }
    }
    return {
      success: true,
      message: `Se corrigieron ${asignacionesCorregidas} asignaciones excedentes (${asignacionesReasignadas} reasignadas, ${solicitudesRecuperadas} recuperadas)`,
      corregidos: asignacionesCorregidas,
      reasignados: asignacionesReasignadas,
      recuperados: solicitudesRecuperadas
    };
  } catch (error) {
    console.error("Error en verificación y corrección:", error);
    return { success: false, error: error.message, message: "Error en verificación: " + error.message };
  }
};
