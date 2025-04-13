import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Pagination } from '@mui/material';

const ITEMS_PER_PAGE = 10;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

/**
 * Componente para gestionar las solicitudes pendientes
 * @param {Object} props - Propiedades del componente
 * @param {Array} props.solicitudes - Lista de solicitudes
 * @param {Array} props.availablePlazas - Lista de centros disponibles
 * @param {Array} props.assignments - Lista de asignaciones
 * @param {Function} props.onProcesarSolicitud - Función para procesar una solicitud
 * @param {boolean} props.isLoading - Indica si está cargando
 * @param {Function} [props.showNotification] - Función opcional para mostrar notificaciones
 * @param {Object} props.db - Referencia a la base de datos Firestore
 * @param {Function} props.recargarDatos - Función para recargar datos
 * @returns {JSX.Element} Componente de gestión de solicitudes
 */
const RequestManager = ({ 
  solicitudes = [], 
  availablePlazas = [], 
  assignments = [],
  onProcesarSolicitud,
  isLoading,
  showNotification,
  db,
  recargarDatos
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [notificacion, setNotificacion] = useState({ mensaje: '', tipo: '', dashboard: '' });
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState(null);
  const [solicitudReasignar, setSolicitudReasignar] = useState(null);
  const [centroSeleccionado, setCentroSeleccionado] = useState(null);
  const [dashboardMessage, setDashboardMessage] = useState('');
  const mountedRef = useRef(true);
  const notificationTimeoutRef = useRef(null);
  const lastNotificationRef = useRef(null);
  const isInitialLoadRef = useRef(true);
  const dataLoadTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const lastSolicitudesRef = useRef([]);

  // Función para mostrar notificaciones de manera segura
  const mostrarNotificacion = useCallback((mensaje, tipo = 'info', dashboard = '') => {
    if (!mountedRef.current) return;

    if (lastNotificationRef.current === mensaje) return;
    lastNotificationRef.current = mensaje;

    setNotificacion({ mensaje, tipo, dashboard });
    setDashboardMessage(dashboard);
    if (showNotification) {
      showNotification(mensaje, tipo, dashboard);
    }

    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }

    if (tipo === 'success' || tipo === 'info') {
      notificationTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) {
          setNotificacion({ mensaje: '', tipo: '', dashboard: '' });
          setDashboardMessage('');
          lastNotificationRef.current = null;
        }
      }, 3000);
    }
  }, [showNotification]);

  // Función para cargar datos con reintentos
  const cargarDatosConReintentos = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      if (recargarDatos) {
        await recargarDatos();
        retryCountRef.current = 0;
        setError(null);
      }
    } catch (error) {
      console.error('Error al cargar datos:', error);
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1;
        const delay = RETRY_DELAY * retryCountRef.current;
        mostrarNotificacion(`Error al cargar datos. Reintentando en ${delay/1000} segundos...`, 'error');
        setTimeout(cargarDatosConReintentos, delay);
      } else {
        setError('No se pudo cargar los datos después de varios intentos');
        mostrarNotificacion('Error al cargar los datos. Por favor, intente más tarde.', 'error');
      }
    }
  }, [recargarDatos, mostrarNotificacion]);

  // Verificar y mostrar información sobre solicitudes recibidas
  useEffect(() => {
    mountedRef.current = true;
    isInitialLoadRef.current = true;

    // Verificar si las solicitudes han cambiado
    const solicitudesActuales = JSON.stringify(solicitudes);
    if (solicitudesActuales !== JSON.stringify(lastSolicitudesRef.current)) {
      lastSolicitudesRef.current = solicitudes;
      
      const loadData = () => {
        if (mountedRef.current && isInitialLoadRef.current) {
          isInitialLoadRef.current = false;
          console.log(`RequestManager: Recibidas ${solicitudes.length} solicitudes`);
          
          // Verificar solicitudes incompletas
          const solicitudesIncompletas = solicitudes.filter(s => !s.dni || !s.timestamp);
          if (solicitudesIncompletas.length > 0) {
            console.log('Solicitudes incompletas encontradas:', solicitudesIncompletas.map(s => s.id));
            mostrarNotificacion(
              `Se encontraron ${solicitudesIncompletas.length} solicitudes incompletas`,
              'warning',
              'Hay solicitudes incompletas que necesitan revisión'
            );
          }

          if (solicitudes.length === 0) {
            mostrarNotificacion('No hay solicitudes pendientes disponibles', 'info', 'No hay solicitudes pendientes');
          } else {
            mostrarNotificacion(
              `${solicitudes.length} solicitudes pendientes disponibles`,
              'info',
              `${solicitudes.length} solicitudes pendientes`
            );
          }
        }
      };

      // Retrasar la carga inicial para evitar problemas de sincronización
      dataLoadTimeoutRef.current = setTimeout(loadData, 100);
    }

    // Intentar cargar datos si hay un error
    if (error) {
      cargarDatosConReintentos();
    }

    return () => {
      mountedRef.current = false;
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
      if (dataLoadTimeoutRef.current) {
        clearTimeout(dataLoadTimeoutRef.current);
      }
    };
  }, [solicitudes, mostrarNotificacion, error, cargarDatosConReintentos]);

  // Crear mapa de centros para búsqueda eficiente
  const centrosMap = useMemo(() => {
    if (!mountedRef.current) return new Map();
    
    const map = new Map();
    availablePlazas.forEach(centro => {
      if (centro.id) map.set(centro.id, centro);
      if (centro.docId) map.set(centro.docId, centro);
    });
    return map;
  }, [availablePlazas]);

  // Procesar y filtrar solicitudes
  const solicitudesProcesadas = useMemo(() => {
    if (!mountedRef.current) return [];

    const procesadas = solicitudes
      .filter(solicitud => solicitud.dni && solicitud.timestamp) // Filtrar solicitudes incompletas
      .map(solicitud => {
        const centrosIds = solicitud.centrosIds || solicitud.centrosSeleccionados || [];
        const centros = centrosIds
          .map(id => {
            const centro = centrosMap.get(id);
            if (!centro) {
              console.log(`No se encontró centro para ID: ${id}`);
              return null;
            }
            return {
              id: centro.id || centro.docId,
              nombre: centro.nombre || 'Sin nombre',
              localidad: centro.localidad || 'Sin localidad',
              municipio: centro.municipio || centro.localidad || 'Sin municipio',
              plazasDisponibles: centro.plazasDisponibles || 0,
              plazasTotal: centro.plazasTotal || 0
            };
          })
          .filter(Boolean);

        return {
          ...solicitud,
          centros,
          fecha: solicitud.fecha || solicitud.timestamp || new Date().toISOString(),
          estado: solicitud.estado || 'pendiente'
        };
      });
    
    return procesadas.sort((a, b) => {
      const ordenA = parseInt(a.orden || a.numeroOrden || 0, 10);
      const ordenB = parseInt(b.orden || b.numeroOrden || 0, 10);
      return ordenA - ordenB;
    });
  }, [solicitudes, centrosMap]);

  // Filtrar solicitudes por término de búsqueda
  const solicitudesFiltradas = useMemo(() => {
    if (!mountedRef.current) return [];
    if (!searchTerm) return solicitudesProcesadas;
    
    const searchLower = searchTerm.toLowerCase();
    return solicitudesProcesadas.filter(solicitud => 
      (solicitud.orden && solicitud.orden.toString().includes(searchTerm)) ||
      (solicitud.numeroOrden && solicitud.numeroOrden.toString().includes(searchTerm)) ||
      solicitud.centros?.some(c => 
        (c.nombre && c.nombre.toLowerCase().includes(searchLower)) ||
        (c.localidad && c.localidad.toLowerCase().includes(searchLower))
      )
    );
  }, [solicitudesProcesadas, searchTerm]);

  // Paginación
  const totalPages = Math.ceil(solicitudesFiltradas.length / ITEMS_PER_PAGE);
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const paginatedData = solicitudesFiltradas.slice(indexOfFirstItem, indexOfLastItem);

  // Función para procesar una solicitud
  const handleProcesarSolicitud = useCallback(async (solicitud) => {
    if (!mountedRef.current) return;

    if (!solicitud.centros || solicitud.centros.length === 0) {
      mostrarNotificacion('La solicitud no tiene centros seleccionados', 'error');
      return;
    }

    setProcesando(true);
    try {
      if (onProcesarSolicitud) {
        await onProcesarSolicitud(solicitud);
        mostrarNotificacion('Solicitud procesada correctamente', 'success');
        await cargarDatosConReintentos();
      } else {
        mostrarNotificacion('No se ha configurado una función para procesar solicitudes', 'error');
      }
    } catch (error) {
      console.error('Error al procesar la solicitud:', error);
      mostrarNotificacion(`Error al procesar la solicitud: ${error.message || 'Error desconocido'}`, 'error');
      setError(error);
    } finally {
      if (mountedRef.current) {
        setProcesando(false);
      }
    }
  }, [onProcesarSolicitud, cargarDatosConReintentos, mostrarNotificacion]);

  // Función para manejar la reasignación
  const handleReasignar = useCallback(async () => {
    if (!solicitudReasignar || !centroSeleccionado) {
      mostrarNotificacion('Por favor, seleccione un centro para reasignar', 'error', 'Error: Centro no seleccionado');
      return;
    }

    setProcesando(true);
    try {
      if (onProcesarSolicitud) {
        await onProcesarSolicitud({
          ...solicitudReasignar,
          centros: [centroSeleccionado],
          reasignado: true
        });
        mostrarNotificacion(
          'Solicitud reasignada correctamente',
          'success',
          `Solicitud ${solicitudReasignar.orden || solicitudReasignar.numeroOrden} reasignada a ${centroSeleccionado.nombre}`
        );
        setSolicitudReasignar(null);
        setCentroSeleccionado(null);
        await cargarDatosConReintentos();
      }
    } catch (error) {
      console.error('Error al reasignar:', error);
      mostrarNotificacion(
        `Error al reasignar: ${error.message || 'Error desconocido'}`,
        'error',
        'Error en reasignación de solicitud'
      );
    } finally {
      if (mountedRef.current) {
        setProcesando(false);
      }
    }
  }, [solicitudReasignar, centroSeleccionado, onProcesarSolicitud, mostrarNotificacion, cargarDatosConReintentos]);

  // Mostrar mensaje de carga
  if (isLoading || procesando) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ 
          padding: '20px', 
          backgroundColor: '#f5f7fa',
          borderRadius: '8px',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '36px', marginBottom: '15px' }}>⏳</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
            {procesando ? 'Procesando solicitud...' : 'Cargando solicitudes...'}
          </div>
        </div>
        
        {/* Tabla vacía para mantener la estructura */}
        <div style={{ 
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
            Solicitudes pendientes: 0
          </div>
          <button
            onClick={cargarDatosConReintentos}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
            disabled={true}
          >
            Actualizar
          </button>
        </div>
        
        {/* Tabla de solicitudes */}
        <div style={{ 
          border: '1px solid #ddd', 
          borderRadius: '5px', 
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ padding: '10px' }}>Orden</th>
                <th style={{ padding: '10px' }}>Centros</th>
                <th style={{ padding: '10px' }}>Fecha</th>
                <th style={{ padding: '10px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                  Cargando datos...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Si no hay solicitudes, mostrar tabla vacía
  if (solicitudesProcesadas.length === 0) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ 
          padding: '20px', 
          backgroundColor: '#f5f7fa',
          borderRadius: '8px',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '36px', marginBottom: '15px' }}>📭</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
            No hay solicitudes pendientes
          </div>
        </div>
        
        <div style={{ 
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}>
          <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
            Solicitudes pendientes: 0
          </div>
          <button
            onClick={cargarDatosConReintentos}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Actualizar
          </button>
        </div>
        
        {/* Filtros */}
        <div style={{ 
          display: 'flex', 
          gap: '10px', 
          marginBottom: '20px',
          alignItems: 'center'
        }}>
          <input
            type="text"
            placeholder="Buscar por orden o centro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              flex: 1
            }}
            disabled={true}
          />
        </div>
        
        {/* Tabla de solicitudes */}
        <div style={{ 
          border: '1px solid #ddd', 
          borderRadius: '5px', 
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5' }}>
                <th style={{ padding: '10px' }}>Orden</th>
                <th style={{ padding: '10px' }}>Centros</th>
                <th style={{ padding: '10px' }}>Fecha</th>
                <th style={{ padding: '10px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                  No hay solicitudes pendientes
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      {/* Notificación de error */}
      {error && (
        <div style={{
          padding: '10px',
          marginBottom: '20px',
          borderRadius: '4px',
          backgroundColor: '#ffebee',
          color: '#c62828',
          border: '1px solid #ef9a9a'
        }}>
          {error}
          <button
            onClick={cargarDatosConReintentos}
            style={{
              marginLeft: '10px',
              padding: '5px 10px',
              backgroundColor: '#c62828',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Notificación */}
      {notificacion.mensaje && (
        <div style={{
          padding: '10px',
          marginBottom: '20px',
          borderRadius: '4px',
          backgroundColor: notificacion.tipo === 'error' ? '#ffebee' : 
                          notificacion.tipo === 'success' ? '#e8f5e9' : '#e3f2fd',
          color: notificacion.tipo === 'error' ? '#c62828' : 
                 notificacion.tipo === 'success' ? '#2e7d32' : '#1565c0',
          border: `1px solid ${notificacion.tipo === 'error' ? '#ef9a9a' : 
                    notificacion.tipo === 'success' ? '#a5d6a7' : '#90caf9'}`
        }}>
          <div>{notificacion.mensaje}</div>
          <div style={{ marginTop: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Mensaje para Dashboard:</label>
            <input
              type="text"
              value={dashboardMessage}
              onChange={(e) => setDashboardMessage(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #ddd'
              }}
            />
          </div>
        </div>
      )}

      {/* Modal de Reasignación */}
      {solicitudReasignar && (
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
            maxWidth: '500px'
          }}>
            <h3 style={{ marginTop: 0 }}>Reasignar Solicitud</h3>
            <div style={{ marginBottom: '15px' }}>
              <strong>Solicitud:</strong> {solicitudReasignar.orden || solicitudReasignar.numeroOrden}
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Seleccionar Centro:</label>
              <select
                value={centroSeleccionado?.id || ''}
                onChange={(e) => {
                  const centro = availablePlazas.find(c => c.id === e.target.value);
                  setCentroSeleccionado(centro);
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #ddd'
                }}
              >
                <option value="">Seleccione un centro</option>
                {availablePlazas
                  .filter(centro => centro.plazasDisponibles > 0)
                  .map(centro => (
                    <option key={centro.id} value={centro.id}>
                      {centro.nombre} - {centro.localidad} ({centro.plazasDisponibles} plazas disponibles)
                    </option>
                  ))}
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => {
                  setSolicitudReasignar(null);
                  setCentroSeleccionado(null);
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
                Cancelar
              </button>
              <button
                onClick={handleReasignar}
                disabled={!centroSeleccionado || procesando}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  opacity: !centroSeleccionado || procesando ? 0.5 : 1
                }}
              >
                {procesando ? 'Reasignando...' : 'Reasignar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ 
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
          Solicitudes pendientes: {solicitudesProcesadas.length}
        </div>
        <button
          onClick={cargarDatosConReintentos}
          style={{
            padding: '8px 16px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '20px',
        alignItems: 'center'
      }}>
        <input
          type="text"
          placeholder="Buscar por orden o centro..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '8px',
            borderRadius: '4px',
            border: '1px solid #ddd',
            flex: 1
          }}
        />
      </div>

      {/* Tabla de solicitudes */}
      <div style={{ 
        border: '1px solid #ddd', 
        borderRadius: '5px', 
        overflow: 'hidden',
        maxHeight: '500px',
        overflowY: 'auto'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f5f5f5' }}>
              <th style={{ padding: '10px' }}>Orden</th>
              <th style={{ padding: '10px' }}>Centros</th>
              <th style={{ padding: '10px' }}>Fecha</th>
              <th style={{ padding: '10px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((solicitud, index) => (
              <tr key={`solicitud-${solicitud.id}-${index}`} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px' }}>{solicitud.orden || solicitud.numeroOrden}</td>
                <td style={{ padding: '10px' }}>
                  {solicitud.centros?.map(centro => (
                    <div key={centro.id} style={{ marginBottom: '5px' }}>
                      <div style={{ fontWeight: 'bold' }}>{centro.nombre}</div>
                      <div style={{ color: '#666' }}>{centro.localidad}</div>
                      <div style={{ color: '#666' }}>
                        Plazas: {centro.plazasDisponibles} / {centro.plazasTotal}
                      </div>
                    </div>
                  ))}
                </td>
                <td style={{ padding: '10px' }}>
                  {new Date(solicitud.fecha).toLocaleString()}
                </td>
                <td style={{ padding: '10px' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => handleProcesarSolicitud(solicitud)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Procesar
                    </button>
                    <button
                      onClick={() => setSolicitudReasignar(solicitud)}
                      style={{
                        padding: '5px 10px',
                        backgroundColor: '#2196F3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Reasignar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          marginTop: '20px' 
        }}>
          <Pagination
            count={totalPages}
            page={currentPage}
            onChange={(event, page) => setCurrentPage(page)}
            color="primary"
          />
        </div>
      )}
    </div>
  );
};

export default RequestManager; 