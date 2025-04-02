import React, { useState } from 'react';
import { writeBatch, doc, collection, serverTimestamp } from "firebase/firestore";

/**
 * Componente que muestra el panel de administración
 * @param {Object} props - Propiedades del componente
 * @param {Array} props.assignments - Lista de asignaciones
 * @param {Array} props.availablePlazas - Lista de centros/plazas disponibles
 * @param {Array} props.solicitudes - Lista de solicitudes pendientes
 * @param {Function} props.procesarTodasLasSolicitudes - Función para procesar todas las solicitudes
 * @param {Function} props.procesarSolicitudesPorMinuto - Función para procesar la siguiente solicitud pendiente
 * @param {Function} props.cargarDatosDesdeFirebase - Función para recargar datos desde Firebase
 * @param {Function} props.eliminarSolicitudesDuplicadas - Función para eliminar solicitudes duplicadas
 * @param {Function} props.limpiarDuplicadosHistorial - Función para limpiar duplicados del historial
 * @param {Object} props.db - Referencia a la base de datos Firestore
 * @param {boolean} props.loadingProcess - Indica si hay un proceso en curso
 * @param {string} props.processingMessage - Mensaje del proceso en curso
 * @param {Function} props.showNotification - Función para mostrar notificaciones
 * @param {Date} props.lastProcessed - Fecha del último procesamiento
 * @param {Function} props.procesarSolicitudes - Función para procesar solicitudes individualmente
 * @returns {JSX.Element} - Componente Admin
 */
const Admin = ({ 
  assignments = [], 
  availablePlazas = [], 
  solicitudes = [],
  procesarTodasLasSolicitudes,
  procesarSolicitudesPorMinuto,
  cargarDatosDesdeFirebase,
  eliminarSolicitudesDuplicadas,
  limpiarDuplicadosHistorial,
  db,
  loadingProcess,
  processingMessage,
  showNotification,
  lastProcessed,
  procesarSolicitudes
}) => {
  // Estados para el componente
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminAuthAttempted, setAdminAuthAttempted] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchTermSolicitudes, setSearchTermSolicitudes] = useState('');
  const [internalProcessingMessage, setInternalProcessingMessage] = useState('');
  
  // Si no está autenticado, mostrar formulario de login
  if (!isAdminAuthenticated) {
    return (
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '20px',
        fontFamily: 'Arial, sans-serif',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        flexDirection: 'column'
      }}>
        <h1 style={{ marginBottom: '30px', color: '#2c3e50' }}>Panel de Administración</h1>
        
        <div style={{ 
          backgroundColor: 'white', 
          padding: '30px', 
          borderRadius: '10px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '400px'
        }}>
          <h2 style={{ textAlign: 'center', marginBottom: '25px' }}>Autenticación Requerida</h2>
          
          {adminAuthAttempted && (
            <div style={{
              backgroundColor: '#f8d7da',
              color: '#721c24',
              padding: '10px',
              borderRadius: '5px',
              marginBottom: '15px',
              textAlign: 'center'
            }}>
              Contraseña incorrecta. Inténtalo de nuevo.
            </div>
          )}
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Contraseña de Administrador:
            </label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '16px'
              }}
              placeholder="Ingrese la contraseña"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (adminPassword === 'SoyAdmin') {
                    setIsAdminAuthenticated(true);
                  } else {
                    setAdminAuthAttempted(true);
                  }
                }
              }}
            />
          </div>
          
          <button
            onClick={() => {
              if (adminPassword === 'SoyAdmin') {
                setIsAdminAuthenticated(true);
              } else {
                setAdminAuthAttempted(true);
              }
            }}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Acceder
          </button>
          
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <a 
              href="/"
              style={{
                color: '#3498db',
                textDecoration: 'none'
              }}
            >
              Volver a la página principal
            </a>
          </div>
        </div>
      </div>
    );
  }
  
  // Funciones del componente
  const handleReasignar = async (assignment) => {
    try {
      // Validar la asignación
      if (!assignment) {
        showNotification("Error: Asignación no válida", "error");
        return;
      }
      
      // Mostrar mensaje de procesamiento
      setInternalProcessingMessage("Procesando reasignación...");
      
      // Validar y extraer docId
      if (!assignment.docId) {
        console.warn("Advertencia: La asignación no tiene docId válido:", assignment);
        showNotification("Error: La asignación no tiene un identificador válido", "error");
        setInternalProcessingMessage("");
        return;
      }
      
      // Asegurar que hay un número de orden válido
      if (!assignment.order && !assignment.numeroOrden) {
        showNotification("Error: No se pudo obtener el número de orden", "error");
        setInternalProcessingMessage("");
        return;
      }
      
      const ordenAsignacion = assignment.numeroOrden || assignment.order;
      
      // Crear una solicitud pendiente
      const nuevaSolicitud = {
        orden: ordenAsignacion,
        centrosIds: Array.isArray(assignment.centrosIds) 
          ? assignment.centrosIds 
          : (assignment.centerId ? [assignment.centerId] : []),
        timestamp: serverTimestamp()
      };
      
      console.log("Nueva solicitud a crear:", nuevaSolicitud);
      
      // Usar writeBatch para la transacción
      const batch = writeBatch(db);
      
      // Añadir la nueva solicitud pendiente
      const solicitudRef = doc(collection(db, "solicitudesPendientes"));
      batch.set(solicitudRef, nuevaSolicitud);
      
      // Eliminar la asignación existente
      const asignacionRef = doc(db, "asignaciones", assignment.docId);
      batch.delete(asignacionRef);
      
      // Crear registro de historial
      const ahora = new Date();
      const historialData = {
        orden: ordenAsignacion,
        estado: "REASIGNANDO",
        mensaje: "Reasignación manual desde el panel de administración",
        fechaHistorico: ahora.toISOString(),
        timestamp: ahora.getTime()
      };
      
      // Agregar centroAnterior solo si hay un centerId o centro válido
      if (assignment.centerId) {
        historialData.centroAnterior = assignment.centerId;
      } else if (assignment.centro && typeof assignment.centro === 'string') {
        historialData.centroAnterior = assignment.centro;
      }
      
      console.log("Datos de historial a crear:", historialData);
      
      // Añadir al historial
      const historialRef = doc(collection(db, "historialSolicitudes"));
      batch.set(historialRef, historialData);
      
      // Ejecutar todos los cambios
      await batch.commit();
      
      // Limpiar mensaje de procesamiento
      setInternalProcessingMessage("");
      
      // Recargar datos
      await cargarDatosDesdeFirebase();
      showNotification(`Asignación para orden ${ordenAsignacion} movida a solicitudes pendientes`, "success");
    } catch (error) {
      console.error("Error al reasignar:", error);
      setInternalProcessingMessage("");
      showNotification(`Error al reasignar: ${error.message}`, "error");
    }
  };

  // Función para buscar información del centro
  const encontrarCentro = (assignment) => {
    // Validar que la asignación no sea undefined o null
    if (!assignment) {
      console.warn("encontrarCentro: assignment es undefined o null");
      return {
        id: "desconocido",
        nombre: "Centro desconocido",
        plazas: 0,
        asignadas: 0,
        municipio: "",
        localidad: ""
      };
    }
    
    // Buscar info del centro para mostrar plazas disponibles
    let centroInfo = null;
    
    try {
      // 1. Intentar usar la referencia guardada si existe
      if (assignment.centroAsociado) {
        centroInfo = assignment.centroAsociado;
      } 
      // 2. Intentar buscar por id
      else if (assignment.centerId && availablePlazas && Array.isArray(availablePlazas)) {
        centroInfo = availablePlazas.find(c => c && c.id === assignment.centerId);
      }
      // 3. Intentar buscar por nombre
      if (!centroInfo && assignment.nombreCentro && assignment.nombreCentro !== "Centro no encontrado" && availablePlazas && Array.isArray(availablePlazas)) {
        // Normalizar para búsqueda
        const nombreBusqueda = assignment.nombreCentro.toLowerCase();
        
        // Buscar por nombre exacto
        centroInfo = availablePlazas.find(c => 
          (c && c.nombre && c.nombre.toLowerCase() === nombreBusqueda) || 
          (c && c.centro && c.centro.toLowerCase() === nombreBusqueda)
        );
        
        // Si no se encuentra, intentar buscar sin acentos y en minúsculas
        if (!centroInfo) {
          try {
            const nombreNormalizado = nombreBusqueda
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            centroInfo = availablePlazas.find(c => {
              if (!c || (!c.nombre && !c.centro)) return false;
              
              const nombreCentroNormalizado = (c.nombre || c.centro || "")
                .toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              
              return nombreCentroNormalizado === nombreNormalizado;
            });
          } catch (error) {
            console.error("Error al normalizar nombre:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error en la búsqueda de centro:", error);
    }
    
    // 5. Crear objeto por defecto si no se encontró
    if (!centroInfo) {
      centroInfo = {
        id: assignment.centerId || "desconocido",
        nombre: assignment.nombreCentro || assignment.centerName || "Centro desconocido",
        plazas: 0,
        asignadas: 0,
        municipio: assignment.municipio || '',
        localidad: assignment.localidad || ''
      };
    }
    
    return centroInfo;
  };
  
  // Renderizar el panel de administración
  return (
    <div style={{
      maxWidth: '1280px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{ textAlign: 'center', marginBottom: '20px' }}>Panel de Administración</h1>
      
      {/* Información del panel de administración */}
      <div style={{ 
        backgroundColor: '#f8f9fa', 
        padding: '15px', 
        borderRadius: '10px',
        marginBottom: '20px',
        textAlign: 'center',
        border: '1px solid #e9ecef'
      }}>
        <h3 style={{ marginTop: 0, color: '#2c3e50' }}>Bienvenido al Panel de Administración</h3>
        <p>
          Desde aquí puede gestionar las solicitudes pendientes sin que aparezca la pantalla de mantenimiento
          para los usuarios del sistema. Puede procesar todas las solicitudes a la vez o una por una.
        </p>
        <p style={{ fontWeight: 'bold', color: '#3498db' }}>
          El sistema procesa solicitudes por orden de prioridad, desplazando asignaciones si es necesario.
        </p>
      </div>
      
      {/* Acciones administrativas */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '20px', 
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        marginBottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '15px'
      }}>
        <h2>Acciones de Administración</h2>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '15px'
        }}>
          {/* Botón para eliminar duplicados */}
          <button
            onClick={async () => {
              // Primero eliminar duplicados en solicitudes
              await eliminarSolicitudesDuplicadas();
              // Luego eliminar duplicados en historial
              await limpiarDuplicadosHistorial();
              showNotification("Duplicados eliminados correctamente", "success");
            }}
            style={{
              padding: '15px 20px',
              backgroundColor: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}
            disabled={loadingProcess}
          >
            <span>🗑️</span> Eliminar Duplicados
          </button>
          
          {/* Botón para reasignar plazas por orden */}
          <button
            onClick={() => procesarTodasLasSolicitudes({respetarAsignacionesExistentes: false})}
            style={{
              padding: '15px 20px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: assignments.length > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              opacity: assignments.length > 0 ? 1 : 0.6
            }}
            disabled={assignments.length === 0 || loadingProcess}
          >
            <span>🔄</span> Reasignar Plazas por Orden
          </button>
          
          {/* Botón para procesar siguiente */}
          <button
            onClick={procesarSolicitudesPorMinuto}
            style={{
              padding: '15px 20px',
              backgroundColor: '#2ecc71',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: assignments.length > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              opacity: assignments.length > 0 ? 1 : 0.6
            }}
            disabled={assignments.length === 0 || loadingProcess}
          >
            <span>▶️</span> Procesar Siguiente Solicitud
          </button>
        </div>
      </div>
      
      {processingMessage && (
        <div style={{ 
          marginTop: '15px', 
          padding: '15px', 
          backgroundColor: '#f8f9fa',
          borderRadius: '5px', 
          fontStyle: 'italic',
          marginBottom: '20px',
          textAlign: 'center',
          border: '1px solid #e9ecef',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <strong>Estado:</strong> {processingMessage || internalProcessingMessage}
          </div>
          <button
            onClick={async () => {
              setInternalProcessingMessage("Recargando datos...");
              const success = await cargarDatosDesdeFirebase();
              setInternalProcessingMessage(success ? "Datos recargados correctamente" : "Error al recargar datos");
              
              // Limpiar mensaje después de un tiempo
              setTimeout(() => {
                setInternalProcessingMessage("");
              }, 2000);
            }}
            style={{
              padding: '5px 10px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            🔄 Recargar datos
          </button>
        </div>
      )}
      
      {/* Sección de asignaciones actuales */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '20px', 
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        marginBottom: '20px'
      }}>
        <h2>Asignaciones Actuales</h2>
        
        <div style={{ 
          marginBottom: '15px', 
          padding: '10px 15px', 
          borderRadius: '5px', 
          backgroundColor: '#e8f4f8', 
          fontSize: '14px',
          border: '1px solid #c8e1e9',
          color: '#2980b9'
        }}>
          <strong>Información:</strong> El botón "Reasignar" convierte una asignación actual en una solicitud pendiente, permitiendo que se reasigne a otro centro si hay mejor opción disponible.
        </div>
        
        {/* Buscador de asignaciones */}
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            placeholder="Buscar por número de orden o centro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              marginBottom: '10px'
            }}
          />
        </div>
        
        {assignments.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Orden</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Centro Asignado</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Plazas Disponibles</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {assignments
                .sort((a, b) => {
                  const orderA = a.numeroOrden || a.order || 0;
                  const orderB = b.numeroOrden || b.order || 0;
                  return Number(orderA) - Number(orderB);
                })
                .filter(assignment => {
                  const searchTermLower = searchTerm.toLowerCase();
                  const orderStr = (assignment.numeroOrden || assignment.order || "").toString();
                  const centerName = assignment.nombreCentro || assignment.centerName || "";
                  
                  return (
                    orderStr.includes(searchTermLower) ||
                    centerName.toLowerCase().includes(searchTermLower)
                  );
                })
                .map((assignment, index) => {
                  // Buscar info del centro
                  const centroInfo = encontrarCentro(assignment);
                  
                  const plazasDisponibles = Math.max(0, (centroInfo.plazas || 0) - (centroInfo.asignadas || 0));
                  const plazasTotal = centroInfo.plazas || 0;
                  
                  return (
                    <tr key={assignment.docId || `assignment-${index}`} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px' }}>{assignment.numeroOrden || assignment.order}</td>
                      <td style={{ padding: '10px' }}>{assignment.nombreCentro || assignment.centerName}</td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ 
                          padding: '5px',
                          borderRadius: '3px',
                          border: '1px solid #e6f2ff'
                        }}>
                          <div style={{ 
                            display: 'flex',
                            fontSize: '13px',
                            justifyContent: 'center',
                            gap: '5px'
                          }}>
                            <span style={{ 
                              color: plazasDisponibles > 0 ? '#2ecc71' : '#e74c3c',
                              fontWeight: 'bold'
                            }}>
                              {plazasDisponibles}
                            </span> 
                            <span>disponibles de</span> 
                            <span>{plazasTotal}</span>
                          </div>
                          {centroInfo.municipio && (
                            <div style={{
                              fontSize: '12px', 
                              color: '#718096',
                              marginTop: '3px',
                              textAlign: 'center'
                            }}>
                              {centroInfo.municipio}
                              {centroInfo.localidad && centroInfo.localidad !== centroInfo.municipio && ` (${centroInfo.localidad})`}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <button 
                          onClick={() => handleReasignar(assignment)}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: '#f39c12',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                          disabled={loadingProcess}
                        >
                          Reasignar
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        ) : (
          <p>No hay asignaciones.</p>
        )}
      </div>
      
      {/* Lista de solicitudes pendientes - con buscador */}
      <div style={{ 
        backgroundColor: 'white', 
        padding: '20px', 
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        marginBottom: '20px'
      }}>
        <h2>Solicitudes Pendientes</h2>
        
        {/* Buscador de solicitudes */}
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            placeholder="Buscar por número de orden..."
            value={searchTermSolicitudes}
            onChange={(e) => setSearchTermSolicitudes(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              marginBottom: '10px'
            }}
          />
        </div>
        
        {solicitudes.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Orden</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Centros Solicitados</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Plazas Disponibles</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {solicitudes
                .sort((a, b) => Number(a.orden) - Number(b.orden))
                .filter(solicitud => {
                  const searchTermLower = searchTermSolicitudes.toLowerCase();
                  return String(solicitud.orden).includes(searchTermLower);
                })
                .map(solicitud => {
                  return (
                    <tr key={solicitud.docId} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px' }}>{solicitud.orden}</td>
                      <td style={{ padding: '10px' }}>
                        {solicitud.centrosIds.map((centroId, index) => {
                          // Buscar información del centro seleccionado
                          let centro = availablePlazas.find(p => p.id === centroId);
                          
                          // 1. Búsqueda exacta por ID
                          if (!centro) {
                            centro = availablePlazas.find(p => p.id === centroId);
                          }
                          
                          // 2. Por nombre normalizado
                          if (!centro && typeof centroId === 'string' && centroId.length > 5) {
                            const nombreBusqueda = centroId.toLowerCase()
                              .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                            
                            centro = availablePlazas.find(c => {
                              const nombreCentro = (c.nombre || c.centro || "").toLowerCase()
                                .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                              return nombreCentro === nombreBusqueda;
                            });
                          }
                          
                          // 3. Coincidencia parcial
                          if (!centro && typeof centroId === 'string' && centroId.length > 5) {
                            const nombreParcial = centroId.toLowerCase();
                            const coincidenciaParcial = availablePlazas.find(c => 
                              (c.nombre && c.nombre.toLowerCase().includes(nombreParcial)) || 
                              (c.centro && c.centro.toLowerCase().includes(nombreParcial))
                            );
                            
                            if (coincidenciaParcial) {
                              centro = coincidenciaParcial;
                            }
                          }
                          
                          if (!centro) {
                            centro = { 
                              plazas: 0, 
                              plazasTotal: 0,
                              asignadas: 0,
                              plazasDisponibles: 0 
                            };
                          }
                          
                          // Calcular plazas de manera consistente
                          const plazasTotal = centro.plazasTotal || centro.plazas || 0;
                          const plazasOcupadas = centro.asignadas || centro.plazasOcupadas || 0;
                          const plazasDisponibles = centro.plazasDisponibles || Math.max(0, plazasTotal - plazasOcupadas);
                          
                          return (
                            <div key={centroId} style={{ 
                              marginBottom: index < solicitud.centrosIds.length - 1 ? '5px' : '0',
                              padding: '5px',
                              backgroundColor: index === 0 ? '#f2f9ff' : 'transparent',
                              borderRadius: '3px',
                              border: '1px solid #e6f2ff'
                            }}>
                              <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                                {centro.nombre || "Centro desconocido"}
                              </div>
                              <div style={{ 
                                display: 'flex',
                                marginTop: '3px',
                                fontSize: '13px',
                                justifyContent: 'center',
                                gap: '5px'
                              }}>
                                <span style={{ 
                                  color: plazasDisponibles > 0 ? '#2ecc71' : '#e74c3c',
                                  fontWeight: 'bold'
                                }}>
                                  {plazasDisponibles}
                                </span> 
                                <span>disponibles de</span> 
                                <span>{plazasTotal}</span>
                              </div>
                            </div>
                          );
                        })}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <button 
                          onClick={() => {
                            // Procesar esta solicitud individualmente
                            const solicitudesArray = [solicitud];
                            procesarSolicitudes(
                              solicitudesArray, 
                              [], // No tocar asignaciones existentes
                              availablePlazas,
                              setInternalProcessingMessage
                            ).then(async () => {
                              // Recargar datos desde Firebase
                              await cargarDatosDesdeFirebase();
                              showNotification(`Solicitud ${solicitud.orden} procesada`, "success");
                            });
                          }}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: '#3498db',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                          }}
                          disabled={loadingProcess}
                        >
                          Procesar
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        ) : (
          <p>No hay solicitudes pendientes.</p>
        )}
      </div>
      
      {/* Enlaces de navegación */}
      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <a 
          href="/" 
          style={{
            padding: '10px 20px',
            backgroundColor: '#f8f9fa',
            color: '#333',
            textDecoration: 'none',
            borderRadius: '5px',
            fontWeight: 'bold'
          }}
        >
          Volver a la página principal
        </a>
      </div>
      
      {/* Información de estado */}
      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '5px', 
        textAlign: 'center',
        fontSize: '14px',
        color: '#666'
      }}>
        <p>
          Plazas asignadas: {assignments.length} / 
          Plazas totales: {availablePlazas.reduce((total, centro) => total + (centro.plazas || centro.plazasTotal || 0), 0)} / 
          Plazas disponibles: {availablePlazas.reduce((total, centro) => total + (centro.plazasDisponibles || Math.max(0, (centro.plazas || 0) - (centro.asignadas || 0))), 0)}
        </p>
        <p>Centros disponibles: {availablePlazas.length}</p>
        <p>Última actualización: {lastProcessed && typeof lastProcessed.getTime === 'function' ? lastProcessed.toLocaleString() : 'No disponible'}</p>
      </div>
    </div>
  );
};

export default Admin; 