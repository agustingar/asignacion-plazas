import React from 'react';

/**
 * Componente que muestra el historial de asignaciones
 * @param {Object} props - Propiedades del componente
 * @param {Array} props.assignments - Lista de asignaciones
 * @returns {JSX.Element} - Componente Dashboard
 */
const Dashboard = ({ assignments }) => {
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
  
  // Ordenar los números de orden
  const ordenesOrdenados = Object.keys(asignacionesPorOrden)
    .map(Number)
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
    }
  };
  
  return (
    <div style={styles.container}>
      <div style={styles.infoContainer}>
        <div style={styles.statsContainer}>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>👥</div>
            <div style={styles.statContent}>
              <div style={styles.statValue}>{ordenesOrdenados.length}</div>
              <div style={styles.statLabel}>Personas asignadas</div>
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
        </div>
      </div>
      
      <div style={styles.infoBox}>
        <strong>Información importante:</strong> Las plazas han sido asignadas por número de orden (a menor número, mayor prioridad) y respetando el orden de preferencia de centros indicado por cada solicitante.
      </div>
      
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead style={styles.tableHeader}>
            <tr>
              <th style={{...styles.th, width: '12%'}}>Nº Orden</th>
              <th style={{...styles.th, width: '33%'}}>Centro de Trabajo</th>
              <th style={{...styles.th, width: '20%'}}>Localidad</th>
              <th style={{...styles.th, width: '20%'}}>Municipio</th>
              <th style={{...styles.th, width: '15%'}}>Fecha/Hora</th>
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
                
                return (
                  <tr 
                    key={`${orden}-${index}`} 
                    style={{
                      ...styles.tr,
                      backgroundColor: esPrioridad 
                        ? '#fff9e6' 
                        : (index % 2 === 0 ? 'white' : '#f8f9fa')
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = esPrioridad 
                        ? '#fff3cd' 
                        : '#f1f3f5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = esPrioridad 
                        ? '#fff9e6' 
                        : (index % 2 === 0 ? 'white' : '#f8f9fa');
                    }}
                  >
                    <td style={styles.td}>
                      <span style={{ fontWeight: esPrioridad ? 'bold' : 'normal' }}>
                        {orden}
                      </span>
                      {esPrioridad && (
                        <span style={styles.priorityBadge}>
                          Alta prioridad
                        </span>
                      )}
                    </td>
                    <td style={styles.td}>
                      <div style={styles.centerName}>{asignacion.centro}</div>
                    </td>
                    <td style={styles.td}>{asignacion.localidad}</td>
                    <td style={styles.td}>{asignacion.municipio}</td>
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