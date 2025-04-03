import React, { useState, useEffect, useMemo } from 'react';

/**
 * Componente que muestra el historial de asignaciones
 * @param {Object} props - Propiedades del componente
 * @param {Array} props.assignments - Lista de asignaciones
 * @param {Array} props.availablePlazas - Lista de centros/plazas disponibles
 * @returns {JSX.Element} - Componente Dashboard
 */
const Dashboard = ({ assignments = [], availablePlazas = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [sortConfig, setSortConfig] = useState({ key: 'order', direction: 'asc' });
  
  // Validar que assignments sea un array
  useEffect(() => {
    if (!Array.isArray(assignments)) {
      setError('Error: Los datos de asignaciones no son válidos');
      console.error('Dashboard: assignments debe ser un array');
      return;
    }

    // Validar estructura de datos
    const invalidAssignments = assignments.filter(a => 
      !a || 
      typeof a !== 'object' || 
      (!a.numeroOrden && !a.order) || 
      (!a.nombreCentro && !a.centro) || 
      !a.timestamp
    );

    if (invalidAssignments.length > 0) {
      console.warn('Algunas asignaciones tienen estructura inválida:', invalidAssignments);
    }

    setError('');
  }, [assignments]);

  // Formatear fecha
  const formatearFecha = (timestamp) => {
    if (!timestamp) return 'Fecha no disponible';
    try {
      const fecha = new Date(timestamp);
      return fecha.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error al formatear fecha:', error);
      return 'Fecha inválida';
    }
  };

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

  // Si no hay asignaciones, mostrar mensaje
  if (!assignments.length) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '40px 20px',
        backgroundColor: '#f5f7fa',
        borderRadius: '8px',
        color: '#5c6c7c'
      }}>
        <div style={{ fontSize: '36px', marginBottom: '15px' }}>📋</div>
        <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
          No hay asignaciones realizadas
        </div>
        <div style={{ fontSize: '14px' }}>
          Las asignaciones aparecerán aquí una vez procesadas las solicitudes
        </div>
      </div>
    );
  }
  
  // Función para ordenar asignaciones
  const sortAssignments = useMemo(() => {
    return (asignacionesArray) => {
      if (!asignacionesArray || !Array.isArray(asignacionesArray)) return [];
      
      return [...asignacionesArray].sort((a, b) => {
        if (!a || !b) return 0;
        
        let aValue, bValue;
        
        // Manejar diferentes nombres de propiedades
        if (sortConfig.key === 'order') {
          aValue = a.numeroOrden !== undefined ? a.numeroOrden : a.order;
          bValue = b.numeroOrden !== undefined ? b.numeroOrden : b.order;
        } else if (sortConfig.key === 'centro') {
          aValue = a.nombreCentro || a.centro || '';
          bValue = b.nombreCentro || b.centro || '';
        } else {
          aValue = a[sortConfig.key];
          bValue = b[sortConfig.key];
        }
        
        // Convertir a número si es el campo 'order'
        if (sortConfig.key === 'order') {
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
  }, [sortConfig]);
  
  // Filtrar asignaciones
  const filtrarAsignaciones = useMemo(() => {
    if (!Array.isArray(assignments)) return [];

    let asignacionesFiltradas = assignments;

    // Filtrar por término de búsqueda
    if (searchTerm) {
      const searchTermLower = searchTerm.toLowerCase();
      asignacionesFiltradas = asignacionesFiltradas.filter(asignacion => {
        if (!asignacion) return false;

        const searchFields = [
          (asignacion.numeroOrden || asignacion.order)?.toString(),
          asignacion.nombreCentro || asignacion.centro,
          asignacion.localidad,
          asignacion.municipio
        ].filter(Boolean);

        return searchFields.some(field => 
          field.toLowerCase().includes(searchTermLower)
        );
      });
    }

    // Filtrar por estado si no es 'TODOS'
    if (filtroEstado !== 'TODOS') {
      asignacionesFiltradas = asignacionesFiltradas.filter(asignacion => 
        asignacion && asignacion.estado === filtroEstado
      );
    }

    // Ordenar resultados
    return sortAssignments(asignacionesFiltradas);
  }, [assignments, searchTerm, filtroEstado, sortAssignments]);
  
  // Obtener asignaciones filtradas y ordenadas
  const asignacionesFiltradas = filtrarAsignaciones;
  
  // Calcular paginación
  const totalPages = Math.ceil(asignacionesFiltradas.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = asignacionesFiltradas.slice(indexOfFirstItem, indexOfLastItem);
  
  // Cambiar página
  const handlePageChange = (pageNumber) => {
    if (pageNumber < 1 || pageNumber > totalPages) return;
    setCurrentPage(pageNumber);
  };
  
  // Cambiar ordenamiento
  const handleSort = (key) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  // Estilos para el componente
  const styles = {
    container: {
      position: 'relative',
      padding: '20px',
      backgroundColor: '#f4f6f9',
      borderRadius: '8px',
      boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
    },
    infoContainer: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '20px',
      flexWrap: 'wrap',
      gap: '15px'
    },
    statsContainer: {
      display: 'flex',
      gap: '15px',
      flexWrap: 'wrap'
    },
    statCard: {
      backgroundColor: '#ffffff',
      borderRadius: '6px',
      padding: '15px',
      minWidth: '140px',
      boxShadow: '0 2px 5px rgba(0,0,0,0.06)',
      flex: 1
    },
    statValue: {
      fontSize: '24px',
      fontWeight: 'bold',
      color: '#2d3748',
      marginBottom: '5px'
    },
    statLabel: {
      fontSize: '13px',
      color: '#718096'
    },
    searchBar: {
      display: 'flex',
      gap: '10px',
      marginBottom: '20px'
    },
    input: {
      flex: '1',
      padding: '10px 12px',
      borderRadius: '6px',
      border: '1px solid #e2e8f0',
      fontSize: '14px'
    },
    select: {
      padding: '10px 12px',
      borderRadius: '6px',
      border: '1px solid #e2e8f0',
      fontSize: '14px',
      backgroundColor: '#fff'
    },
    tableContainer: {
      overflowX: 'auto',
      backgroundColor: '#ffffff',
      borderRadius: '8px',
      boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: '14px'
    },
    tableHeader: {
      backgroundColor: '#f8fafc',
      color: '#4a5568',
      textAlign: 'left',
      padding: '12px 15px',
      fontWeight: 'bold',
      borderBottom: '2px solid #e2e8f0',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
      position: 'sticky',
      top: 0
    },
    tableCell: {
      padding: '12px 15px',
      borderBottom: '1px solid #e2e8f0',
      color: '#2d3748',
      whiteSpace: 'nowrap'
    },
    pagination: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '15px 0',
      fontSize: '14px'
    },
    pageButton: {
      padding: '6px 12px',
      margin: '0 4px',
      backgroundColor: '#f1f5f9',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      transition: 'background-color 0.2s',
      fontSize: '13px'
    },
    activePageButton: {
      backgroundColor: '#3182ce',
      color: '#ffffff'
    },
    textCenter: {
      textAlign: 'center'
    },
    badge: {
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 'bold',
      textAlign: 'center'
    },
    badgePrimary: {
      backgroundColor: '#ebf5ff',
      color: '#3182ce'
    },
    badgeSuccess: {
      backgroundColor: '#e6fffa',
      color: '#38b2ac'
    },
    badgeWarning: {
      backgroundColor: '#fffaf0',
      color: '#dd6b20'
    },
    badgeReasignado: {
      backgroundColor: '#fef0f5',
      color: '#d53f8c',
      border: '1px dashed #d53f8c'
    },
    infoRow: {
      marginBottom: '15px',
      backgroundColor: '#f8fafc',
      borderRadius: '6px',
      padding: '10px 15px',
      fontSize: '14px',
      color: '#4a5568',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    },
    orderContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    orderBadge: {
      color: '#000',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '16px',
      fontWeight: 'bold'
    },
    sortIcon: {
      marginLeft: '4px',
      display: 'inline-block',
      fontSize: '10px'
    },
    leyendaContainer: {
      marginTop: '20px',
      padding: '15px',
      backgroundColor: '#ffffff',
      borderRadius: '8px',
      boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
      fontSize: '13px'
    },
    leyendaTitle: {
      fontSize: '14px',
      fontWeight: 'bold',
      marginBottom: '10px'
    },
    leyendaItems: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '15px'
    },
    leyendaItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '8px'
    }
  };
  
  // Calcular estadísticas
  const estadisticas = useMemo(() => {
    const total = asignacionesFiltradas.length;
    const centros = [...new Set(asignacionesFiltradas.map(a => a.nombreCentro || a.centro))].length;
    const reasignados = asignacionesFiltradas.filter(a => a.reasignado).length;
    const noAsignables = asignacionesFiltradas.filter(a => a.estadoAsignacion === "NO_ASIGNABLE").length;

    return {
      total,
      centros,
      reasignados,
      noAsignables
    };
  }, [asignacionesFiltradas]);
  
  // Obtener lista de estados únicos para el filtro
  const estados = useMemo(() => {
    return ['TODOS', ...new Set(asignacionesFiltradas
      .filter(a => a.estado)
      .map(a => a.estado))];
  }, [asignacionesFiltradas]);
  
  return (
    <div style={styles.container}>
      {/* Encabezado y estadísticas */}
      <div style={styles.infoContainer}>
        <div style={styles.statsContainer}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{estadisticas.total}</div>
            <div style={styles.statLabel}>Asignaciones totales</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{estadisticas.centros}</div>
            <div style={styles.statLabel}>Centros con asignaciones</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{estadisticas.reasignados}</div>
            <div style={styles.statLabel}>Reasignaciones</div>
          </div>
          {estadisticas.noAsignables > 0 && (
            <div style={{
              ...styles.statCard,
              backgroundColor: '#fff5f5', 
              borderLeft: '3px solid #e53e3e'
            }}>
              <div style={{...styles.statValue, color: '#e53e3e'}}>{estadisticas.noAsignables}</div>
              <div style={styles.statLabel}>No asignables</div>
            </div>
          )}
        </div>
      </div>
      
      {/* Alerta para detectar centros con exceso de asignaciones */}
      {(() => {
        // Verificar centros con exceso
        const centrosConExceso = assignments.reduce((acc, asignacion) => {
          if (!asignacion) return acc;
          
          // Agrupar por centro
          const centroId = asignacion.centerId || asignacion.id;
          if (!centroId) return acc;
          
          if (!acc[centroId]) {
            acc[centroId] = {
              id: centroId,
              centro: asignacion.nombreCentro || asignacion.centro || 'Centro desconocido',
              count: 0,
              plazas: 0
            };
          }
          
          acc[centroId].count++;
          
          return acc;
        }, {});
        
        // Buscar plazas disponibles para cada centro
        for (const centroId in centrosConExceso) {
          const centro = availablePlazas.find(p => p.id === centroId);
          if (centro) {
            centrosConExceso[centroId].plazas = centro.plazas || 0;
          }
        }
        
        // Filtrar solo los centros que tienen exceso
        const excesos = Object.values(centrosConExceso).filter(
          centro => centro.count > centro.plazas && centro.plazas > 0
        );
        
        if (excesos.length > 0) {
          return (
            <div style={{
              backgroundColor: '#fff5f5',
              borderLeft: '4px solid #e53e3e',
              borderRadius: '4px',
              padding: '12px 15px',
              marginBottom: '20px',
              fontSize: '14px',
              color: '#742a2a',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{fontWeight: 'bold', marginBottom: '8px', fontSize: '16px'}}>
                ⚠️ Se detectaron centros con exceso de asignaciones
              </div>
              <div style={{marginBottom: '10px'}}>
                Los siguientes centros tienen más asignaciones que plazas disponibles:
              </div>
              <ul style={{
                margin: '10px 0',
                paddingLeft: '25px'
              }}>
                {excesos.map(centro => (
                  <li key={centro.id} style={{marginBottom: '5px'}}>
                    <strong>{centro.centro}:</strong> {centro.count} asignaciones para {centro.plazas} plazas
                  </li>
                ))}
              </ul>
              <div style={{marginTop: '10px', fontSize: '13px'}}>
                Se recomienda ejecutar la verificación y corrección automática de asignaciones.
              </div>
            </div>
          );
        }
        
        return null;
      })()}
      
      {/* Filtros de búsqueda */}
      <div style={styles.searchBar}>
        <input
          type="text"
          placeholder="Buscar por nº de orden, centro, localidad..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1); // Reiniciar página al buscar
          }}
          style={styles.input}
        />
      
      </div>
      
      {/* Tabla de asignaciones */}
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th 
                style={styles.tableHeader} 
                onClick={() => handleSort('order')}
              >
                <div style={styles.orderContainer}>
                  Nº Orden
                  <span style={styles.sortIcon}>
                    {sortConfig.key === 'order' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                  </span>
                </div>
              </th>
              <th 
                style={styles.tableHeader}
                onClick={() => handleSort('centro')}
              >
                Centro 
                <span style={styles.sortIcon}>
                  {sortConfig.key === 'centro' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                </span>
              </th>
              <th 
                style={styles.tableHeader}
                onClick={() => handleSort('localidad')}
              >
                Ubicación
                <span style={{fontSize: '12px', fontWeight: 'normal', display: 'block'}}>
                  Localidad / Municipio
                </span>
                <span style={styles.sortIcon}>
                  {sortConfig.key === 'localidad' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                </span>
              </th>
              <th 
                style={styles.tableHeader}
                onClick={() => handleSort('timestamp')}
              >
                Fecha
                <span style={styles.sortIcon}>
                  {sortConfig.key === 'timestamp' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map((asignacion, index) => (
              <tr key={asignacion.docId || index} style={
                asignacion.estadoAsignacion === "NO_ASIGNABLE" 
                  ? {backgroundColor: '#fff1f0'} 
                  : asignacion.reasignado 
                    ? {backgroundColor: '#fff9fb'} 
                    : {}
              }>
                <td style={styles.tableCell}>
                  <div style={styles.orderContainer}>
                    <div style={styles.orderBadge}>{asignacion.numeroOrden || asignacion.order}</div>
                  </div>
                </td>
                <td style={styles.tableCell}>
                  <div>
                    <strong>{asignacion.nombreCentro || asignacion.centerName || asignacion.centro}</strong>
                    {asignacion.reasignado && (
                      <div style={{fontSize: '12px', color: '#d53f8c', marginTop: '4px'}}>
                        Reasignado de: {asignacion.centroOriginal || asignacion.centroPrevio}
                      </div>
                    )}
                    {asignacion.estadoAsignacion === "NO_ASIGNABLE" && (
                      <div style={{
                        fontSize: '12px', 
                        color: '#e53e3e', 
                        marginTop: '4px',
                        backgroundColor: '#fff5f5',
                        padding: '3px 6px',
                        borderRadius: '4px',
                        display: 'inline-block'
                      }}>
                        <span style={{marginRight: '4px'}}>⚠️</span>
                        No asignable: Plaza ocupada
                      </div>
                    )}
                  </div>
                </td>
                <td style={styles.tableCell}>
                  <div>
                    {asignacion.localidad && (
                      <div style={{fontWeight: 'medium'}}>{asignacion.localidad}</div>
                    )}
                    {asignacion.municipio && asignacion.municipio !== asignacion.localidad && (
                      <div style={{
                        color: '#4a5568',
                        fontSize: '13px',
                        marginTop: asignacion.localidad ? '3px' : '0',
                        display: 'flex',
                        alignItems: 'center'
                      }}>
                        <span style={{marginRight: '4px'}}>📍</span>
                        {asignacion.municipio}
                      </div>
                    )}
                    {!asignacion.localidad && !asignacion.municipio && (
                      <span style={{color: '#a0aec0', fontStyle: 'italic'}}></span>
                    )}
                    {asignacion.estadoAsignacion === "NO_ASIGNABLE" && (
                      <div style={{
                        marginTop: '5px',
                        fontSize: '11px',
                        color: '#718096',
                        fontStyle: 'italic'
                      }}>
                        {asignacion.mensajeEstado || 'No hay plazas disponibles en el único centro seleccionado'}
                      </div>
                    )}
                  </div>
                </td>
                <td style={styles.tableCell}>
                  {formatearFecha(asignacion.timestamp)}
                </td>
              
              </tr>
            ))}
            {currentItems.length === 0 && (
              <tr>
                <td colSpan="5" style={{...styles.tableCell, textAlign: 'center', padding: '30px 15px'}}>
                  No se encontraron asignaciones que coincidan con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Paginación */}
      {totalPages > 1 && (
        <div style={styles.pagination}>
          <div>
            Mostrando {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, asignacionesFiltradas.length)} de {asignacionesFiltradas.length}
          </div>
          <div>
            <button 
              style={styles.pageButton} 
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
            >
              «
            </button>
            <button 
              style={styles.pageButton}
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              ‹
            </button>
            
            {/* Generar botones de paginación */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNumber;
              if (totalPages <= 5) {
                pageNumber = i + 1;
              } else if (currentPage <= 3) {
                pageNumber = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNumber = totalPages - 4 + i;
              } else {
                pageNumber = currentPage - 2 + i;
              }
              
              return (
                <button
                  key={pageNumber}
                  style={{
                    ...styles.pageButton,
                    ...(currentPage === pageNumber ? styles.activePageButton : {})
                  }}
                  onClick={() => handlePageChange(pageNumber)}
                >
                  {pageNumber}
                </button>
              );
            })}
            
            <button 
              style={styles.pageButton}
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              ›
            </button>
            <button 
              style={styles.pageButton}
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
            >
              »
            </button>
          </div>
        </div>
      )}
      
      {/* Leyenda de los tipos de asignaciones */}
      <div style={styles.leyendaContainer}>
        <div style={styles.leyendaTitle}>Leyenda de asignaciones</div>
        <div style={styles.leyendaItems}>
          <div style={styles.leyendaItem}>
            <div style={{
              width: '16px',
              height: '16px',
              backgroundColor: '#fff',
              border: '1px solid #eee',
              borderRadius: '3px'
            }}></div>
            <span>Asignación normal</span>
          </div>
          
          <div style={styles.leyendaItem}>
            <div style={{
              width: '16px',
              height: '16px',
              backgroundColor: '#fff9fb',
              border: '1px solid #fdd6e7',
              borderRadius: '3px'
            }}></div>
            <span>Reasignación</span>
          </div>
          
          <div style={styles.leyendaItem}>
            <div style={{
              width: '16px',
              height: '16px',
              backgroundColor: '#fff1f0',
              border: '1px solid #fcc2bd',
              borderRadius: '3px'
            }}></div>
            <span>No asignable (plaza ocupada)</span>
          </div>
        </div>
        
        {estadisticas.noAsignables > 0 && (
          <div style={{
            marginTop: '15px',
            padding: '10px 15px',
            backgroundColor: '#fff5f5',
            borderRadius: '5px',
            fontSize: '13px',
            color: '#742a2a',
            borderLeft: '3px solid #e53e3e'
          }}>
            <strong>Información sobre asignaciones "No asignables":</strong>
            <p style={{margin: '8px 0'}}>
              Estas asignaciones se crean cuando una solicitud solo tiene un centro como opción y ese centro 
              ya tiene todas sus plazas ocupadas por solicitudes con mayor prioridad (número de orden menor).
            </p>
            <p style={{margin: '8px 0'}}>
              En estos casos, el sistema registra la asignación de forma especial para mantener el seguimiento.
            </p>
          </div>
        )}
      </div>
  
    </div>
  );
};

export default Dashboard; 