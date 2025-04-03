import React, { useState, useEffect } from 'react';

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
  const [avisoVisto, setAvisoVisto] = useState(false);
  
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
      // Si es un objeto Timestamp de Firestore
      if (timestamp && typeof timestamp === 'object' && timestamp.seconds) {
        const fecha = new Date(timestamp.seconds * 1000);
        return fecha.toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      
      // Si es número (timestamp en milisegundos)
      if (typeof timestamp === 'number') {
        const fecha = new Date(timestamp);
        return fecha.toLocaleString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      
      // Si es string (formato ISO)
      const fecha = new Date(timestamp);
      if (isNaN(fecha.getTime())) {
        return 'Fecha no disponible';
      }
      
      return fecha.toLocaleString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error al formatear fecha:', timestamp, error);
      return 'Fecha no disponible';
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
  const sortAssignments = (asignacionesArray) => {
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
  
  // Filtrar asignaciones
  const filtrarAsignaciones = () => {
    if (!Array.isArray(assignments)) return [];

    // Primero eliminar duplicados del mismo número de orden, conservando solo el más reciente
    const asignacionesSinDuplicados = [];
    const ordenesVistos = {};
    
    // Ordenar primero por timestamp (descendente) para asegurar que procesamos primero los más recientes
    const asignacionesOrdenadas = [...assignments].sort((a, b) => {
      // Usar el timestamp para ordenar descendentemente (más reciente primero)
      const timestampA = a.timestamp || 0;
      const timestampB = b.timestamp || 0;
      return timestampB - timestampA;
    });
    
    // Mantener solo la versión más reciente de cada número de orden
    for (const asignacion of asignacionesOrdenadas) {
      if (!asignacion) continue;
      
      const numeroOrden = asignacion.numeroOrden || asignacion.order;
      if (!numeroOrden) continue;
      
      // Si no hemos visto este número de orden antes, lo agregamos
      if (!ordenesVistos[numeroOrden]) {
        ordenesVistos[numeroOrden] = true;
        asignacionesSinDuplicados.push(asignacion);
      }
    }

    let asignacionesFiltradas = asignacionesSinDuplicados;

    // Filtrar por término de búsqueda
    if (searchTerm) {
      asignacionesFiltradas = asignacionesFiltradas.filter(asignacion => {
        if (!asignacion) return false;

        const searchFields = [
          (asignacion.numeroOrden || asignacion.order)?.toString(),
          asignacion.nombreCentro || asignacion.centro,
          asignacion.localidad,
          asignacion.municipio
        ].filter(Boolean);

        return searchFields.some(field => 
          field.toLowerCase().includes(searchTerm.toLowerCase())
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
  };
  
  // Filtrar asignaciones una sola vez para reusar
  const asignacionesFiltradas = filtrarAsignaciones();
  
  // Eliminar duplicados del mismo número de orden para estadísticas
  const asignacionesSinDuplicados = [];
  const ordenesVistosEstadisticas = {};
  
  // Ordenar por timestamp (más reciente primero)
  const asignacionesOrdenadasParaEstadisticas = [...assignments].sort((a, b) => {
    const timestampA = a?.timestamp || 0;
    const timestampB = b?.timestamp || 0;
    return timestampB - timestampA;
  });
  
  // Mantener solo la versión más reciente de cada número de orden
  for (const asignacion of asignacionesOrdenadasParaEstadisticas) {
    if (!asignacion) continue;
    
    const numeroOrden = asignacion.numeroOrden || asignacion.order;
    if (!numeroOrden) continue;
    
    if (!ordenesVistosEstadisticas[numeroOrden]) {
      ordenesVistosEstadisticas[numeroOrden] = true;
      asignacionesSinDuplicados.push(asignacion);
    }
  }
  
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
  const estadisticas = {
    total: asignacionesSinDuplicados.length,
    centros: [...new Set(asignacionesSinDuplicados
      .filter(a => a.estado !== "NO_ASIGNABLE") // Excluir las que no se pueden asignar
      .map(a => a.nombreCentro || a.centro))].length,
    reasignados: asignacionesSinDuplicados.filter(a => a.reasignado).length,
    noAsignables: asignacionesSinDuplicados.filter(a => a.estado === "NO_ASIGNABLE" || a.estado === "REASIGNACION_NO_VIABLE").length
  };
  
  // Obtener lista de estados únicos para el filtro
  const estados = ['TODOS', ...new Set(asignacionesFiltradas
    .filter(a => a.estado)
    .map(a => a.estado))];
  
  return (
    <div style={styles.container}>
      {/* Aviso de datos borrados */}
      <div style={{
        padding: '15px',
        backgroundColor: '#fef0f5',
        borderRadius: '8px',
        marginBottom: '20px',
        borderLeft: '4px solid #e53e3e',
        color: '#e53e3e'
      }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '18px' }}>
          ⚠️ Aviso Importante
        </h3>
        <p style={{ margin: '0 0 10px 0' }}>
          Los datos han sido borrados debido a un conflicto de numeraciones. El error ha sido resuelto.
        </p>
        <p style={{ margin: '0', fontWeight: 'bold' }}>
          Por favor, vuelva a introducir su solicitud.
        </p>
      </div>
      
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
          <div style={{
            ...styles.statCard,
            backgroundColor: estadisticas.noAsignables > 0 ? '#fff5f5' : '#ffffff',
            borderLeft: estadisticas.noAsignables > 0 ? '3px solid #f56565' : 'none'
          }}>
            <div style={{
              ...styles.statValue,
              color: estadisticas.noAsignables > 0 ? '#e53e3e' : '#2d3748'
            }}>
              {estadisticas.noAsignables}
            </div>
            <div style={styles.statLabel}>No asignables</div>
          </div>
        </div>
      </div>
      
      {/* Alerta para detectar centros con exceso de asignaciones */}
      {(() => {
        // Eliminar duplicados primero, igual que en filtrarAsignaciones
        const asignacionesSinDuplicados = [];
        const ordenesVistos = {};
        
        // Ordenar por timestamp (más reciente primero)
        const asignacionesOrdenadas = [...assignments].sort((a, b) => {
          const timestampA = a?.timestamp || 0;
          const timestampB = b?.timestamp || 0;
          return timestampB - timestampA;
        });
        
        // Mantener solo la versión más reciente de cada número de orden
        for (const asignacion of asignacionesOrdenadas) {
          if (!asignacion) continue;
          
          const numeroOrden = asignacion.numeroOrden || asignacion.order;
          if (!numeroOrden) continue;
          
          if (!ordenesVistos[numeroOrden]) {
            ordenesVistos[numeroOrden] = true;
            asignacionesSinDuplicados.push(asignacion);
          }
        }
        
        // Verificar centros con exceso
        const centrosConExceso = asignacionesSinDuplicados
          // Filtrar asignaciones no asignables o no viables
          .filter(asignacion => {
            // Excluir aquellas con noAsignable=true o estados específicos
            return !(
              asignacion.noAsignable === true || 
              asignacion.estado === "NO_ASIGNABLE" || 
              asignacion.estado === "REASIGNACION_NO_VIABLE"
            );
          })
          .reduce((acc, asignacion) => {
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
        
        <select
          value={filtroEstado}
          onChange={(e) => {
            setFiltroEstado(e.target.value);
            setCurrentPage(1); // Reiniciar página al filtrar
          }}
          style={styles.select}
        >
          <option value="TODOS">Todos los estados</option>
          <option value="ASIGNADA">Asignada</option>
          <option value="REASIGNADO">Reasignada</option>
          <option value="NO_ASIGNABLE">No se puede asignar</option>
          <option value="REASIGNACION_NO_VIABLE">No se puede reasignar</option>
        </select>
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
            {currentItems.map((asignacion, index) => {
              // Determinar estilo de fila según estado
              let rowStyle = {};
              
              if (asignacion.estado === "NO_ASIGNABLE") {
                rowStyle = { backgroundColor: '#fff5f5' }; // Fondo rojo claro
              } else if (asignacion.estado === "REASIGNACION_NO_VIABLE") {
                rowStyle = { backgroundColor: '#fffaf0' }; // Fondo naranja claro
              } else if (asignacion.reasignado) {
                rowStyle = { backgroundColor: '#fff9fb' }; // Fondo rosa claro
              }
              
              return (
                <tr key={asignacion.docId || index} style={rowStyle}>
                  <td style={styles.tableCell}>
                    <div style={styles.orderContainer}>
                      <div style={styles.orderBadge}>{asignacion.numeroOrden || asignacion.order}</div>
                    </div>
                  </td>
                  <td style={styles.tableCell}>
                    <div>
                      {asignacion.estado === "NO_ASIGNABLE" ? (
                        <div>
                          <div style={{
                            backgroundColor: '#f56565',
                            color: 'white',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            display: 'inline-block',
                            fontWeight: 'bold',
                            fontSize: '12px',
                            marginBottom: '5px'
                          }}>
                            No se puede asignar
                          </div>
                          <strong>{asignacion.nombreCentro || asignacion.centerName || asignacion.centro || "Centro seleccionado"}</strong>
                          <div style={{fontSize: '12px', color: '#d53f8c', marginTop: '4px'}}>
                            Reasignado: no hay plaza disponible
                          </div>
                        </div>
                      ) : asignacion.estado === "REASIGNACION_NO_VIABLE" ? (
                        <div>
                          <div style={{
                            backgroundColor: '#ed8936',
                            color: 'white',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            display: 'inline-block',
                            fontWeight: 'bold',
                            fontSize: '12px',
                            marginBottom: '5px'
                          }}>
                            No se puede reasignar
                          </div>
                          <strong>{asignacion.nombreCentro || asignacion.centerName || asignacion.centro}</strong>
                          <div style={{fontSize: '12px', color: '#d53f8c', marginTop: '4px'}}>
                            Reasignado: no hay plaza disponible
                          </div>
                        </div>
                      ) : (
                        <div>
                          <strong>{asignacion.nombreCentro || asignacion.centerName || asignacion.centro}</strong>
                          {asignacion.reasignado && (
                            <div style={{fontSize: '12px', color: '#d53f8c', marginTop: '4px'}}>
                              Reasignado: {asignacion.centroOriginal || asignacion.centroPrevio}
                            </div>
                          )}
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
                    </div>
                  </td>
                  <td style={styles.tableCell}>
                    {formatearFecha(asignacion.timestamp)}
                  </td>
                </tr>
              );
            })}
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
      
  
    </div>
  );
};

export default Dashboard; 