import React, { useState, useEffect } from 'react';

/**
 * Componente que muestra las solicitudes pendientes con paginación y búsqueda
 * @param {Object} props - Propiedades del componente 
 * @param {Array} props.solicitudes - Lista de solicitudes pendientes
 * @param {Array} props.assignments - Lista de asignaciones existentes
 * @param {Array} props.availablePlazas - Lista de plazas disponibles
 * @returns {JSX.Element} - Componente SolicitudesPendientes
 */
const SolicitudesPendientes = ({ solicitudes, assignments, availablePlazas }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  
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
  
  // Determinar si estamos en móvil
  const isMobile = windowWidth < 768;
  
  // Filtrar las solicitudes según la búsqueda
  const filteredSolicitudes = solicitudes.filter(solicitud => {
    const ordenStr = solicitud.orden.toString();
    
    // Buscar en los centros seleccionados
    const centrosNames = solicitud.centrosIds.map(id => {
      const centro = availablePlazas.find(p => p.id === id);
      return centro ? centro.centro + " " + centro.localidad + " " + centro.municipio : "";
    }).join(" ").toLowerCase();
    
    return ordenStr.includes(searchTerm.toLowerCase()) || 
           centrosNames.includes(searchTerm.toLowerCase());
  });
  
  // Ordenar por número de orden (menor primero = mayor prioridad)
  const sortedSolicitudes = [...filteredSolicitudes].sort((a, b) => a.orden - b.orden);
  
  // Calcular total de páginas
  const totalPages = Math.ceil(sortedSolicitudes.length / itemsPerPage);
  
  // Obtener solicitudes para la página actual
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = sortedSolicitudes.slice(indexOfFirstItem, indexOfLastItem);
  
  // Cambiar de página
  const paginate = (pageNumber) => setCurrentPage(pageNumber);
  
  // Ir a la página anterior
  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };
  
  // Ir a la página siguiente
  const nextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
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
            Mostrando <strong>{sortedSolicitudes.length > 0 ? indexOfFirstItem + 1 : 0}-{Math.min(indexOfLastItem, sortedSolicitudes.length)}</strong> de <strong>{sortedSolicitudes.length}</strong> solicitudes
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
              <option value={sortedSolicitudes.length}>Ver todas</option>
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
              
              // Verificar el estado especial de la solicitud
              const estadoEspecial = solicitud.estadoAsignacion === "SIN_PLAZAS_DISPONIBLES";
              const detalleDisponibilidad = solicitud.detalleDisponibilidad || {};
              
              // Color de fondo según tiene asignación y alternancia de filas
              const backgroundColor = tieneAsignacion 
                ? '#e8f5e9' 
                : (estadoEspecial ? '#fcf0f0' : (index % 2 === 0 ? 'white' : '#fef9f4'));
              
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
                      {solicitud.centrosIds.map((centroId, idx) => {
                        const centro = availablePlazas.find(p => p.id === centroId);
                        // Obtener información de disponibilidad
                        const infoCentro = detalleDisponibilidad[centroId] || {};
                        const plazasDisponibles = infoCentro.plazasDisponibles;
                        
                        return centro ? (
                          <li key={idx} style={{ 
                            marginBottom: '5px',
                            color: plazasDisponibles === 0 ? '#e74c3c' : 'inherit',
                            fontWeight: plazasDisponibles === 0 ? 'bold' : 'normal'
                          }}>
                            {centro.centro} - {centro.localidad || centro.municipio || 'Sin localidad'}
                            {plazasDisponibles !== undefined && plazasDisponibles === 0 && (
                              <span style={{ 
                                color: '#e74c3c', 
                                backgroundColor: '#fcf0f0',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                marginLeft: '8px',
                                fontSize: '12px',
                                fontWeight: 'bold'
                              }}>
                                No hay plazas disponibles
                              </span>
                            )}
                          </li>
                        ) : (
                          <li key={idx} style={{ color: '#999' }}>
                            Centro ID: {centroId} (no encontrado)
                          </li>
                        );
                      })}
                    </ol>
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'center' }}>
                    {tieneAsignacion ? (
                      <div style={{ 
                        backgroundColor: '#e8f5e9', 
                        color: '#2e7d32',
                        padding: '5px 10px',
                        borderRadius: '4px',
                        display: 'inline-block',
                        fontWeight: 'bold'
                      }}>
                        ✅ Asignada a {asignacion.centro}
                      </div>
                    ) : estadoEspecial ? (
                      <div style={{ 
                        backgroundColor: '#fcf0f0', 
                        color: '#e74c3c',
                        padding: '5px 10px',
                        borderRadius: '4px',
                        display: 'inline-block',
                        fontWeight: 'bold'
                      }}>
                        ❌ Sin plazas disponibles
                      </div>
                    ) : solicitud.intentosFallidos > 3 ? (
                      <div style={{ 
                        backgroundColor: '#fff3cd', 
                        color: '#856404',
                        padding: '5px 10px',
                        borderRadius: '4px',
                        display: 'inline-block'
                      }}>
                        ⚠️ Pendiente ({solicitud.intentosFallidos} intentos)
                      </div>
                    ) : (
                      <div style={{ 
                        backgroundColor: '#f1f8fe', 
                        color: '#0d6efd',
                        padding: '5px 10px',
                        borderRadius: '4px',
                        display: 'inline-block'
                      }}>
                        ⏳ Pendiente
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
      {sortedSolicitudes.length > itemsPerPage && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          marginTop: '20px', 
          gap: '5px',
          flexWrap: 'wrap'
        }}>
          <button 
            onClick={prevPage} 
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
                onClick={() => paginate(pageToShow)}
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
            onClick={nextPage} 
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