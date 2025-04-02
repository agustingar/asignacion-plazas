import React, { useState, useEffect } from 'react';

/**
 * Componente que muestra las solicitudes pendientes con paginación y búsqueda
 * @param {Object} props - Propiedades del componente 
 * @param {Array} props.solicitudes - Lista de solicitudes pendientes
 * @param {Array} props.assignments - Lista de asignaciones existentes
 * @param {Array} props.availablePlazas - Lista de plazas disponibles
 * @returns {JSX.Element} - Componente SolicitudesPendientes
 */
const SolicitudesPendientes = ({ solicitudes = [], assignments = [], availablePlazas = [] }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const [sortConfig, setSortConfig] = useState({ key: 'orden', direction: 'asc' });
  
  // Validar props
  useEffect(() => {
    if (!Array.isArray(solicitudes)) {
      setError('Error: Las solicitudes no son válidas');
      console.error('SolicitudesPendientes: solicitudes debe ser un array');
      return;
    }
    if (!Array.isArray(assignments)) {
      setError('Error: Las asignaciones no son válidas');
      console.error('SolicitudesPendientes: assignments debe ser un array');
      return;
    }
    if (!Array.isArray(availablePlazas)) {
      setError('Error: Las plazas disponibles no son válidas');
      console.error('SolicitudesPendientes: availablePlazas debe ser un array');
      return;
    }
    setError('');
  }, [solicitudes, assignments, availablePlazas]);
  
  // Efecto para manejar el cambio de tamaño de ventana
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Si hay error, mostrar mensaje
  if (error) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '20px',
        backgroundColor: '#fff3cd',
        borderRadius: '8px',
        color: '#856404',
        margin: '20px 0'
      }}>
        <p>{error}</p>
      </div>
    );
  }
  
  // Determinar si estamos en móvil
  const isMobile = windowWidth < 768;
  
  // Función para ordenar solicitudes
  const sortSolicitudes = (solicitudesArray) => {
    if (!solicitudesArray || !Array.isArray(solicitudesArray)) return [];
    
    return [...solicitudesArray].sort((a, b) => {
      if (!a || !b) return 0;
      
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];
      
      // Convertir a número si es el campo 'orden'
      if (sortConfig.key === 'orden') {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      }
      
      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };
  
  // Filtrar y validar solicitudes
  const filtrarSolicitudes = () => {
    // Asegurar que solicitudes es un array
    const solicitudesArray = Array.isArray(solicitudes) ? solicitudes : [];
    
    // Filtrar solicitudes inválidas
    const solicitudesValidas = solicitudesArray.filter(solicitud => {
      if (!solicitud) return false;
      
      // Validar que tenga número de orden
      if (solicitud.orden === undefined || solicitud.orden === null) {
        console.warn('Solicitud sin número de orden:', solicitud);
        return false;
      }
      
      // Validar que tenga centros seleccionados
      if (!Array.isArray(solicitud.centrosIds) && !Array.isArray(solicitud.centrosSeleccionados)) {
        console.warn('Solicitud sin centros seleccionados:', solicitud);
        return false;
      }
      
      return true;
    });
    
    // Aplicar filtro de búsqueda
    return solicitudesValidas.filter(solicitud => {
      const searchFields = [
        solicitud.orden?.toString(),
        ...(solicitud.centrosIds || solicitud.centrosSeleccionados || []).map(centroId => {
          const centro = availablePlazas.find(p => p.id === centroId);
          return centro ? [centro.centro, centro.localidad, centro.municipio] : [];
        }).flat()
      ].filter(Boolean);
      
      return searchFields.some(field => 
        field.toLowerCase().includes(searchTerm.toLowerCase())
      );
    });
  };
  
  // Obtener solicitudes filtradas y ordenadas
  const solicitudesFiltradas = sortSolicitudes(filtrarSolicitudes());
  
  // Calcular paginación
  const totalPages = Math.ceil(solicitudesFiltradas.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = solicitudesFiltradas.slice(indexOfFirstItem, indexOfLastItem);
  
  // Cambiar página
  const handlePageChange = (pageNumber) => {
    if (pageNumber < 1 || pageNumber > totalPages) return;
    setCurrentPage(pageNumber);
  };
  
  // Cambiar orden
  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  if (!solicitudes.length) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '40px 20px',
        backgroundColor: '#f5f7fa',
        borderRadius: '8px',
        color: '#5c6c7c'
      }}>
        <div style={{ fontSize: '36px', marginBottom: '15px' }}>📝</div>
        <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
          No hay solicitudes pendientes
        </div>
        <div style={{ fontSize: '14px' }}>
          Las solicitudes aparecerán aquí cuando se envíen desde la pestaña "Plazas Disponibles"
        </div>
      </div>
    );
  }
  
  return (
    <div>
      <div style={{ 
        marginBottom: '15px', 
        fontSize: '14px', 
        padding: '12px 15px',
        backgroundColor: '#fff7f0',
        borderRadius: '6px',
        borderLeft: '4px solid #d35400',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}>
        A continuación se muestran las solicitudes pendientes con sus preferencias de centros en orden.
        <p style={{ 
          color: '#d35400', 
          fontWeight: 'bold', 
          marginTop: '8px',
          marginBottom: '0'
        }}>
          ⚠️ Las solicitudes se procesan por orden de prioridad (número de orden menor = mayor prioridad)
        </p>
      </div>
      
      <div style={{ marginBottom: '15px' }}>
        <div style={{ 
          marginBottom: '10px',
          position: 'relative'
        }}>
          <input
            type="text"
            placeholder="Buscar por número de orden o centro..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1); // Resetear a página 1 al buscar
            }}
            style={{
              padding: '12px 15px',
              paddingLeft: '40px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              width: '100%',
              fontSize: '16px',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)'
            }}
          />
          <div style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#666',
            fontSize: '18px'
          }}>
            🔍
          </div>
        </div>
        
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>
            Mostrando <strong>{solicitudesFiltradas.length > 0 ? indexOfFirstItem + 1 : 0}-{Math.min(indexOfLastItem, solicitudesFiltradas.length)}</strong> de <strong>{solicitudesFiltradas.length}</strong> solicitudes
            {searchTerm && ` (filtradas de ${solicitudes.length})`}
          </div>
          
          <div>
            <select 
              value={itemsPerPage} 
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1); // Resetear a página 1 al cambiar items por página
              }}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '6px',
                backgroundColor: 'white',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
              }}
            >
              <option value={10}>10 por página</option>
              <option value={25}>25 por página</option>
              <option value={50}>50 por página</option>
              <option value={solicitudesFiltradas.length}>Ver todas</option>
            </select>
          </div>
        </div>
      </div>
      
      {isMobile && (
        <div style={{ 
          marginBottom: '15px', 
          fontSize: '13px', 
          color: '#666', 
          textAlign: 'center',
          backgroundColor: '#fff3cd',
          padding: '8px',
          borderRadius: '4px'
        }}>
          ← Desliza para ver la tabla completa →
        </div>
      )}
      
      <div style={{ 
        overflowX: 'auto',
        border: '1px solid #e1e8f0',
        borderRadius: '6px',
        WebkitOverflowScrolling: 'touch' // Para mejor scroll en iOS
      }}>
        <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '768px' : 'auto' }}>
          <thead>
            <tr style={{ 
              backgroundImage: 'linear-gradient(to right, #fef5ec, #fde4ce)',
              position: 'sticky',
              top: 0,
              zIndex: 5
            }}>
              <th style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'left', color: '#d35400' }}>Nº Orden</th>
              <th style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'left', color: '#d35400' }}>Fecha/Hora</th>
              <th style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'left', color: '#d35400' }}>Centros Seleccionados (en orden de preferencia)</th>
              <th style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'center', color: '#d35400' }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map((solicitud, index) => {
              // Convertir timestamp a fecha legible
              const fecha = new Date(solicitud.timestamp);
              const fechaFormateada = `${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
              
              // Verificar si tiene asignación
              const tieneAsignacion = assignments.some(a => a.order === solicitud.orden);
              
              // Obtener el centro asignado si existe
              const asignacion = assignments.find(a => a.order === solicitud.orden);
              
              // Color de fondo según tiene asignación y alternancia de filas
              const backgroundColor = tieneAsignacion 
                ? '#e8f5e9' 
                : (index % 2 === 0 ? 'white' : '#fef9f4');
              
              return (
                <tr key={index} style={{ 
                  backgroundColor: backgroundColor,
                  opacity: tieneAsignacion ? 0.8 : 1,
                  transition: 'background-color 0.2s ease'
                }}>
                  <td style={{ 
                    border: '1px solid #ddd', 
                    padding: '12px 15px', 
                    fontWeight: 'bold',
                    backgroundColor: solicitud.orden <= 50 ? '#fff3cd' : 'inherit' // Destacar órdenes bajos
                  }}>
                    {solicitud.orden}
                    {solicitud.orden <= 50 && (
                      <span style={{ 
                        display: 'inline-block', 
                        marginLeft: '8px', 
                        fontSize: '12px', 
                        color: '#856404',
                        backgroundColor: '#fff3cd',
                        padding: '2px 6px',
                        borderRadius: '12px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                      }}>
                        Alta prioridad
                      </span>
                    )}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '12px 15px' }}>{fechaFormateada}</td>
                  <td style={{ border: '1px solid #ddd', padding: '12px 15px' }}>
                    <ol style={{ margin: '0', paddingLeft: '20px' }}>
                      {/* Usar operador de encadenamiento opcional y verificar que es un array */}
                      {Array.isArray(solicitud?.centrosIds || solicitud?.centrosSeleccionados) 
                        ? (solicitud?.centrosIds || solicitud?.centrosSeleccionados || []).map((centroId, idx) => {
                          // Buscar detalles del centro con validación
                          const centro = centroId && availablePlazas && Array.isArray(availablePlazas) 
                            ? availablePlazas.find(p => p && p.id === centroId) 
                            : null;
                          
                          // Buscar si este centro concreto tiene asignación para este orden
                          const asignadoAEsteCentro = asignacion && asignacion.id === centroId;
                          
                          return (
                            <li key={idx} style={{ 
                              marginBottom: '8px',
                              backgroundColor: asignadoAEsteCentro ? '#f1f8e9' : 'transparent',
                              padding: asignadoAEsteCentro ? '4px 8px' : '0',
                              borderRadius: asignadoAEsteCentro ? '4px' : '0',
                              border: asignadoAEsteCentro ? '1px solid #c8e6c9' : 'none'
                            }}>
                              {centro ? (
                                <>
                                  <strong style={{ color: idx === 0 ? '#d35400' : 'inherit' }}>
                                    {centro.centro}
                                  </strong> 
                                  <span style={{ fontSize: '14px', color: '#666' }}>
                                    {centro.localidad && `- ${centro.localidad}`} {centro.municipio && `(${centro.municipio})`}
                                  </span>
                                  {idx === 0 && (
                                    <span style={{
                                      display: 'inline-block',
                                      marginLeft: '8px',
                                      fontSize: '12px',
                                      color: '#d35400',
                                      backgroundColor: '#fff3cd',
                                      padding: '1px 5px',
                                      borderRadius: '10px',
                                      fontWeight: 'bold'
                                    }}>
                                      1ª opción
                                    </span>
                                  )}
                                  {(centro.plazas && centro.asignadas !== undefined && (centro.plazas - centro.asignadas) <= 0) 
                                    && !asignadoAEsteCentro && (
                                    <span style={{ 
                                      color: '#e74c3c', 
                                      marginLeft: '10px', 
                                      fontSize: '12px', 
                                      fontWeight: 'bold',
                                      backgroundColor: '#ffebee',
                                      padding: '1px 6px',
                                      borderRadius: '10px'
                                    }}>
                                      Completo
                                    </span>
                                  )}
                                  {asignadoAEsteCentro && (
                                    <span style={{ 
                                      color: '#2E7D32', 
                                      marginLeft: '10px', 
                                      fontSize: '12px', 
                                      fontWeight: 'bold',
                                      backgroundColor: '#e8f5e9',
                                      padding: '1px 6px',
                                      borderRadius: '10px'
                                    }}>
                                      ✓ Asignado
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span style={{ color: '#999' }}>Centro no disponible (ID: {centroId})</span>
                              )}
                            </li>
                          );
                        })
                        : <li>No hay centros seleccionados</li>
                      }
                    </ol>
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'center' }}>
                    {tieneAsignacion ? (
                      <div style={{ 
                        backgroundColor: '#e8f5e9', 
                        color: '#2E7D32', 
                        padding: '8px 12px', 
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        border: '1px solid #c8e6c9',
                        display: 'inline-block'
                      }}>
                        ✓ Asignado
                      </div>
                    ) : (
                      <div style={{ 
                        backgroundColor: '#fff7e6', 
                        color: '#f39c12', 
                        padding: '8px 12px', 
                        borderRadius: '6px',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        border: '1px solid #ffeeba',
                        display: 'inline-block'
                      }}>
                        Pendiente
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            
            {currentItems.length === 0 && (
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '30px', color: '#666' }}>
                  {searchTerm ? 
                    `No se encontraron solicitudes que coincidan con "${searchTerm}"` : 
                    'No hay solicitudes pendientes para mostrar'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Paginación */}
      {solicitudesFiltradas.length > itemsPerPage && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          marginTop: '20px', 
          gap: '5px',
          flexWrap: 'wrap'
        }}>
          <button 
            onClick={() => handlePageChange(currentPage - 1)} 
            disabled={currentPage === 1}
            style={{
              padding: '8px 12px',
              backgroundColor: currentPage === 1 ? '#f1f1f1' : 'white',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
            }}
          >
            &laquo; Anterior
          </button>
          
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            // Mostrar 5 páginas alrededor de la actual
            let pageToShow;
            if (totalPages <= 5) {
              pageToShow = i + 1;
            } else if (currentPage <= 3) {
              pageToShow = i + 1;
            } else if (currentPage >= totalPages - 2) {
              pageToShow = totalPages - 4 + i;
            } else {
              pageToShow = currentPage - 2 + i;
            }
            
            return (
              <button
                key={pageToShow}
                onClick={() => handlePageChange(pageToShow)}
                style={{
                  padding: '8px 12px',
                  backgroundColor: currentPage === pageToShow ? '#e67e22' : 'white',
                  color: currentPage === pageToShow ? 'white' : '#333',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {pageToShow}
              </button>
            );
          })}
          
          <button 
            onClick={() => handlePageChange(currentPage + 1)} 
            disabled={currentPage === totalPages}
            style={{
              padding: '8px 12px',
              backgroundColor: currentPage === totalPages ? '#f1f1f1' : 'white',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
            }}
          >
            Siguiente &raquo;
          </button>
        </div>
      )}
    </div>
  );
};

export default SolicitudesPendientes; 