import React from 'react';

/**
 * Componente para mostrar una lista virtualizada de asignaciones
 */
const VirtualizedList = ({ items, asignacionesSeleccionadas, onSeleccionChange, onReasignar, onEliminar, assignments, availablePlazas }) => {
  if (!items || items.length === 0) {
    return <p>No hay asignaciones para mostrar.</p>;
  }

  const AsignacionRow = React.memo(({ 
    asignacion, 
    idx,
    isSelected,
    onSeleccionChange, 
    onReasignar,
    onEliminar,
    assignments,
    availablePlazas
  }) => {
    // Generar una key única usando múltiples campos y el índice
    const uniqueKey = asignacion.docId 
      ? `asig-${asignacion.docId}-${idx}` 
      : `asig-${idx}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Asegurar que tenemos un docId válido para la asignación
    if (!asignacion.docId) {
      console.warn(`Asignación sin docId detectada en índice ${idx}:`, asignacion);
      // Usar el campo id si está disponible, o crear uno temporal si no
      if (asignacion.id) {
        console.info(`Usando asignacion.id (${asignacion.id}) como docId`);
        asignacion.docId = asignacion.id;
      } else {
        // Si no tiene id ni docId, crear uno temporal
        asignacion.docId = `temp-${idx}-${Date.now()}`;
      }
    }
    
    // Determinar el número de orden (puede estar en order o numeroOrden)
    const numeroOrden = asignacion.order || asignacion.numeroOrden;
    
    // Determinar si es una asignación especial "no asignable"
    const esNoAsignable = asignacion.noAsignable === true || asignacion.estado === "NO_ASIGNABLE";
    const esReasignacionNoViable = asignacion.estado === "REASIGNACION_NO_VIABLE";
    
    // Determinar el nombre del centro
    const nombreCentro = esNoAsignable 
      ? "No hay plaza disponible" 
      : asignacion.nombreCentro || asignacion.centro || asignacion.centerName || 'Centro sin nombre';
    
    // Calcular plazas disponibles
    let plazasInfo = "";
    if (!esNoAsignable) {
      const centro = availablePlazas.find(c => c.id === asignacion.centerId);
      if (centro) {
        const plazasTotal = parseInt(centro.plazasTotal || centro.plazas || '0', 10);
        const asignacionesActivas = assignments.filter(a => 
          a.centerId === asignacion.centerId && 
          !a.noAsignable && 
          a.estado !== "NO_ASIGNABLE" && 
          a.estado !== "REASIGNACION_NO_VIABLE"
        ).length;
        
        const plazasOcupadas = centro.plazasOcupadas || centro.asignadas || asignacionesActivas || 0;
        const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
        
        plazasInfo = `${plazasDisponibles} de ${plazasTotal} plazas disponibles`;
      }
    }
    
    return (
      <tr style={{
        borderBottom: '1px solid #eee',
        backgroundColor: esNoAsignable ? '#ffebee' : esReasignacionNoViable ? '#fff8e1' : ''
      }}>
        <td style={{ padding: '10px', textAlign: 'center' }}>
          {!esNoAsignable && (
            <input
              type="checkbox"
              id={`asignacion-${asignacion.docId}`}
              checked={isSelected}
              onChange={(e) => onSeleccionChange(asignacion.docId, e.target.checked)}
            />
          )}
        </td>
        <td style={{ padding: '10px' }}>{numeroOrden}</td>
        <td style={{ padding: '10px' }}>
          <div style={{ fontWeight: 'bold' }}>{nombreCentro}</div>
          {!esNoAsignable && (
            <div style={{ fontSize: '12px', color: '#666' }}>
              {asignacion.localidad && `${asignacion.localidad}`}
              {asignacion.municipio && asignacion.municipio !== asignacion.localidad && ` - ${asignacion.municipio}`}
              {plazasInfo && <div style={{ marginTop: '3px', color: '#27ae60' }}>{plazasInfo}</div>}
            </div>
          )}
        </td>
        <td style={{ padding: '10px' }}>
          <span style={{
            display: 'inline-block',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            backgroundColor: esNoAsignable ? '#ffcdd2' : 
                             esReasignacionNoViable ? '#fff3e0' : 
                             asignacion.estado === 'ASIGNADA' ? '#e8f5e9' : '#e3f2fd',
            color: esNoAsignable ? '#c62828' : 
                   esReasignacionNoViable ? '#ef6c00' : 
                   asignacion.estado === 'ASIGNADA' ? '#2e7d32' : '#1565c0',
          }}>
            {asignacion.estado || 'Sin estado'}
          </span>
        </td>
        <td style={{ padding: '10px' }}>
          {!esNoAsignable && !esReasignacionNoViable ? (
            <div style={{ display: 'flex', gap: '5px' }}>
              <button 
                onClick={() => onReasignar(asignacion)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginRight: '5px'
                }}
                title="Reasignar esta asignación"
              >
                Reasignar
              </button>
              <button 
                onClick={() => onEliminar(asignacion)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
                title="Eliminar esta asignación"
              >
                Eliminar
              </button>
            </div>
          ) : (
            <span style={{ color: '#999', fontSize: '12px' }}>
              No disponible
            </span>
          )}
        </td>
      </tr>
    );
  });

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: '5px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ 
            backgroundColor: '#f5f5f5', 
            borderBottom: '2px solid #ddd',
            position: 'sticky',
            top: 0,
            zIndex: 1
          }}>
            <th style={{ padding: '10px' }}>Seleccionar</th>
            <th style={{ padding: '10px' }}>Orden</th>
            <th style={{ padding: '10px' }}>Centro</th>
            <th style={{ padding: '10px' }}>Estado</th>
            <th style={{ padding: '10px' }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((asignacion, idx) => {
            // Generar una clave verdaderamente única para cada fila
            // Usar una combinación de múltiples campos para evitar duplicados
            const rowKey = 
              (asignacion.docId || asignacion.id || '') + '-' + 
              (asignacion.order || asignacion.numeroOrden || '') + '-' + 
              (asignacion.timestamp || '') + '-' + 
              idx;
              
            return (
              <AsignacionRow
                key={rowKey}
                asignacion={asignacion}
                idx={idx}
                isSelected={asignacionesSeleccionadas[asignacion.docId || asignacion.id] || false}
                onSeleccionChange={onSeleccionChange}
                onReasignar={onReasignar}
                onEliminar={onEliminar}
                assignments={assignments}
                availablePlazas={availablePlazas}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default VirtualizedList; 