import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';

// Importar componentes modulares
import AdminAuth from './auth/AdminAuth';
import AssignmentManager from './assignments/AssignmentManager';
import RequestManager from './requests/RequestManager';
import CenterManager from './centers/CenterManager';
import NotificationManager from './notifications/NotificationManager';

/**
 * Componente principal del panel de administración
 * @param {Object} props - Propiedades del componente
 * @param {Array} props.assignments - Lista de asignaciones
 * @param {Array} props.availablePlazas - Lista de centros disponibles
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
 * @param {Function} props.actualizarDatosManualmente - Función para actualizar datos manualmente
 * @param {boolean} props.isLoading - Indica si está cargando datos
 * @param {Function} props.handleReasignar - Función para reasignar una asignación
 * @param {Function} props.eliminarAsignacion - Función para eliminar una asignación
 * @returns {JSX.Element} Componente Admin
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
  procesarSolicitudes,
  actualizarDatosManualmente,
  isLoading,
  handleReasignar,
  eliminarAsignacion
}) => {
  // Estados
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('solicitudes');
  const [internalProcessingMessage, setInternalProcessingMessage] = useState('');
  const [solicitudesData, setSolicitudesData] = useState([]);
  const [feedbackData, setFeedbackData] = useState([]);
  const [showReasignacionModal, setShowReasignacionModal] = useState(false);
  const [asignacionSeleccionada, setAsignacionSeleccionada] = useState(null);
  const [modalReasignacion, setModalReasignacion] = useState(false);
  const [centroSeleccionado, setCentroSeleccionado] = useState(null);
  const [historialSolicitudes, setHistorialSolicitudes] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Estado para el sistema de notificaciones
  const [notificaciones, setNotificaciones] = useState([]);
  const [mostrarNotificaciones, setMostrarNotificaciones] = useState(false);
  const [ultimaNotificacion, setUltimaNotificacion] = useState(null);

  // Estilo común para los botones de tabs
  const tabButtonStyle = {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    color: 'white',
    cursor: 'pointer',
    marginRight: '10px',
    fontSize: '14px',
    fontWeight: 'bold'
  };
  
  // Función para añadir notificaciones
  const addNotification = useCallback((message, type = 'info') => {
    const id = Date.now();
    const nuevaNotificacion = { id, message, type, timestamp: new Date() };
    
    setNotificaciones(prev => [...prev, nuevaNotificacion]);
    setUltimaNotificacion(nuevaNotificacion);

    // Limpiar notificación después de 5 segundos
    setTimeout(() => {
      setNotificaciones(prev => prev.filter(n => n.id !== id));
    }, 5000);
  }, []);

  // Cargar datos al montar el componente
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setInternalProcessingMessage('Cargando datos...');
        
        const [solicitudesSnapshot, feedbackSnapshot] = await Promise.all([
          getDocs(collection(db, "solicitudesPendientes")),
          getDocs(collection(db, "feedback"))
        ]);

        const solicitudesData = solicitudesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        const feedbackData = feedbackSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setSolicitudesData(solicitudesData);
        setFeedbackData(feedbackData);
        
        if (solicitudesData.length > 0) {
          addNotification(`Cargadas ${solicitudesData.length} solicitudes pendientes`, 'success');
        }
      } catch (error) {
        console.error('Error al cargar datos:', error);
        addNotification('Error al cargar los datos', 'error');
      } finally {
        setInternalProcessingMessage('');
      }
    };

    cargarDatos();
  }, [db, addNotification, setInternalProcessingMessage]);

  // Efecto para recargar datos cuando se cambia a la pestaña solicitudes
  useEffect(() => {
    if (activeTab === 'solicitudes') {
      const cargarDatos = async () => {
        try {
          setInternalProcessingMessage('Cargando solicitudes pendientes...');
          
          // Obtener las solicitudes pendientes de la colección solicitudesPendientes
          const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
          
          // Convertir los documentos a objetos con ID
          const solicitudesData = solicitudesSnapshot.docs.map(doc => {
            const data = doc.data();
            // Verificar si la solicitud tiene la información mínima necesaria
            return {
              id: doc.id,
              orden: data.orden || data.numeroOrden,
              centrosIds: data.centrosIds || data.centrosSeleccionados || [],
              timestamp: data.timestamp || new Date().toISOString(),
              estado: data.estado || 'pendiente',
              ...data
            };
          });
          
          // Filtrar solicitudes válidas (que tengan número de orden y centros seleccionados)
          const solicitudesValidas = solicitudesData.filter(s => 
            (s.orden || s.numeroOrden) && 
            (s.centrosIds.length > 0 || (s.centrosSeleccionados && s.centrosSeleccionados.length > 0))
          );

          setSolicitudesData(solicitudesValidas);
          
          console.log(`Solicitudes cargadas: ${solicitudesValidas.length}`);
          
          if (solicitudesValidas.length > 0) {
            addNotification(`Cargadas ${solicitudesValidas.length} solicitudes pendientes`, 'success');
          } else {
            addNotification('No hay solicitudes pendientes', 'info');
          }
        } catch (error) {
          console.error('Error al cargar solicitudes:', error);
          addNotification('Error al cargar solicitudes pendientes', 'error');
        } finally {
          setInternalProcessingMessage('');
        }
      };

      cargarDatos();
    }
  }, [activeTab, db, addNotification]);

  // Si no está autenticado, mostrar el componente de autenticación
  if (!isAdminAuthenticated) {
    return <AdminAuth onAuthenticate={setIsAdminAuthenticated} />;
  }

  // Función para cargar el historial de solicitudes
  const cargarHistorialSolicitudes = async (orden) => {
    try {
      setCargandoHistorial(true);
      const historialSnapshot = await getDocs(collection(db, "historialSolicitudes"));
      const historial = historialSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(item => item.orden === orden)
        .sort((a, b) => new Date(b.fechaHistorico) - new Date(a.fechaHistorico));
      
      setHistorialSolicitudes(historial);
    } catch (error) {
      console.error('Error al cargar historial de solicitudes:', error);
      showNotification('Error al cargar el historial de solicitudes', 'error');
    } finally {
      setCargandoHistorial(false);
    }
  };

  // Función para manejar la reasignación
  const handleReasignarAsignacion = async (asignacion) => {
    try {
      if (!asignacion.docId) {
        showNotification('Error: La asignación no tiene un ID válido', 'error');
        return;
      }
      
      setAsignacionSeleccionada(asignacion);
      setModalReasignacion(true);
      
      // Cargar el historial de solicitudes
      await cargarHistorialSolicitudes(asignacion.order || asignacion.numeroOrden);

      // Crear una nueva solicitud pendiente para la reasignación
      const nuevaSolicitud = {
        orden: asignacion.order || asignacion.numeroOrden,
        centrosIds: [asignacion.centerId],
        timestamp: new Date().toISOString(),
        reasignacion: true,
        asignacionOriginalId: asignacion.docId,
        estado: "PENDIENTE_REASIGNACION"
      };

      const solicitudRef = doc(collection(db, "solicitudesPendientes"));
      await setDoc(solicitudRef, nuevaSolicitud);

      // Registrar en el historial
      const historialRef = doc(collection(db, "historialSolicitudes"));
      await setDoc(historialRef, {
        orden: asignacion.order || asignacion.numeroOrden,
        centroAnterior: asignacion.centerId,
        centroId: null,
        estado: "REASIGNACION_PENDIENTE",
        mensaje: "Solicitud de reasignación creada",
        fechaHistorico: new Date().toISOString(),
        timestamp: Date.now()
      });

      showNotification('Solicitud de reasignación creada correctamente', 'success');
    } catch (error) {
      console.error('Error al crear solicitud de reasignación:', error);
      showNotification('Error al crear la solicitud de reasignación', 'error');
    }
  };

  // Función para recuperar una solicitud
  const handleRecuperarSolicitud = async (orden) => {
    try {
      // Buscar la solicitud en el historial
      const historialSnapshot = await getDocs(collection(db, "historialSolicitudes"));
      const solicitud = historialSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .find(item => item.orden === orden && item.estado === "REASIGNACION_PENDIENTE");

      if (solicitud) {
        // Crear una nueva solicitud pendiente
        const nuevaSolicitud = {
          orden: orden,
          centrosIds: [solicitud.centroAnterior],
          timestamp: new Date().toISOString(),
          reasignacion: true,
          estado: "PENDIENTE_REASIGNACION"
        };

        const solicitudRef = doc(collection(db, "solicitudesPendientes"));
        await setDoc(solicitudRef, nuevaSolicitud);

        showNotification('Solicitud recuperada correctamente', 'success');
      } else {
        showNotification('No se encontró la solicitud en el historial', 'warning');
      }
    } catch (error) {
      console.error('Error al recuperar solicitud:', error);
      showNotification('Error al recuperar la solicitud', 'error');
    }
  };

  // Función para cerrar el modal de reasignación
  const handleCloseReasignacionModal = () => {
    setModalReasignacion(false);
    setAsignacionSeleccionada(null);
    setCentroSeleccionado(null);
  };

  // Función para eliminar una notificación
  const removeNotification = (id) => {
    setNotificaciones(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div style={{maxWidth: '1280px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif'}}>
      <div style={{ margin: '20px 0' }}>
        <h1 style={{ marginBottom: '20px' }}>Panel de Administración</h1>
        
        {/* Mensaje de procesamiento */}
        {(loadingProcess || processingMessage || internalProcessingMessage) && (
          <div style={{
            padding: '10px',
            marginBottom: '20px',
            backgroundColor: '#e3f2fd',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              border: '2px solid rgba(66, 165, 245, 0.5)',
              borderTopColor: '#42a5f5',
              animation: 'spin 1s linear infinite'
            }}></div>
            <div>{loadingProcess ? processingMessage : internalProcessingMessage}</div>
          </div>
        )}
        
        {/* Botón para recargar datos */}
        <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
          <button
            onClick={async () => {
              setInternalProcessingMessage('Recargando datos...');
              try {
                await cargarDatosDesdeFirebase();
                
                // Obtener las solicitudes pendientes
                const solicitudesSnapshot = await getDocs(collection(db, "solicitudesPendientes"));
                
                // Convertir los documentos a objetos con ID
                const solicitudesData = solicitudesSnapshot.docs.map(doc => {
                  const data = doc.data();
                  return {
                    id: doc.id,
                    orden: data.orden || data.numeroOrden,
                    centrosIds: data.centrosIds || data.centrosSeleccionados || [],
                    timestamp: data.timestamp || new Date().toISOString(),
                    estado: data.estado || 'pendiente',
                    ...data
                  };
                });
                
                // Filtrar solicitudes válidas
                const solicitudesValidas = solicitudesData.filter(s => 
                  (s.orden || s.numeroOrden) && 
                  (s.centrosIds.length > 0 || (s.centrosSeleccionados && s.centrosSeleccionados.length > 0))
                );
                
                setSolicitudesData(solicitudesValidas);
                
                if (solicitudesValidas.length > 0) {
                  addNotification(`Datos recargados: ${solicitudesValidas.length} solicitudes pendientes`, 'success');
                } else {
                  addNotification('Datos recargados. No hay solicitudes pendientes', 'info');
                }
              } catch (error) {
                console.error('Error al recargar datos:', error);
                addNotification('Error al recargar datos', 'error');
              } finally {
                setInternalProcessingMessage('');
              }
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <span style={{ fontSize: '14px' }}>↻</span>
            Recargar datos
          </button>
        </div>

        <div style={{marginBottom: '30px'}}>
          <button
            onClick={() => setActiveTab('solicitudes')}
            style={{
              ...tabButtonStyle,
              backgroundColor: activeTab === 'solicitudes' ? '#2980b9' : '#3498db'
            }}
          >
            Solicitudes Pendientes
          </button>
          <button
            onClick={() => setActiveTab('asignaciones')}
            style={{
              ...tabButtonStyle,
              backgroundColor: activeTab === 'asignaciones' ? '#2980b9' : '#3498db'
            }}
          >
            Asignaciones
          </button>
          <button
            onClick={() => setActiveTab('centros')}
            style={{
              ...tabButtonStyle,
              backgroundColor: activeTab === 'centros' ? '#2980b9' : '#3498db'
            }}
          >
            Centros
          </button>
          <button
            onClick={() => setActiveTab('notificaciones')}
            style={{
              ...tabButtonStyle,
              backgroundColor: activeTab === 'notificaciones' ? '#2980b9' : '#3498db'
            }}
          >
            Notificaciones
          </button>
        </div>
      </div>
      
      {/* Sistema de notificaciones */}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        {mostrarNotificaciones && notificaciones.map((notificacion, index) => (
          <div
            key={`notificacion-${notificacion.id}-${index}`}
            style={{
              padding: '15px',
              borderRadius: '4px',
              backgroundColor: notificacion.type === 'error' ? '#ffebee' :
                             notificacion.type === 'success' ? '#e8f5e9' :
                             notificacion.type === 'warning' ? '#fff3e0' : '#e3f2fd',
              color: notificacion.type === 'error' ? '#c62828' :
                    notificacion.type === 'success' ? '#2e7d32' :
                    notificacion.type === 'warning' ? '#e65100' : '#1565c0',
              boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              minWidth: '300px'
            }}
          >
            <span>{notificacion.message}</span>
            <button 
              onClick={() => removeNotification(notificacion.id)}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {activeTab === 'solicitudes' && (
        <RequestManager
          solicitudes={solicitudesData.length > 0 ? solicitudesData : solicitudes}
          availablePlazas={availablePlazas}
          assignments={assignments}
          onProcesarSolicitud={procesarSolicitudes}
          isLoading={loadingProcess || isLoading}
          db={db}
          showNotification={addNotification}
          setInternalProcessingMessage={setInternalProcessingMessage}
          recargarDatos={cargarDatosDesdeFirebase}
          key="request-manager"
        />
      )}

      {activeTab === 'asignaciones' && (
        <AssignmentManager
          assignments={assignments}
          availablePlazas={availablePlazas}
          onReasignar={handleReasignarAsignacion}
          onEliminar={eliminarAsignacion}
          showNotification={showNotification}
          db={db}
          recargarDatos={cargarDatosDesdeFirebase}
        />
      )}

      {activeTab === 'centros' && (
        <CenterManager
          availablePlazas={availablePlazas}
          assignments={assignments}
          db={db}
          showNotification={showNotification}
          setInternalProcessingMessage={setInternalProcessingMessage}
        />
      )}

      {activeTab === 'notificaciones' && (
        <NotificationManager
          feedbackSolicitudes={feedbackData}
          db={db}
          showNotification={showNotification}
          setInternalProcessingMessage={setInternalProcessingMessage}
        />
      )}

      {/* Modal de Reasignación */}
      {modalReasignacion && (
        <div style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', 
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            width: '80%',
            maxWidth: '800px',
            maxHeight: '80vh',
            overflow: 'auto'
          }}>
            <h2 style={{ marginBottom: '20px' }}>Reasignar Asignación</h2>
            
            {/* Información de la asignación actual */}
            <div style={{ marginBottom: '20px' }}>
              <h3>Asignación Actual</h3>
              <p><strong>Orden:</strong> {asignacionSeleccionada?.order}</p>
              <p><strong>Centro Actual:</strong> {asignacionSeleccionada?.nombreCentro}</p>
              <p><strong>Estado:</strong> {asignacionSeleccionada?.estado}</p>
            </div>

            {/* Historial de solicitudes */}
            <div style={{ marginBottom: '20px' }}>
              <h3>Historial de Solicitudes</h3>
              {cargandoHistorial ? (
                <p>Cargando historial...</p>
              ) : historialSolicitudes.length > 0 ? (
                <div style={{
                  border: '1px solid #ddd', 
                  borderRadius: '4px', 
                  padding: '10px',
                  maxHeight: '200px',
                  overflow: 'auto'
                }}>
                  {historialSolicitudes.map((solicitud, index) => (
                    <div key={`historial-${solicitud.id}-${index}`} style={{ marginBottom: '10px' }}>
                      <p><strong>Fecha:</strong> {new Date(solicitud.fechaHistorico).toLocaleString()}</p>
                      <p><strong>Estado:</strong> {solicitud.estado}</p>
                      <p><strong>Mensaje:</strong> {solicitud.mensaje}</p>
                      {solicitud.estado === "REASIGNACION_PENDIENTE" && (
                        <button
                          onClick={() => handleRecuperarSolicitud(solicitud.orden)}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginTop: '5px'
                          }}
                        >
                          Recuperar Solicitud
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p>No hay historial de solicitudes para esta asignación</p>
              )}
            </div>

            {/* Lista de centros disponibles */}
            <div style={{ marginBottom: '20px' }}>
              <h3>Centros Disponibles</h3>
              <div style={{ 
                border: '1px solid #ddd', 
                borderRadius: '4px',
                padding: '10px',
                maxHeight: '300px',
                overflow: 'auto'
              }}>
                {availablePlazas
                  .filter(centro => centro.plazasDisponibles > 0)
                  .sort((a, b) => b.plazasDisponibles - a.plazasDisponibles)
                  .map((centro, index) => (
                    <div key={`centro-${centro.id}-${index}`} style={{ marginBottom: '10px' }}>
                      <p><strong>{centro.nombre || 'Centro sin nombre'}</strong></p>
                      <p>Plazas disponibles: {centro.plazasDisponibles}</p>
                      <p>Localidad: {centro.localidad || 'Sin localidad'}</p>
                    </div>
                  ))}
              </div>
            </div>
            
            {/* Botones de acción */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              gap: '10px',
              marginTop: '20px'
            }}>
              <button 
                onClick={handleCloseReasignacionModal}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleReasignarAsignacion}
                disabled={!centroSeleccionado}
                style={{
                  padding: '8px 16px',
                  backgroundColor: centroSeleccionado ? '#4CAF50' : '#cccccc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: centroSeleccionado ? 'pointer' : 'not-allowed'
                }}
              >
                Confirmar Reasignación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
  
export default Admin; 