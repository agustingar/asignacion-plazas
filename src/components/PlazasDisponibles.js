import React, { useState, useEffect } from 'react';

/**
 * Componente que muestra las plazas disponibles con paginación y filtro
 * @param {Object} props - Propiedades del componente
 * @param {Array} props.availablePlazas - Array de plazas disponibles
 * @param {Array} props.assignments - Lista de asignaciones existentes
 * @param {String} props.searchTerm - Término de búsqueda
 * @param {Function} props.setSearchTerm - Función para actualizar el término de búsqueda 
 * @param {String} props.orderNumber - Número de orden
 * @param {Function} props.setOrderNumber - Función para actualizar el número de orden
 * @param {Array} props.centrosSeleccionados - Lista de centros seleccionados
 * @param {Function} props.setCentrosSeleccionados - Función para actualizar la lista de centros seleccionados
 * @param {Function} props.handleOrderSubmit - Función para manejar el envío del formulario
 * @param {Boolean} props.isProcessing - Indica si se está procesando una solicitud
 * @returns {JSX.Element} - Componente PlazasDisponibles
 */
const PlazasDisponibles = ({ 
  availablePlazas, 
  assignments,
  searchTerm,
  setSearchTerm,
  orderNumber,
  setOrderNumber,
  centrosSeleccionados,
  setCentrosSeleccionados,
  handleOrderSubmit,
  isProcessing
}) => {
  // Estados para paginación y filtro
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
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
  
  // Filtrar plazas por término de búsqueda
  const filteredPlazas = availablePlazas.filter(plaza => {
    if (!searchTerm) return true;
    
    const searchTermLower = searchTerm.toLowerCase();
    return (
      plaza.centro.toLowerCase().includes(searchTermLower) ||
      plaza.localidad.toLowerCase().includes(searchTermLower) ||
      plaza.municipio.toLowerCase().includes(searchTermLower)
    );
  });
  
  // Ordenar plazas por centros con plazas disponibles primero
  const sortedPlazas = [...filteredPlazas].sort((a, b) => {
    // Primero ordenar por disponibilidad
    const aDisponibles = a.plazas - a.asignadas;
    const bDisponibles = b.plazas - b.asignadas;
    
    if (bDisponibles === 0 && aDisponibles > 0) return -1;
    if (aDisponibles === 0 && bDisponibles > 0) return 1;
    
    // Luego por cantidad de plazas disponibles
    if (aDisponibles !== bDisponibles) return bDisponibles - aDisponibles;
    
    // Finalmente por nombre
    return a.centro.localeCompare(b.centro);
  });
  
  // Calcular el total de páginas
  const totalPages = Math.ceil(sortedPlazas.length / itemsPerPage);
  
  // Paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = sortedPlazas.slice(indexOfFirstItem, indexOfLastItem);
  
  // Cambiar página
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
  
  // Calcular totales
  const totalPlazas = availablePlazas.reduce((sum, plaza) => sum + plaza.plazas, 0);
  const totalAsignadas = availablePlazas.reduce((sum, plaza) => sum + plaza.asignadas, 0);
  const totalDisponibles = totalPlazas - totalAsignadas;
  
  // Manejar selección de centro
  const handleCentroChange = (e) => {
    const selectedId = Number(e.target.value);
    
    if (e.target.checked) {
      // Agregar a seleccionados si no está ya
      if (!centrosSeleccionados.includes(selectedId)) {
        setCentrosSeleccionados([...centrosSeleccionados, selectedId]);
      }
    } else {
      // Quitar de seleccionados y reordenar los índices
      const newSeleccionados = centrosSeleccionados.filter(id => id !== selectedId);
      setCentrosSeleccionados(newSeleccionados);
    }
  };
  
  return (
    <div>
      {/* Formulario para solicitar plaza */}
      <div style={{ 
        marginBottom: '25px', 
        padding: '20px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '8px', 
        border: '1px solid #e9ecef',
        boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
      }}>
        <h4 style={{ 
          fontSize: '18px', 
          color: '#343a40', 
          marginTop: 0, 
          marginBottom: '15px', 
          borderBottom: '2px solid #e9ecef', 
          paddingBottom: '10px' 
        }}>
          Solicitar una plaza
        </h4>
        
        <form onSubmit={handleOrderSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label 
              htmlFor="orderNumber" 
              style={{ 
                display: 'block', 
                marginBottom: '8px',
                fontWeight: 'bold',
                color: '#495057'
              }}
            >
              Número de Orden:
            </label>
            <input 
              type="number" 
              id="orderNumber"
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '12px 15px', 
                border: '1px solid #ddd', 
                borderRadius: '6px',
                fontSize: '16px',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.05)'
              }}
              required
              placeholder="Introduce tu número de orden"
            />
          </div>
          
          <div style={{ 
            padding: '10px 15px', 
            backgroundColor: '#e9f5fe', 
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '14px',
            borderLeft: '4px solid #3498db'
          }}>
            <strong>Importante:</strong> Selecciona tus centros por orden de preferencia. El primer centro que selecciones será tu primera opción.
          </div>
          
          {centrosSeleccionados.length > 0 && (
            <div style={{ 
              marginBottom: '20px', 
              padding: '15px', 
              backgroundColor: '#e8f5e9', 
              borderRadius: '6px',
              border: '1px solid #c8e6c9'
            }}>
              <strong style={{ color: '#2E7D32' }}>Centros seleccionados en orden de preferencia:</strong>
              <ol style={{ 
                paddingLeft: '25px', 
                marginTop: '10px', 
                marginBottom: '0',
                color: '#333'
              }}>
                {centrosSeleccionados.map((id, index) => {
                  const centro = availablePlazas.find(p => p.id === id);
                  return centro ? (
                    <li key={id} style={{ marginBottom: '8px' }}>
                      <strong>{centro.centro}</strong> 
                      <span style={{ color: '#555' }}>({centro.localidad}, {centro.municipio})</span>
                      {index === 0 && (
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
                    </li>
                  ) : null;
                })}
              </ol>
              
              <div style={{ marginTop: '10px', textAlign: 'right' }}>
                <button
                  type="button"
                  onClick={() => setCentrosSeleccionados([])}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#f8d7da',
                    color: '#721c24',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Limpiar selección
                </button>
              </div>
            </div>
          )}
          
          <div style={{ textAlign: 'center' }}>
            <button 
              type="submit"
              disabled={isProcessing || centrosSeleccionados.length === 0}
              style={{ 
                padding: '12px 25px', 
                backgroundImage: isProcessing ? 
                  'linear-gradient(to right, #cccccc, #dddddd)' : 
                  'linear-gradient(to right, #3498db, #2980b9)',
                color: 'white', 
                border: 'none', 
                borderRadius: '6px', 
                cursor: isProcessing || centrosSeleccionados.length === 0 ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: '500',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              {isProcessing ? (
                <>
                  <span style={{ 
                    display: 'inline-block', 
                    width: '18px', 
                    height: '18px', 
                    border: '3px solid rgba(255,255,255,0.3)', 
                    borderRadius: '50%', 
                    borderTopColor: 'white', 
                    animation: 'spin 1s linear infinite',
                    marginRight: '10px'
                  }} />
                  Procesando...
                </>
              ) : (
                <>Solicitar Plaza</>
              )}
            </button>
          </div>
        </form>
      </div>
            
      <div style={{ 
        marginBottom: '15px', 
        padding: '15px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '8px', 
        display: 'flex', 
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        boxShadow: 'inset 0 0 5px rgba(0,0,0,0.05)',
        gap: '10px'
      }}>
        <div style={{
          padding: '10px 15px',
          backgroundColor: 'white',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          flex: '1 1 200px',
          textAlign: 'center'
        }}>
          <strong>Total de centros:</strong> <span style={{ color: '#1976D2', fontWeight: 'bold' }}>{availablePlazas.length}</span>
        </div>
        <div style={{
          padding: '10px 15px',
          backgroundColor: 'white',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          flex: '1 1 200px',
          textAlign: 'center'
        }}>
          <strong>Total de plazas:</strong> <span style={{ color: '#1976D2', fontWeight: 'bold' }}>{totalPlazas}</span>
        </div>
        <div style={{
          padding: '10px 15px',
          backgroundColor: 'white',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          flex: '1 1 200px',
          textAlign: 'center'
        }}>
          <strong>Plazas asignadas:</strong> <span style={{ color: '#F44336', fontWeight: 'bold' }}>{totalAsignadas}</span>
        </div>
        <div style={{
          padding: '10px 15px',
          backgroundColor: 'white',
          borderRadius: '6px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          flex: '1 1 200px',
          textAlign: 'center'
        }}>
          <strong>Plazas disponibles:</strong> <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>{totalDisponibles}</span>
        </div>
      </div>
      
      <div style={{ marginBottom: '15px' }}>
        <div style={{ 
          marginBottom: '10px',
          position: 'relative' 
        }}>
          <input
            type="text"
            placeholder="Buscar centro, localidad o municipio..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
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
            Mostrando <strong>{sortedPlazas.length > 0 ? indexOfFirstItem + 1 : 0}-{Math.min(indexOfLastItem, sortedPlazas.length)}</strong> de <strong>{sortedPlazas.length}</strong> centros
            {searchTerm && ` (filtrados de ${availablePlazas.length})`}
          </div>
          
          <div>
            <select 
              value={itemsPerPage} 
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
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
              <option value={sortedPlazas.length}>Ver todos</option>
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
        WebkitOverflowScrolling: 'touch', // Para mejor scroll en iOS
        maxWidth: '100%'
      }}>
        <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? '768px' : 'auto' }}>
          <thead>
            <tr style={{ backgroundImage: 'linear-gradient(to right, #f7f9fc, #edf2fa)' }}>
              <th style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'left', position: 'sticky', top: 0, backgroundColor: '#f7f9fc' }}>Seleccionar</th>
              <th style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'left', position: 'sticky', top: 0, backgroundColor: '#f7f9fc' }}>Centro de Trabajo</th>
              <th style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'left', position: 'sticky', top: 0, backgroundColor: '#f7f9fc' }}>Localidad</th>
              <th style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'left', position: 'sticky', top: 0, backgroundColor: '#f7f9fc' }}>Municipio</th>
              <th style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'center', position: 'sticky', top: 0, backgroundColor: '#f7f9fc' }}>Plazas</th>
              <th style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'center', position: 'sticky', top: 0, backgroundColor: '#f7f9fc' }}>Disponibles</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map((plaza, index) => {
              // Calcular plazas disponibles
              const disponibles = plaza.plazas - plaza.asignadas;
              
              // Verificar si está en la lista de seleccionados y su orden
              const seleccionado = centrosSeleccionados.includes(plaza.id);
              const ordenSeleccion = seleccionado ? centrosSeleccionados.indexOf(plaza.id) + 1 : null;
              
              // Determinar el color de fondo según disponibilidad y selección
              let rowColor = index % 2 === 0 ? 'white' : '#f9f9f9';
              if (seleccionado) {
                rowColor = '#e6f7ff'; // Azul claro si está seleccionado
              } else if (disponibles === 0) {
                rowColor = '#ffe6e6'; // Rojo claro para centros sin plazas
              } else if (disponibles <= 2) {
                rowColor = '#fff3cd'; // Amarillo para centros con pocas plazas
              }
              
              // Generar una clave única utilizando docId (si existe) o combinación de id e índice
              const uniqueKey = plaza.docId || `plaza-${plaza.id}-${index}`;
              
              return (
                <tr 
                  key={uniqueKey}
                  style={{ 
                    backgroundColor: rowColor,
                    transition: 'background-color 0.2s ease'
                  }}
                  onClick={() => {
                    // Permitir seleccionar/deseleccionar haciendo clic en toda la fila
                    if (isMobile) {
                      if (seleccionado) {
                        setCentrosSeleccionados(centrosSeleccionados.filter(id => id !== plaza.id));
                      } else {
                        if (!centrosSeleccionados.includes(plaza.id)) {
                          setCentrosSeleccionados([...centrosSeleccionados, plaza.id]);
                        }
                      }
                    }
                  }}
                >
                  <td style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center' }}>
                      <input 
                        type="checkbox"
                        value={plaza.id}
                        onChange={handleCentroChange}
                        checked={seleccionado}
                        style={{ 
                          width: '20px', 
                          height: '20px',
                          cursor: 'pointer'
                        }}
                      />
                      {seleccionado && (
                        <span style={{
                          backgroundImage: 'linear-gradient(135deg, #1976D2, #2196F3)',
                          color: 'white',
                          borderRadius: '50%',
                          width: '28px',
                          height: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          fontSize: '14px',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                          {ordenSeleccion}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '12px 15px', fontWeight: 'bold' }}>{plaza.centro}</td>
                  <td style={{ border: '1px solid #ddd', padding: '12px 15px' }}>{plaza.localidad}</td>
                  <td style={{ border: '1px solid #ddd', padding: '12px 15px' }}>{plaza.municipio}</td>
                  <td style={{ border: '1px solid #ddd', padding: '12px 15px', textAlign: 'center' }}>{plaza.plazas}</td>
                  <td style={{ 
                    border: '1px solid #ddd', 
                    padding: '12px 15px', 
                    textAlign: 'center',
                    fontWeight: 'bold',
                    color: disponibles > 0 ? 'green' : 'red'
                  }}>
                    {disponibles}
                    {disponibles === 0 && (
                      <span style={{ 
                        display: 'block', 
                        fontSize: '11px', 
                        marginTop: '5px',
                        color: '#666',
                        fontWeight: 'normal'
                      }}>
                        Actualmente completo
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            
            {currentItems.length === 0 && (
              <tr>
                <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#666' }}>
                  {searchTerm ? 
                    `No se encontraron centros que coincidan con "${searchTerm}"` : 
                    'No hay centros disponibles para mostrar'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Paginación */}
      {sortedPlazas.length > itemsPerPage && (
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
                  backgroundColor: currentPage === pageToShow ? '#3498db' : 'white',
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
      
      {/* Estilos CSS */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default PlazasDisponibles; 