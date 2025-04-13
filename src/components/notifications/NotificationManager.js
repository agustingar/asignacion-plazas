import React, { useState, useMemo, useEffect } from 'react';
import { doc, updateDoc, writeBatch, collection, addDoc, getDocs, query, where, orderBy, limit, getDoc } from 'firebase/firestore';
import { Pagination } from '@mui/material';

/**
 * Componente para gestionar las notificaciones y estado de las solicitudes
 * @param {Object} props - Propiedades del componente
 * @param {Array} props.feedbackSolicitudes - Lista de feedback con su estado
 * @param {Object} props.db - Referencia a la base de datos Firestore
 * @param {Function} props.showNotification - Función para mostrar notificaciones
 * @param {Function} props.setInternalProcessingMessage - Función para mostrar mensajes de procesamiento
 * @param {Function} props.recargarDatos - Función para recargar datos
 * @returns {JSX.Element} Componente de gestión de notificaciones
 */
const NotificationManager = ({
  feedbackSolicitudes = [],
  db,
  showNotification,
  setInternalProcessingMessage,
  recargarDatos
}) => {
  const [estadoFilter, setEstadoFilter] = useState('todos');
  const [ordenFecha, setOrdenFecha] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [mensajeDashboard, setMensajeDashboard] = useState('');
  const [enviandoMensaje, setEnviandoMensaje] = useState(false);
  const [mensajeActualId, setMensajeActualId] = useState('');

  // Cargar el mensaje actual al iniciar
  useEffect(() => {
    cargarMensajeActual();
  }, []);

  // Función para cargar el mensaje actual del dashboard
  const cargarMensajeActual = async () => {
    try {
      setInternalProcessingMessage("Cargando mensaje actual...");
      
      // Intentar cargar desde config/general primero
      try {
        const configRef = doc(db, 'config', 'general');
        const configSnapshot = await getDoc(configRef);
        
        if (configSnapshot.exists()) {
          const configData = configSnapshot.data();
          // Verificar primero mensajeDashboard y luego notificationText
          if (configData.mensajeDashboard || configData.notificationText) {
            // Priorizar mensajeDashboard sobre notificationText
            const mensaje = configData.mensajeDashboard || configData.notificationText || '';
            setMensajeDashboard(mensaje);
            setMensajeActualId('config_general');
            setInternalProcessingMessage("");
            return;
          }
        }
      } catch (configError) {
        console.error("Error al cargar mensaje desde config:", configError);
        // Continuar intentando el otro método
      }
      
      // Si no se encontró en config, buscar en mensajes_dashboard
      const mensajesQuery = query(
        collection(db, 'mensajes_dashboard'),
        where('estado', '==', 'activo')
      );
      
      const mensajesSnapshot = await getDocs(mensajesQuery);
      
      if (!mensajesSnapshot.empty) {
        // Ordenar manualmente por fecha (más reciente primero)
        const mensajes = mensajesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Ordenar por fecha (más reciente primero)
        mensajes.sort((a, b) => {
          const fechaA = a.fecha ? new Date(a.fecha) : new Date(0);
          const fechaB = b.fecha ? new Date(b.fecha) : new Date(0);
          return fechaB - fechaA;
        });
        
        // Tomar el primero (más reciente)
        const mensajeMasReciente = mensajes[0];
        setMensajeDashboard(mensajeMasReciente.mensaje || '');
        setMensajeActualId(mensajeMasReciente.id);
      }
    } catch (error) {
      console.error("Error al cargar mensaje actual:", error);
      showNotification(`Error al cargar mensaje: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };

  // Función para actualizar el estado del feedback
  const handleUpdateEstado = async (feedbackId, nuevoEstado) => {
    try {
      setInternalProcessingMessage("Actualizando estado...");
      const feedbackRef = doc(db, 'feedback', feedbackId);
      await updateDoc(feedbackRef, {
        status: nuevoEstado,
        timestamp: new Date().toISOString()
      });
      showNotification("Estado actualizado correctamente", "success");
    } catch (error) {
      console.error("Error al actualizar estado:", error);
      showNotification(`Error al actualizar estado: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };

  // Filtrar y ordenar feedback según el estado y fecha
  const feedbackFiltrado = useMemo(() => {
    let filtrado = feedbackSolicitudes.filter(feedback => {
      if (estadoFilter === 'todos') return true;
      const estadoFeedback = (feedback.status || 'pendiente').toLowerCase();
      return estadoFeedback === estadoFilter.toLowerCase();
    });

    filtrado.sort((a, b) => {
      const fechaA = new Date(a.timestamp || 0);
      const fechaB = new Date(b.timestamp || 0);
      return ordenFecha === 'asc' ? fechaA - fechaB : fechaB - fechaA;
    });

    return filtrado;
  }, [feedbackSolicitudes, estadoFilter, ordenFecha]);

  // Función para enviar mensaje al dashboard
  const handleEnviarMensaje = async () => {
    if (!mensajeDashboard.trim()) {
      showNotification('Por favor, escriba un mensaje', 'error');
      return;
    }

    setEnviandoMensaje(true);
    try {
      const batch = writeBatch(db);
      const mensajeTrimmed = mensajeDashboard.trim();
      
      if (mensajeActualId === 'config_general') {
        // Actualizar en la colección config/general
        const configRef = doc(db, 'config', 'general');
        batch.update(configRef, {
          mensajeDashboard: mensajeTrimmed,
          notificationText: mensajeTrimmed,
          mensajeDashboardFecha: new Date().toISOString()
        });
      } else if (mensajeActualId) {
        // Actualizar mensaje existente en mensajes_dashboard
        const mensajeRef = doc(db, 'mensajes_dashboard', mensajeActualId);
        batch.update(mensajeRef, {
          mensaje: mensajeTrimmed,
          fecha: new Date().toISOString()
        });
        
        // También actualizar en config/general para máxima compatibilidad
        const configRef = doc(db, 'config', 'general');
        batch.set(configRef, {
          mensajeDashboard: mensajeTrimmed,
          notificationText: mensajeTrimmed,
          mensajeDashboardFecha: new Date().toISOString()
        }, { merge: true });
      } else {
        // Crear nuevo mensaje en config/general
        const configRef = doc(db, 'config', 'general');
        batch.set(configRef, {
          mensajeDashboard: mensajeTrimmed,
          notificationText: mensajeTrimmed,
          mensajeDashboardFecha: new Date().toISOString()
        }, { merge: true });
      }
      
      await batch.commit();
      showNotification('Mensaje guardado con éxito', 'success');
      recargarDatos();
      cargarMensajeActual(); // Recargar después de actualizar
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      showNotification('Error al enviar mensaje: ' + error.message, 'error');
    } finally {
      setEnviandoMensaje(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '20px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        marginBottom: '20px'
      }}>
        <h3 style={{ marginTop: 0, color: '#2c3e50', marginBottom: '15px' }}>
          Estado de Feedback
        </h3>
        
        <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
          <select
            value={estadoFilter}
            onChange={(e) => setEstadoFilter(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              width: '200px'
            }}
          >
            <option value="todos">Todos los estados</option>
            <option value="completado">Completados</option>
            <option value="pendiente">Pendientes</option>
            <option value="en_proceso">En proceso</option>
            <option value="rechazada">Rechazados</option>
          </select>

          <select
            value={ordenFecha}
            onChange={(e) => setOrdenFecha(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              width: '200px'
            }}
          >
            <option value="desc">Más recientes primero</option>
            <option value="asc">Más antiguos primero</option>
          </select>
        </div>
        
        <div style={{ 
          maxHeight: '400px', 
          overflowY: 'auto', 
          border: '1px solid #eee',
          borderRadius: '5px'
        }}>
          {feedbackFiltrado.length === 0 ? (
            <div style={{ 
              padding: '20px', 
              textAlign: 'center', 
              color: '#666' 
            }}>
              No hay feedback para mostrar
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Fecha</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Número de Orden</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Mensaje</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Estado</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {feedbackFiltrado.map((feedback, idx) => {
                  const fecha = feedback.timestamp ? new Date(feedback.timestamp) : new Date();
                  const fechaFormateada = fecha.toLocaleDateString() + ' ' + 
                                        fecha.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                  
                  let estadoEstilo = {
                    backgroundColor: '#f8f9fa',
                    color: '#666'
                  };
                  
                  const estado = feedback.status || 'pendiente';
                  
                  if (estado === 'completado') {
                    estadoEstilo = {
                      backgroundColor: '#e8f5e9',
                      color: '#2e7d32'
                    };
                  } else if (estado === 'pendiente') {
                    estadoEstilo = {
                      backgroundColor: '#fff3e0',
                      color: '#ef6c00'
                    };
                  } else if (estado === 'en_proceso') {
                    estadoEstilo = {
                      backgroundColor: '#e3f2fd',
                      color: '#1565c0'
                    };
                  } else if (estado === 'rechazada') {
                    estadoEstilo = {
                      backgroundColor: '#ffebee',
                      color: '#c62828'
                    };
                  }
                  
                  return (
                    <tr key={`feedback-${idx}`} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '10px' }}>{fechaFormateada}</td>
                      <td style={{ padding: '10px' }}>{feedback.orderNumber || 'N/A'}</td>
                      <td style={{ padding: '10px' }}>{feedback.feedback || 'Sin mensaje'}</td>
                      <td style={{ padding: '10px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          borderRadius: '3px',
                          fontSize: '12px',
                          ...estadoEstilo
                        }}>
                          {estado.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '10px' }}>
                        <select
                          value={estado}
                          onChange={(e) => handleUpdateEstado(feedback.id, e.target.value)}
                          style={{
                            padding: '5px',
                            borderRadius: '4px',
                            border: '1px solid #ddd'
                          }}
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="en_proceso">En proceso</option>
                          <option value="completado">Completado</option>
                          <option value="rechazada">Rechazado</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Sección de Mensajes del Dashboard */}
      <div style={{ 
        marginTop: '20px', 
        marginBottom: '20px', 
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '20px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)'
      }}>
        <h3 style={{ marginTop: 0, color: '#2c3e50', marginBottom: '15px' }}>Mensaje del Dashboard</h3>
        <div style={{ 
          padding: '10px',
          border: '1px solid #eee',
          backgroundColor: '#f9f9f9',
          borderRadius: '5px',
          marginBottom: '15px'
        }}>
          <p style={{ margin: 0, fontWeight: 'bold' }}>
            Estado: {mensajeActualId ? 'Mensaje activo' : 'No hay mensaje activo'}
          </p>
          {mensajeActualId && (
            <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
              Este mensaje está actualmente visible en el dashboard
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <textarea
            value={mensajeDashboard}
            onChange={(e) => setMensajeDashboard(e.target.value)}
            placeholder="Escriba un mensaje para el dashboard..."
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '10px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              resize: 'vertical'
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {mensajeActualId ? (
              <button
                onClick={() => {
                  setMensajeDashboard('');
                  setMensajeActualId('');
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Limpiar
              </button>
            ) : null}
          </div>
          <button
            onClick={handleEnviarMensaje}
            disabled={!mensajeDashboard.trim() || enviandoMensaje}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              opacity: !mensajeDashboard.trim() || enviandoMensaje ? 0.5 : 1
            }}
          >
            {enviandoMensaje ? 'Guardando...' : mensajeActualId ? 'Actualizar Mensaje' : 'Enviar Mensaje'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationManager; 