import React, { useState } from 'react';

/**
 * Componente que muestra el historial de asignaciones
 * @param {Object} props - Propiedades del componente
 * @param {Array} props.assignments - Lista de asignaciones
 * @returns {JSX.Element} - Componente Dashboard
 */
const Dashboard = ({ assignments }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS'); // Nuevo estado para filtrar por tipo
  
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
  
  // Agrupar asignaciones por número de orden
  const asignacionesPorOrden = assignments.reduce((acc, asignacion) => {
    if (!acc[asignacion.order]) {
      acc[asignacion.order] = [];
    }
    acc[asignacion.order].push(asignacion);
    return acc;
  }, {});
  
  // Obtener todos los números de orden
  const todosLosOrdenes = Object.keys(asignacionesPorOrden).map(Number);
  
  // Filtrar órdenes según término de búsqueda y estado
  const ordenesOrdenados = todosLosOrdenes
    .filter(orden => {
      if (!searchTerm) return true;
      
      const ordenStr = orden.toString();
      // Verificar si el número de orden coincide con la búsqueda
      if (ordenStr.includes(searchTerm.toLowerCase())) return true;
      
      // Buscar en los centros de este número de orden
      const asignacionesDeEsteOrden = asignacionesPorOrden[orden];
      return asignacionesDeEsteOrden.some(asignacion => {
        const centroInfo = [
          asignacion.centro,
          asignacion.municipio,
          asignacion.localidad,
          asignacion.codigo,
          asignacion.estado, // También buscar en el estado
          asignacion.mensaje // Y en el mensaje
        ].filter(Boolean).join(' ').toLowerCase();
        
        return centroInfo.includes(searchTerm.toLowerCase());
      });
    })
    // Filtrar por estado si no es "TODOS"
    .filter(orden => {
      if (filtroEstado === 'TODOS') return true;
      
      const asignacionesDeEsteOrden = asignacionesPorOrden[orden];
      return asignacionesDeEsteOrden.some(asignacion => 
        asignacion.estado === filtroEstado
      );
    })
    .sort((a, b) => a - b);
  
  // Estilos para el componente
  const styles = {
    container: {
      position: 'relative'
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
      backgroundColor: 'white',
      padding: '12px 18px',
      borderRadius: '8px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
      border: '1px solid #eaeaea',
      minWidth: '120px',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    },
    statIcon: {
      backgroundColor: '#e6f7ff',
      borderRadius: '50%',
      width: '40px',
      height: '40px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '18px',
      color: '#1890ff'
    },
    statContent: {
      flex: 1
    },
    statValue: {
      fontSize: '18px',
      fontWeight: 'bold',
      color: '#2c3e50'
    },
    statLabel: {
      fontSize: '12px',
      color: '#95a5a6'
    },
    infoBox: {
      padding: '12px 15px',
      backgroundColor: '#f8f9fa',
      borderRadius: '6px',
      marginBottom: '20px',
      borderLeft: '4px solid #3498db',
      fontSize: '14px',
      color: '#2c3e50',
      lineHeight: '1.5'
    },
    searchContainer: {
      marginBottom: '20px',
      position: 'relative',
      width: '100%'
    },
    searchInput: {
      width: '100%',
      padding: '12px 15px',
      paddingLeft: '40px',
      border: '1px solid #ddd',
      borderRadius: '6px',
      fontSize: '16px',
      boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)',
      boxSizing: 'border-box'
    },
    searchIcon: {
      position: 'absolute',
      left: '12px',
      top: '50%',
      transform: 'translateY(-50%)',
      color: '#666',
      fontSize: '18px',
      pointerEvents: 'none'
    },
    clearButton: {
      position: 'absolute',
      right: '12px',
      top: '50%',
      transform: 'translateY(-50%)',
      background: 'none',
      border: 'none',
      fontSize: '18px',
      cursor: 'pointer',
      color: '#999',
      display: searchTerm ? 'block' : 'none'
    },
    resultsInfo: {
      fontSize: '14px',
      color: '#666',
      marginBottom: '15px'
    },
    tableContainer: {
      overflowX: 'auto',
      paddingBottom: '5px',
      border: '1px solid #eaeaea',
      borderRadius: '8px'
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse'
    },
    tableHeader: {
      backgroundImage: 'linear-gradient(to right, #f8f9fa, #e9ecef)',
      position: 'sticky',
      top: 0,
      zIndex: 10
    },
    th: {
      textAlign: 'left',
      padding: '14px 16px',
      fontSize: '14px',
      fontWeight: '600',
      color: '#495057',
      borderBottom: '2px solid #dee2e6'
    },
    tr: {
      transition: 'background-color 0.2s ease'
    },
    td: {
      padding: '14px 16px',
      borderBottom: '1px solid #e9ecef',
      fontSize: '14px',
      verticalAlign: 'middle'
    },
    priorityBadge: {
      display: 'inline-block',
      padding: '3px 8px',
      backgroundColor: '#fff3cd',
      color: '#856404',
      borderRadius: '30px',
      fontSize: '11px',
      fontWeight: '600',
      marginLeft: '8px'
    },
    centerName: {
      fontWeight: '600',
      color: '#2c3e50'
    },
    timestamp: {
      color: '#7f8c8d',
      fontSize: '13px'
    },
    emptyResults: {
      textAlign: 'center',
      padding: '30px 20px',
      color: '#666',
      backgroundColor: '#f9f9f9',
      borderRadius: '6px',
      margin: '10px 0'
    },
    // Estilos para asignaciones con estados especiales
    noAsignable: {
      backgroundColor: '#fff0f0',
      borderLeft: '3px solid #e57373',
    },
    fueraDeOrden: {
      backgroundColor: '#fff3e0',
      borderLeft: '3px solid #ffb74d',
    },
    estadoBadge: {
      display: 'inline-block',
      padding: '3px 8px',
      borderRadius: '30px',
      fontSize: '11px',
      fontWeight: '600',
      marginRight: '8px'
    },
    badgeNoAsignable: {
      backgroundColor: '#ffebee',
      color: '#c62828',
      border: '1px solid #ef9a9a'
    },
    badgeFueraDeOrden: {
      backgroundColor: '#fff3e0',
      color: '#e65100',
      border: '1px solid #ffcc80'
    },
    badgeAsignada: {
      backgroundColor: '#e8f5e9',
      color: '#2e7d32',
      border: '1px solid #a5d6a7'
    },
    // Añadir contenedor de filtros
    filtrosContainer: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '15px',
      flexWrap: 'wrap'
    },
    filtroEstado: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap'
    },
    botonFiltro: {
      padding: '5px 10px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: '500',
      border: '1px solid #ddd',
      backgroundColor: '#f8f9fa',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    },
    botonFiltroActivo: {
      backgroundColor: '#4285f4',
      color: 'white',
      borderColor: '#4285f4'
    },
    mensajeRazon: {
      fontSize: '13px',
      color: '#666',
      fontStyle: 'italic',
      marginTop: '5px'
    }
  };
  
  // Calcular el total de asignaciones filtradas
  const totalAsignacionesFiltradas = ordenesOrdenados.reduce((total, orden) => {
    return total + asignacionesPorOrden[orden].length;
  }, 0);
  
  // Contar los diferentes estados
  const conteoEstados = { ASIGNADA: 0, NO_ASIGNABLE: 0, FUERA_DE_ORDEN: 0, OTROS: 0 };
  assignments.forEach(asignacion => {
    const estado = asignacion.estado || "OTROS";
    if (conteoEstados.hasOwnProperty(estado)) {
      conteoEstados[estado]++;
    } else {
      conteoEstados.OTROS++;
    }
  });
  
  return (
    <div style={styles.container}>
      <div style={styles.infoContainer}>
        <div style={styles.statsContainer}>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>👥</div>
            <div style={styles.statContent}>
              <div style={styles.statValue}>{Object.keys(asignacionesPorOrden).length}</div>
              <div style={styles.statLabel}>Personas en el historial</div>
            </div>
          </div>
          
          <div style={styles.statCard}>
            <div style={styles.statIcon}>🏢</div>
            <div style={styles.statContent}>
              <div style={styles.statValue}>
                {new Set(assignments.map(a => a.centroId || a.id)).size}
              </div>
              <div style={styles.statLabel}>Centros con asignaciones</div>
            </div>
          </div>
          
          {/* Nuevas tarjetas para mostrar estadísticas de estados */}
          <div style={styles.statCard}>
            <div style={{...styles.statIcon, color: '#c62828'}}>❌</div>
            <div style={styles.statContent}>
              <div style={styles.statValue}>{conteoEstados.NO_ASIGNABLE}</div>
              <div style={styles.statLabel}>No Asignables</div>
            </div>
          </div>
          
          <div style={styles.statCard}>
            <div style={{...styles.statIcon, color: '#e65100'}}>⚠️</div>
            <div style={styles.statContent}>
              <div style={styles.statValue}>{conteoEstados.FUERA_DE_ORDEN}</div>
              <div style={styles.statLabel}>Fuera de Orden</div>
            </div>
          </div>
        </div>
      </div>
      
      <div style={styles.infoBox}>
        <strong>Información importante:</strong> Las plazas han sido asignadas por número de orden (a menor número, mayor prioridad) y respetando el orden de preferencia de centros indicado por cada solicitante.
      </div>
      
      {/* Filtros por estado */}
      <div style={styles.filtrosContainer}>
        <div style={styles.filtroEstado}>
          <button 
            style={{
              ...styles.botonFiltro,
              ...(filtroEstado === 'TODOS' ? styles.botonFiltroActivo : {})
            }}
            onClick={() => setFiltroEstado('TODOS')}
          >
            Todos
          </button>
          <button 
            style={{
              ...styles.botonFiltro,
              ...(filtroEstado === 'ASIGNADA' ? styles.botonFiltroActivo : {}),
              backgroundColor: filtroEstado === 'ASIGNADA' ? '#2e7d32' : undefined
            }}
            onClick={() => setFiltroEstado('ASIGNADA')}
          >
            Asignados
          </button>
          <button 
            style={{
              ...styles.botonFiltro,
              ...(filtroEstado === 'NO_ASIGNABLE' ? styles.botonFiltroActivo : {}),
              backgroundColor: filtroEstado === 'NO_ASIGNABLE' ? '#c62828' : undefined
            }}
            onClick={() => setFiltroEstado('NO_ASIGNABLE')}
          >
            No Asignables
          </button>
          <button 
            style={{
              ...styles.botonFiltro,
              ...(filtroEstado === 'FUERA_DE_ORDEN' ? styles.botonFiltroActivo : {}),
              backgroundColor: filtroEstado === 'FUERA_DE_ORDEN' ? '#e65100' : undefined
            }}
            onClick={() => setFiltroEstado('FUERA_DE_ORDEN')}
          >
            Fuera de Orden
          </button>
        </div>
        
        {/* Buscador */}
        <div style={styles.searchContainer}>
          <span style={styles.searchIcon}>🔍</span>
          <input
            type="text"
            placeholder="Buscar por número de orden, centro o municipio..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={styles.searchInput}
          />
          <button 
            style={styles.clearButton}
            onClick={() => setSearchTerm('')}
            aria-label="Limpiar búsqueda"
          >
            ×
          </button>
        </div>
      </div>
      
      {/* Información de resultados */}
      <div style={styles.resultsInfo}>
        Mostrando {totalAsignacionesFiltradas} elementos
        {searchTerm && ` (filtrados de ${assignments.length})`}
        {filtroEstado !== 'TODOS' && ` con estado ${filtroEstado}`}
      </div>
      
      {ordenesOrdenados.length === 0 && (searchTerm || filtroEstado !== 'TODOS') && (
        <div style={styles.emptyResults}>
          <p>No se encontraron elementos {filtroEstado !== 'TODOS' ? `con estado ${filtroEstado}` : ''} {searchTerm ? `que coincidan con: "${searchTerm}"` : ''}</p>
          <button 
            onClick={() => {
              setSearchTerm('');
              setFiltroEstado('TODOS');
            }}
            style={{
              padding: '6px 12px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Limpiar filtros
          </button>
        </div>
      )}
      
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead style={styles.tableHeader}>
            <tr>
              <th style={{...styles.th, width: '12%'}}>Nº Orden</th>
              <th style={{...styles.th, width: '20%'}}>Estado</th>
              <th style={{...styles.th, width: '28%'}}>Centro/Información</th>
              <th style={{...styles.th, width: '20%'}}>Localidad</th>
              <th style={{...styles.th, width: '20%'}}>Fecha/Hora</th>
            </tr>
          </thead>
          <tbody>
            {ordenesOrdenados.map(orden => {
              // Para cada orden, mostrar todas sus asignaciones
              const asignacionesDeEsteOrden = asignacionesPorOrden[orden];
              
              return asignacionesDeEsteOrden.map((asignacion, index) => {
                // Convertir timestamp a objeto Date
                const fecha = new Date(asignacion.timestamp);
                const fechaFormateada = `${fecha.toLocaleDateString()} ${fecha.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
                
                // Destacar órdenes bajos (alta prioridad)
                const esPrioridad = orden <= 50;
                
                // Determinar estilo según el estado
                let estiloFila = {};
                let badgeEstilo = {};
                let estadoTexto = asignacion.estado || 'ASIGNADA';
                
                if (asignacion.estado === 'NO_ASIGNABLE') {
                  estiloFila = styles.noAsignable;
                  badgeEstilo = styles.badgeNoAsignable;
                } else if (asignacion.estado === 'FUERA_DE_ORDEN') {
                  estiloFila = styles.fueraDeOrden;
                  badgeEstilo = styles.badgeFueraDeOrden;
                } else if (asignacion.estado === 'ASIGNADA' || !asignacion.estado) {
                  badgeEstilo = styles.badgeAsignada;
                }
                
                // Destacar coincidencias del término de búsqueda si existe
                const destacarSiCoincide = (texto) => {
                  if (!searchTerm || !texto) return texto;
                  
                  const regex = new RegExp(`(${searchTerm})`, 'gi');
                  const partes = texto.toString().split(regex);
                  
                  if (partes.length <= 1) return texto;
                  
                  return (
                    <span>
                      {partes.map((parte, i) => 
                        regex.test(parte) ? 
                          <span key={i} style={{backgroundColor: '#ffff00', fontWeight: 'bold'}}>{parte}</span> : 
                          parte
                      )}
                    </span>
                  );
                };
                
                return (
                  <tr 
                    key={`${orden}-${index}`} 
                    style={{
                      ...styles.tr,
                      ...estiloFila,
                      backgroundColor: estiloFila.backgroundColor ||
                        (esPrioridad 
                          ? '#fff9e6' 
                          : (index % 2 === 0 ? 'white' : '#f8f9fa'))
                    }}
                    onMouseEnter={(e) => {
                      if (!estiloFila.backgroundColor) {
                        e.currentTarget.style.backgroundColor = esPrioridad 
                          ? '#fff3cd' 
                          : '#f1f3f5';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!estiloFila.backgroundColor) {
                        e.currentTarget.style.backgroundColor = esPrioridad 
                          ? '#fff9e6' 
                          : (index % 2 === 0 ? 'white' : '#f8f9fa');
                      }
                    }}
                  >
                    <td style={styles.td}>
                      <span style={{ fontWeight: esPrioridad ? 'bold' : 'normal' }}>
                        {destacarSiCoincide(orden)}
                      </span>
                      {esPrioridad && (
                        <span style={styles.priorityBadge}>
                          Alta prioridad
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <span style={{...styles.estadoBadge, ...badgeEstilo}}>
                        {estadoTexto}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.centerName}>
                        {asignacion.estado === 'NO_ASIGNABLE' || asignacion.estado === 'FUERA_DE_ORDEN' 
                          ? 'No asignado' 
                          : destacarSiCoincide(asignacion.centro)
                        }
                      </div>
                      {/* Mostrar mensaje o razón si existe */}
                      {asignacion.mensaje && (
                        <div style={styles.mensajeRazon}>
                          {destacarSiCoincide(asignacion.mensaje)}
                        </div>
                      )}
                    </td>
                    <td style={styles.td}>
                      {asignacion.estado === 'NO_ASIGNABLE' || asignacion.estado === 'FUERA_DE_ORDEN' 
                        ? '-' 
                        : destacarSiCoincide(asignacion.localidad)
                      }
                    </td>
                    <td style={styles.td}>
                      <div style={styles.timestamp}>{fechaFormateada}</div>
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard; 