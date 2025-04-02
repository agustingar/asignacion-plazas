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
  getDoc
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

    // Ordenar solicitudes por prioridad (menor número = mayor prioridad)
    const solicitudesOrdenadas = [...solicitudes].sort((a, b) => a.orden - b.orden);

    // Crear copia local de centros y resetear contador de asignadas a 0
    const centrosActualizados = availablePlazas.map(plaza => ({ ...plaza, asignadas: 0 }));

    // Fase 1: Eliminar asignaciones existentes y resetear contadores en Firestore
    setProcessingMessage && setProcessingMessage("Eliminando asignaciones existentes...");
    for (const asignacion of assignments) {
      if (asignacion.docId) {
        await deleteDoc(doc(db, "asignaciones", asignacion.docId));
      }
    }
    for (const centro of centrosActualizados) {
      if (centro.docId) {
        await updateDoc(doc(db, "centros", centro.docId), { asignadas: 0 });
      }
    }

    // Fase 2: Procesar cada solicitud en orden de prioridad
    setProcessingMessage && setProcessingMessage(`Procesando ${solicitudesOrdenadas.length} solicitudes...`);
    let asignacionesNuevas = 0;
    const nuevasAsignaciones = [];
    const centrosMap = centrosActualizados.reduce((map, centro) => {
      map[centro.id] = centro;
      return map;
    }, {});
    const ordenesProcesadas = new Set();
    const solicitudesAsignadas = []; // Guardar docIds de solicitudes asignadas

    for (const solicitud of solicitudesOrdenadas) {
      // Evitar procesar duplicados por número de orden
      if (ordenesProcesadas.has(solicitud.orden)) continue;
      ordenesProcesadas.add(solicitud.orden);

      let asignacionExitosa = false;
      
      // Intentar asignar en cada centro de preferencia
      for (const centroId of solicitud.centrosIds) {
        const centro = centrosMap[centroId];
        if (!centro) continue;

        if (centro.asignadas < centro.plazas) {
          try {
            const resultado = await runTransaction(db, async (transaction) => {
              const centroRef = doc(db, "centros", centro.docId);
              const centroDoc = await transaction.get(centroRef);
              const actuales = centroDoc.data().asignadas || 0;
              if (!centroDoc.exists() || actuales >= centro.plazas) {
                return { success: false, message: `Sin plazas en ${centro.centro}` };
              }

              const nuevaAsignacion = {
                order: solicitud.orden,
                id: centroId,
                localidad: centro.localidad,
                centro: centro.centro,
                municipio: centro.municipio,
                timestamp: Date.now()
              };

              const nuevaAsignacionRef = doc(collection(db, "asignaciones"));
              transaction.set(nuevaAsignacionRef, nuevaAsignacion);
              transaction.update(centroRef, { asignadas: actuales + 1 });
              
              // Crear entrada en historial para esta asignación
              const historialRef = doc(collection(db, "historialSolicitudes"));
              const datosHistorial = {
                orden: solicitud.orden,
                centrosIds: solicitud.centrosIds,
                estado: "ASIGNADA",
                centroAsignado: centro.centro,
                centroId: centroId,
                localidad: centro.localidad,
                municipio: centro.municipio,
                fechaHistorico: new Date().toISOString(),
                timestamp: Date.now()
              };
              transaction.set(historialRef, datosHistorial);
              
              return { success: true, docId: nuevaAsignacionRef.id, nuevaAsignacion };
            });

            if (resultado.success) {
              centro.asignadas++;
              nuevasAsignaciones.push({ ...resultado.nuevaAsignacion, docId: resultado.docId });
              asignacionesNuevas++;
              asignacionExitosa = true;
              
              // Si la solicitud tiene docId, la guardamos para eliminarla después
              if (solicitud.docId) {
                solicitudesAsignadas.push(solicitud.docId);
              }
              
              // Se asignó la solicitud, salir del ciclo de centros
              break;
            }
          } catch (error) {
            console.error(`Error asignando para orden ${solicitud.orden} en ${centro.centro}:`, error);
          }
        }
      }
      
      setProcessingMessage && setProcessingMessage(
        `Procesada solicitud ${solicitud.orden} (asignaciones realizadas: ${asignacionesNuevas})`
      );
      
      // Si no se pudo asignar, registrarlo en historial como NO_ASIGNABLE
      if (!asignacionExitosa && solicitud.docId) {
        try {
          const historialRef = doc(collection(db, "historialSolicitudes"));
          await setDoc(historialRef, {
            orden: solicitud.orden,
            centrosIds: solicitud.centrosIds,
            estado: "NO_ASIGNABLE",
            mensaje: "No hay plazas disponibles en ninguno de los centros solicitados",
            fechaHistorico: new Date().toISOString(),
            timestamp: Date.now()
          });
          
          // También agregar a la lista para eliminar
          solicitudesAsignadas.push(solicitud.docId);
        } catch (historialError) {
          console.error(`Error al registrar en historial para orden ${solicitud.orden}:`, historialError);
        }
      }
    }
    
    // Fase 3: Eliminar todas las solicitudes que ya fueron procesadas
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

    setProcessingMessage && setProcessingMessage(
      `Procesamiento completado. ${asignacionesNuevas} asignaciones realizadas.`
    );

    return { 
      success: true, 
      nuevasAsignaciones, 
      eliminadas: solicitudesAsignadas.length,
      message: `Asignaciones procesadas correctamente. ${solicitudesAsignadas.length} solicitudes eliminadas de pendientes.` 
    };
  } catch (error) {
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
 * Procesa una única solicitud pendiente e intenta asignar una plaza.
 * Se realizan validaciones de datos, verificación de asignaciones previas y sincronización
 * de información actualizada de los centros.
 *
 * @param {Object} solicitud - Solicitud a procesar.
 * @param {Array} centrosDisponibles - Lista de centros disponibles.
 * @param {Object} db - Referencia a la base de datos Firestore.
 * @returns {Promise<Object>} - Resultado del procesamiento.
 */
export const procesarSolicitud = async (solicitud, centrosDisponibles, db) => {
  try {
    // Validaciones iniciales
    if (!solicitud || typeof solicitud !== "object") {
      console.error("Solicitud inválida:", solicitud);
      return { success: false, message: "Solicitud inválida", noAsignable: true };
    }
    if (solicitud.orden === undefined || solicitud.orden === null) {
      console.error("Solicitud sin número de orden", solicitud);
      return { success: false, message: "Solicitud sin número de orden", noAsignable: true };
    }
    const ordenNumerico = Number(solicitud.orden);
    if (isNaN(ordenNumerico)) {
      console.error("Número de orden inválido:", solicitud.orden);
      return { success: false, message: `Número de orden inválido: ${solicitud.orden}`, noAsignable: true };
    }
    console.log(`Procesando solicitud ${ordenNumerico}`);

    const centrosIds = solicitud.centrosIds || solicitud.centrosSeleccionados || [];
    if (!db) {
      console.error("No se proporcionó la referencia a la base de datos");
      return { success: false, message: "Referencia a la base de datos no proporcionada", noAsignable: true };
    }
    if (!centrosDisponibles || !Array.isArray(centrosDisponibles)) {
      console.error("Lista de centros disponibles inválida");
      return { success: false, message: "Lista de centros disponibles inválida", noAsignable: true };
    }

    // Verificar si ya existe una asignación para este orden
    try {
      const asignacionesQuery = query(
        collection(db, "asignaciones"),
        where("order", "==", ordenNumerico)
      );
      const asignacionesSnapshot = await getDocs(asignacionesQuery);
      if (!asignacionesSnapshot.empty) {
        console.log(`La solicitud ${ordenNumerico} ya tiene asignación`);
        if (solicitud.docId) {
          // Mover a historial y eliminar la solicitud pendiente
          const historialRef = doc(collection(db, "historialSolicitudes"));
          const asignacionExistente = asignacionesSnapshot.docs[0].data();
          await setDoc(historialRef, {
            orden: ordenNumerico,
            centrosIds: solicitud.centrosIds,
            estado: "ASIGNADA",
            mensaje: "Ya existía una asignación previa",
            centroAsignado: asignacionExistente.centro || "Desconocido",
            centroId: asignacionExistente.id || "",
            localidad: asignacionExistente.localidad || "",
            municipio: asignacionExistente.municipio || "",
            fechaHistorico: new Date().toISOString(),
            timestamp: Date.now()
          });
          await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
          console.log(`Solicitud ${ordenNumerico} movida a historial como ASIGNADA`);
        }
        return { success: true, message: "Ya existía una asignación" };
      }
    } catch (error) {
      console.error("Error al verificar asignaciones existentes:", error);
    }

    // Sincronizar datos actualizados de centros
    let centrosActualizados = [];
    if (centrosIds.length > 0) {
      try {
        const centrosRefs = centrosIds
          .map(id => centrosDisponibles.find(c => c.id === id))
          .filter(centro => centro && centro.docId)
          .map(centro => doc(db, "centros", centro.docId));
        if (centrosRefs.length > 0) {
          const centrosSnapshots = await Promise.all(centrosRefs.map(ref => getDoc(ref)));
          centrosSnapshots.forEach(snapshot => {
            if (snapshot.exists()) {
              const centroData = snapshot.data();
              const centroOriginal = centrosDisponibles.find(c => c.id === centroData.id);
              if (centroOriginal) {
                centrosActualizados.push({
                  ...centroOriginal,
                  plazas: centroData.plazas || centroOriginal.plazas,
                  asignadas: centroData.asignadas || 0
                });
              }
            }
          });
        }
      } catch (error) {
        console.error("Error al actualizar centros:", error);
      }
    }
    const centrosParaProcesar = centrosActualizados.length > 0
      ? centrosDisponibles.map(centro => centrosActualizados.find(c => c.id === centro.id) || centro)
      : centrosDisponibles;

    // Verificar si la solicitud tiene centros válidos
    if (!centrosIds || !Array.isArray(centrosIds) || centrosIds.length === 0) {
      try {
        const historialRef = doc(collection(db, "historialSolicitudes"));
        await setDoc(historialRef, {
          orden: ordenNumerico,
          centrosIds: [],
          estado: "NO_ASIGNABLE",
          mensaje: "Solicitud sin centros válidos",
          fechaHistorico: new Date().toISOString(),
          timestamp: Date.now()
        });
        if (solicitud.docId) {
          await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
        }
      } catch (error) {
        console.error("Error al mover solicitud sin centros válidos:", error);
      }
      return { success: false, message: "Solicitud sin centros válidos", noAsignable: true };
    }

    // Procesar centros y evaluar bloqueos por órdenes con mayor prioridad
    const solicitudesPendientesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
    const todasSolicitudesPendientes = solicitudesPendientesSnapshot.docs.map(doc => ({
      ...doc.data(),
      docId: doc.id
    }));
    const centrosInfo = [];
    let hayBloqueoPorOrdenMenor = false;
    let infoOrdenMenor = [];

    for (const centroId of centrosIds) {
      const centro = centrosParaProcesar.find(c => c.id === centroId);
      if (!centro) {
        centrosInfo.push({ id: centroId, razon: "Centro no encontrado", disponible: false });
        continue;
      }
      if (centro.plazas <= centro.asignadas) {
        centrosInfo.push({ id: centroId, nombre: centro.centro, razon: "Sin plazas disponibles", disponible: false });
        continue;
      }
      const solicitudesConOrdenMenor = todasSolicitudesPendientes.filter(s =>
        s.orden < ordenNumerico &&
        s.centrosIds && s.centrosIds.includes(centroId) &&
        s.docId !== solicitud.docId
      );
      const plazasDisponibles = centro.plazas - centro.asignadas;
      if (solicitudesConOrdenMenor.length >= plazasDisponibles) {
        centrosInfo.push({
          id: centroId,
          nombre: centro.centro,
          razon: `Plazas reservadas para órdenes: ${solicitudesConOrdenMenor.map(s => s.orden).join(", ")}`,
          disponible: false,
          bloqueadoPorOrdenMenor: true
        });
        hayBloqueoPorOrdenMenor = true;
        infoOrdenMenor.push({ centroId, centro: centro.centro, ordenes: solicitudesConOrdenMenor.map(s => s.orden) });
        continue;
      }
      centrosInfo.push({ id: centroId, nombre: centro.centro, centro, disponible: true });
    }

    // Si ningún centro es asignable, mover la solicitud a historial como NO_ASIGNABLE
    if (centrosInfo.every(c => !c.disponible)) {
      let mensaje = hayBloqueoPorOrdenMenor
        ? `Centros bloqueados por órdenes menores: ${infoOrdenMenor.map(item => `${item.centro}(${item.ordenes.join(",")})`).join("; ")}`
        : `Ningún centro disponible: ${centrosInfo.map(c => `${c.nombre || c.id}: ${c.razon}`).join(", ")}`;
      try {
        const historialRef = doc(collection(db, "historialSolicitudes"));
        await setDoc(historialRef, {
          orden: ordenNumerico,
          centrosIds: solicitud.centrosIds,
          estado: "NO_ASIGNABLE",
          mensaje,
          fechaHistorico: new Date().toISOString(),
          timestamp: Date.now()
        });
        if (solicitud.docId) {
          await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
        }
        return { success: true, message: `Solicitud movida a historial como NO_ASIGNABLE. ${mensaje}`, noAsignable: true };
      } catch (error) {
        console.error(`Error al mover solicitud ${ordenNumerico} a historial:`, error);
        return { success: false, message: `Error al mover a historial: ${error.message}`, error };
      }
    }

    // Intentar asignar la solicitud usando transacciones con reintentos
    let asignacionExitosa = false;
    let ultimoError = null;
    const maxIntentos = 3;

    for (const centroInfo of centrosInfo.filter(c => c.disponible)) {
      const centroAsignado = centroInfo.centro;
      let intento = 0;
      let exito = false;
      while (intento < maxIntentos && !exito) {
        intento++;
        if (intento > 1) {
          const retardo = Math.floor(Math.random() * 500) + 200;
          await new Promise(resolve => setTimeout(resolve, retardo));
        }
        try {
          const resultado = await runTransaction(db, async (transaction) => {
            // Verificar asignación previa dentro de la transacción
            const asignacionesQuery = query(
              collection(db, "asignaciones"),
              where("order", "==", ordenNumerico)
            );
            const asignacionesSnapshot = await getDocs(asignacionesQuery);
            if (!asignacionesSnapshot.empty) {
              if (solicitud.docId) {
                transaction.delete(doc(db, "solicitudesPendientes", solicitud.docId));
                const historialRef = doc(collection(db, "historialSolicitudes"));
                const asignacionExistente = asignacionesSnapshot.docs[0].data();
                transaction.set(historialRef, {
                  orden: ordenNumerico,
                  centrosIds: solicitud.centrosIds,
                  estado: "ASIGNADA",
                  mensaje: "Ya existía asignación (verificado en transacción)",
                  centroAsignado: asignacionExistente.centro || "",
                  centroId: asignacionExistente.id || "",
                  localidad: asignacionExistente.localidad || "",
                  municipio: asignacionExistente.municipio || "",
                  fechaHistorico: new Date().toISOString(),
                  timestamp: Date.now()
                });
              }
              return { success: true, message: "Asignación ya existente" };
            }

            const centroRef = doc(db, "centros", centroAsignado.docId);
            const centroDoc = await transaction.get(centroRef);
            if (!centroDoc.exists()) throw new Error(`El centro ${centroAsignado.centro} no existe`);
            const actuales = centroDoc.data().asignadas || 0;
            if (actuales >= centroDoc.data().plazas) throw new Error(`No hay plazas en ${centroAsignado.centro}`);

            // Verificar bloqueo por órdenes menores
            const solicitudesPendientesQuery = query(collection(db, "solicitudesPendientes"));
            const solicitudesPendientesDocs = await transaction.get(solicitudesPendientesQuery);
            const solicitudesConOrdenMenor = solicitudesPendientesDocs.docs
              .map(d => ({ ...d.data(), docId: d.id }))
              .filter(s =>
                s.orden < ordenNumerico &&
                s.centrosIds && s.centrosIds.includes(centroAsignado.id) &&
                s.docId !== solicitud.docId
              );
            const plazasDisponibles = centroDoc.data().plazas - actuales;
            if (solicitudesConOrdenMenor.length >= plazasDisponibles) {
              throw new Error(`Plazas reservadas para órdenes menores: ${solicitudesConOrdenMenor.map(s => s.orden).join(", ")}`);
            }

            // Incrementar contador y crear asignación
            transaction.update(centroRef, { asignadas: actuales + 1 });
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

            // Registrar en historial
            const historialRef = doc(collection(db, "historialSolicitudes"));
            const historialData = {
              orden: solicitud.orden,
              centrosIds: solicitud.centrosIds,
              estado: "ASIGNADA",
              centroAsignado: centroAsignado.centro,
              centroId: centroAsignado.id,
              localidad: centroAsignado.localidad,
              municipio: centroAsignado.municipio,
              fechaHistorico: new Date().toISOString(),
              timestamp: Date.now()
            };
            Object.keys(historialData).forEach(key => {
              if (historialData[key] === undefined) delete historialData[key];
            });
            transaction.set(historialRef, historialData);

            if (solicitud.docId) {
              transaction.delete(doc(db, "solicitudesPendientes", solicitud.docId));
            }
            return { success: true, centroAsignado };
          });
          if (resultado && resultado.success) {
            console.log(`Asignación exitosa para solicitud ${solicitud.orden} en centro ${centroAsignado.centro}`);
            exito = true;
            asignacionExitosa = true;
            return { success: true, message: "Asignación exitosa", centroAsignado };
          }
        } catch (e) {
          ultimoError = e;
          console.warn(`Intento ${intento}: Error al asignar solicitud ${solicitud.orden} en centro ${centroAsignado?.centro}: ${e.message}`);
          if (e.code === "failed-precondition") {
            const espera = Math.floor(Math.random() * 500) + 100;
            await new Promise(resolve => setTimeout(resolve, espera));
          }
          if (intento >= maxIntentos) {
            console.log(`Agotados ${maxIntentos} intentos para centro ${centroAsignado?.centro}, se procede a probar siguiente`);
            break;
          }
        }
      }
      if (asignacionExitosa) break;
    }

    if (!asignacionExitosa) {
      const mensajeError = ultimoError?.message || "Error desconocido al asignar";
      console.error(`No se pudo asignar la solicitud ${solicitud.orden}: ${mensajeError}`);
      try {
        const historialRef = doc(collection(db, "historialSolicitudes"));
        await setDoc(historialRef, {
          orden: solicitud.orden,
          centrosIds: solicitud.centrosIds,
          estado: "NO_ASIGNABLE",
          mensaje: `No se pudo asignar tras múltiples intentos: ${mensajeError}`,
          fechaHistorico: new Date().toISOString(),
          timestamp: Date.now()
        });
        if (solicitud.docId) {
          await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
        }
        return { success: true, message: "Solicitud movida a historial como NO_ASIGNABLE", noAsignable: true };
      } catch (deleteError) {
        return { success: false, message: `Error al mover solicitud a historial: ${deleteError.message}`, error: deleteError };
      }
    }
  } catch (error) {
    console.error(`Error general al procesar solicitud ${solicitud.orden}: ${error.message}`);
    try {
      const historialRef = doc(collection(db, "historialSolicitudes"));
      await setDoc(historialRef, {
        orden: solicitud.orden,
        centrosIds: solicitud.centrosIds || [],
        estado: "NO_ASIGNABLE",
        mensaje: `Error general: ${error.message || "Desconocido"}`,
        fechaHistorico: new Date().toISOString(),
        timestamp: Date.now()
      });
      if (solicitud.docId) {
        await deleteDoc(doc(db, "solicitudesPendientes", solicitud.docId));
      }
      return { success: false, message: `Error general movido a historial: ${error.message}`, noAsignable: true };
    } catch (historialError) {
      return { success: false, message: error.message, error };
    }
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
                estado: "FUERA_DE_ORDEN",
                mensaje: `No fue posible reasignar por exceso de plazas en ${centro.centro}`,
                centroAsignado: asignacion.centro || centro.centro,
                localidad: asignacion.localidad || centro.localidad,
                municipio: asignacion.municipio || centro.municipio,
                fechaHistorico: new Date().toISOString(),
                timestamp: Date.now()
              };
              
              await setDoc(historialRef, datosHistorial);
              
              // Crear una nueva solicitud pendiente para intentar reasignar
              // Excluir el centro donde hubo exceso para evitar circular
              // Primero verificar si ya existe una solicitud con este orden
              const solicitudQuery = query(
                collection(db, "solicitudesPendientes"),
                where("orden", "==", asignacion.order)
              );
              const solicitudSnapshot = await getDocs(solicitudQuery);
              
              if (solicitudSnapshot.empty) {
                // Consultar el historial para recuperar los centros originales
                const historialQuery = query(
                  collection(db, "historialSolicitudes"),
                  where("orden", "==", asignacion.order),
                  where("estado", "==", "ASIGNADA")
                );
                const historialSnapshot = await getDocs(historialQuery);
                
                // Recuperar centros de preferencia originales
                let centrosIds = [];
                if (!historialSnapshot.empty) {
                  const historialData = historialSnapshot.docs[0].data();
                  centrosIds = historialData.centrosIds || [];
                }
                
                // Si no se encontraron centros, usar el centro original y buscar otros disponibles
                if (!centrosIds.length) {
                  // Buscar centros con disponibilidad para agregar a la solicitud
                  centrosIds = centrosConDisponibilidad
                    .filter(c => c.asignadas < c.plazas)
                    .map(c => c.id);
                }
                
                // Filtrar para eliminar el centro problemático
                centrosIds = centrosIds.filter(id => id !== centro.id);
                
                // Solo crear solicitud si hay centros a los que se pueda reasignar
                if (centrosIds.length > 0) {
                  const nuevaSolicitudRef = doc(collection(db, "solicitudesPendientes"));
                  await setDoc(nuevaSolicitudRef, {
                    orden: asignacion.order,
                    centrosIds: centrosIds,
                    timestamp: Date.now(),
                    recuperado: true,
                    centroOriginal: centro.centro
                  });
                  solicitudesRecuperadas++;
                  console.log(`Solicitud ${asignacion.order} recuperada como pendiente con ${centrosIds.length} centros alternativos`);
                }
              }
            } catch (error) {
              console.error(`Error al crear solicitud pendiente para orden ${asignacion.order}:`, error);
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
