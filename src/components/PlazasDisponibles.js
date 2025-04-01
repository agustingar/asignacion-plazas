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
  const [infoModal, setInfoModal] = useState(null);
  
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
      plaza.centro?.toLowerCase().includes(searchTermLower) ||
      plaza.localidad?.toLowerCase().includes(searchTermLower) ||
      plaza.municipio?.toLowerCase().includes(searchTermLower) ||
      plaza.codigo?.toLowerCase().includes(searchTermLower) ||
      plaza.asi?.toLowerCase().includes(searchTermLower) ||
      plaza.departamento?.toLowerCase().includes(searchTermLower)
    );
  });
  
  // Filtrar y ordenar plazas
  const getFilteredPlazas = () => {
    return availablePlazas.filter(plaza => {
      // Filtrar por término de búsqueda
      if (searchTerm) {
        const searchTermLower = searchTerm.toLowerCase();
        const matchesSearch = 
          plaza.centro?.toLowerCase().includes(searchTermLower) ||
          plaza.localidad?.toLowerCase().includes(searchTermLower) ||
          plaza.municipio?.toLowerCase().includes(searchTermLower) ||
          plaza.codigo?.toLowerCase().includes(searchTermLower) ||
          plaza.asi?.toLowerCase().includes(searchTermLower) ||
          plaza.departamento?.toLowerCase().includes(searchTermLower);
        
        if (!matchesSearch) return false;
      }
      
      // Filtrar por ASI
      if (filterASI && plaza.asi !== filterASI) return false;
      
      // Filtrar por departamento
      if (filterDepartamento && plaza.departamento !== filterDepartamento) return false;
      
      // Filtrar por municipio
      if (filterMunicipio && plaza.municipio !== filterMunicipio) return false;
      
      return true;
    });
  };
  
  // Ordenar plazas por centros con plazas disponibles primero
  const sortedPlazas = [...getFilteredPlazas()].sort((a, b) => {
    // Primero ordenar por disponibilidad
    const aDisponibles = a.plazas - (a.asignadas || 0);
    const bDisponibles = b.plazas - (b.asignadas || 0);
    
    if (bDisponibles === 0 && aDisponibles > 0) return -1;
    if (aDisponibles === 0 && bDisponibles > 0) return 1;
    
    // Luego por cantidad de plazas disponibles
    if (aDisponibles !== bDisponibles) return bDisponibles - aDisponibles;
    
    // Finalmente por nombre del centro
    return a.centro?.localeCompare(b.centro || '') || 0;
  });
  
  // Calcular el total de páginas
  const totalPages = Math.ceil(sortedPlazas.length / itemsPerPage);
  
  // Paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentPlazas = sortedPlazas.slice(indexOfFirstItem, indexOfLastItem);
  
  // Calcular totales
  const totalPlazas = availablePlazas.reduce((sum, plaza) => sum + (plaza.plazas || 0), 0);
  const totalAsignadas = availablePlazas.reduce((sum, plaza) => sum + (plaza.asignadas || 0), 0);
  const totalDisponibles = totalPlazas - totalAsignadas;
  
  // Función para obtener opciones únicas para los filtros
  const getUniqueOptions = (field) => {
    const options = new Set();
    availablePlazas.forEach(plaza => {
      if (plaza[field]) options.add(plaza[field]);
    });
    return Array.from(options).sort();
  };
  
  // Obtener opciones únicas para los filtros
  const asiOptions = getUniqueOptions('asi');
  const departamentoOptions = getUniqueOptions('departamento');
  const municipioOptions = getUniqueOptions('municipio');
  
  // Estado para filtros adicionales
  const [filterASI, setFilterASI] = useState('');
  const [filterDepartamento, setFilterDepartamento] = useState('');
  const [filterMunicipio, setFilterMunicipio] = useState('');
  
  // Filtrar plazas según todos los criterios
  const getPaginationRange = () => {
    // Mostrar 5 páginas alrededor de la actual
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    } else if (currentPage <= 3) {
      return [1, 2, 3, 4, 5];
    } else if (currentPage >= totalPages - 2) {
      return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    } else {
      return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
    }
  };
  
  // Función para mostrar la información de la plaza
  const showInfo = (plaza) => {
    setInfoModal({
      ...plaza,
      disponibles: plaza.plazas - (plaza.asignadas || 0)
    });
  };
  
  // Cerrar modal de información
  const closeInfo = () => {
    setInfoModal(null);
  };
  
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
    <div className="plazas-container">
      <h2>Plazas Disponibles</h2>
      
      {/* Buscador mejorado */}
      <div className="search-container">
        <input
          type="text"
          className="search-box"
          placeholder="Buscar por centro, municipio o código..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
        />
        {searchTerm && (
          <button className="clear-search" onClick={() => setSearchTerm('')}>
            ×
          </button>
        )}
      </div>
      
      {/* Filtros */}
      <div className="filters-container">
        <select 
          className="filter-select" 
          value={searchTerm} 
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">Todos los centros</option>
          {availablePlazas.map(plaza => (
            <option key={plaza.id} value={plaza.centro}>{plaza.centro}</option>
          ))}
        </select>
        
        <select 
          className="filter-select" 
          value={searchTerm} 
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">Todos los municipios</option>
          {availablePlazas.map(plaza => (
            <option key={plaza.municipio} value={plaza.municipio}>{plaza.municipio}</option>
          ))}
        </select>
        
        <select 
          className="filter-select" 
          value={itemsPerPage} 
          onChange={(e) => {
            setItemsPerPage(Number(e.target.value));
            setCurrentPage(1);
          }}
        >
          <option value={10}>10 por página</option>
          <option value={25}>25 por página</option>
          <option value={50}>50 por página</option>
          <option value={100}>100 por página</option>
        </select>
      </div>
      
      {/* Contador de resultados */}
      <div className="results-info">
        <span>Mostrando {currentPlazas.length} de {sortedPlazas.length} centros</span>
        <span>Total plazas: {totalPlazas}</span>
      </div>
      
      {/* Tabla de plazas */}
      <div className="plazas-grid">
        {sortedPlazas.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <p>No se encontraron plazas con los criterios seleccionados.</p>
            <button 
              className="reset-filters" 
              onClick={() => {
                setSearchTerm('');
                setCurrentPage(1);
              }}
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <table className="tabla-plazas">
            <thead>
              <tr>
                <th style={{width: '60px'}}></th>
                <th>Código</th>
                <th className="centro-column">Centro</th>
                <th>Municipio</th>
                <th>Plazas</th>
                {windowWidth < 768 && <th style={{width: '40px'}}>Info</th>}
              </tr>
            </thead>
            <tbody>
              {currentPlazas.map((plaza, index) => {
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
                    <td>
                      <input 
                        type="checkbox"
                        value={plaza.id}
                        onChange={(e) => {
                          const selectedId = Number(e.target.value);
                          if (e.target.checked) {
                            setCentrosSeleccionados([...centrosSeleccionados, selectedId]);
                          } else {
                            setCentrosSeleccionados(centrosSeleccionados.filter(id => id !== selectedId));
                          }
                        }}
                        checked={seleccionado}
                        style={{ 
                          width: '20px', 
                          height: '20px',
                          cursor: 'pointer'
                        }}
                      />
                    </td>
                    <td>{plaza.codigo}</td>
                    <td className="centro-column" title={plaza.centro}>
                      {plaza.centro}
                    </td>
                    <td>{plaza.municipio}</td>
                    <td>{plaza.plazas}</td>
                    {windowWidth < 768 && (
                      <td>
                        <button 
                          className="info-button" 
                          onClick={(e) => {
                            e.stopPropagation();
                            showInfo(plaza);
                          }}
                        >
                          ℹ️
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      
      {/* Paginación */}
      {sortedPlazas.length > 0 && (
        <div className="pagination">
          <button 
            className="pagination-button" 
            onClick={() => setCurrentPage(1)} 
            disabled={currentPage === 1}
          >
            ««
          </button>
          <button 
            className="pagination-button" 
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
            disabled={currentPage === 1}
          >
            «
          </button>
          
          {getPaginationRange().map((page) => (
            <button
              key={page}
              className={`pagination-button ${currentPage === page ? 'active' : ''}`} 
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}
          
          <button 
            className="pagination-button" 
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
            disabled={currentPage === totalPages}
          >
            »
          </button>
          <button 
            className="pagination-button" 
            onClick={() => setCurrentPage(totalPages)} 
            disabled={currentPage === totalPages}
          >
            »»
          </button>
        </div>
      )}
      
      {/* Modal de información para móviles */}
      {infoModal && (
        <div className="info-modal">
          <div className="info-content">
            <h3>Información del centro</h3>
            <p><strong>Centro:</strong> {infoModal.centro}</p>
            <p><strong>Código:</strong> {infoModal.codigo}</p>
            <p><strong>Municipio:</strong> {infoModal.municipio}</p>
            <p><strong>Departamento:</strong> {infoModal.departamento}</p>
            <p><strong>ASI:</strong> {infoModal.asi}</p>
            <p><strong>Plazas disponibles:</strong> {infoModal.disponibles}</p>
            <div className="modal-footer">
              <button className="close-button" onClick={closeInfo}>Cerrar</button>
              <button 
                className="select-button" 
                onClick={() => {
                  setCentrosSeleccionados(centrosSeleccionados.filter(id => id !== infoModal.id));
                  closeInfo();
                }}
              >
                Deseleccionar
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Estilos CSS */}
      <style>{`
        .plazas-container {
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
          padding: 20px;
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        
        .search-container {
          position: relative;
          margin-bottom: 15px;
          width: 100%;
        }
        
        .search-box {
          width: 100%;
          padding: 14px 16px;
          border: 2px solid #ddd;
          border-radius: 6px;
          font-size: 16px;
          transition: border-color 0.3s;
        }
        
        .search-box:focus {
          border-color: #1976d2;
          outline: none;
          box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.2);
        }
        
        .clear-search {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #999;
        }
        
        .clear-search:hover {
          color: #333;
        }
        
        .filters-container {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 15px;
        }
        
        .filter-select {
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          min-width: 150px;
          flex-grow: 1;
        }
        
        .results-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
          font-size: 14px;
          color: #555;
          font-weight: 500;
        }
        
        .plazas-grid {
          overflow-y: auto;
          height: 100%;
          border: 1px solid #eee;
          border-radius: 4px;
          margin-bottom: 15px;
        }
        
        .tabla-plazas {
          width: 100%;
          border-collapse: collapse;
        }
        
        .tabla-plazas th {
          background-color: #f5f5f5;
          position: sticky;
          top: 0;
          padding: 12px 10px;
          text-align: left;
          border-bottom: 2px solid #ddd;
          z-index: 10;
          font-weight: 600;
        }
        
        .tabla-plazas td {
          padding: 12px 10px;
          border-bottom: 1px solid #eee;
        }
        
        .centro-column {
          max-width: 300px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .tabla-plazas tr:hover {
          background-color: #f9f9f9;
        }
        
        .selected-row {
          background-color: #e3f2fd;
        }
        
        .selected-row:hover {
          background-color: #bbdefb;
        }
        
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 0;
          text-align: center;
          color: #757575;
        }
        
        .empty-icon {
          font-size: 48px;
          margin-bottom: 20px;
        }
        
        .reset-filters {
          margin-top: 15px;
          padding: 8px 16px;
          background-color: #1976d2;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .pagination {
          display: flex;
          justify-content: center;
          gap: 5px;
          margin-top: 15px;
          flex-wrap: wrap;
        }
        
        .pagination-button {
          padding: 8px 12px;
          border: 1px solid #ddd;
          background-color: white;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .pagination-button.active {
          background-color: #1976d2;
          color: white;
          border-color: #1976d2;
        }
        
        .pagination-button:hover:not(:disabled) {
          background-color: #f0f0f0;
          border-color: #bbb;
        }
        
        .pagination-button:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
        
        .info-button {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 18px;
          padding: 2px;
        }
        
        .info-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        
        .info-content {
          background-color: white;
          border-radius: 8px;
          padding: 20px;
          width: 90%;
          max-width: 500px;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }
        
        .info-content h3 {
          margin-top: 0;
          color: #1a237e;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
        }
        
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
          border-top: 1px solid #eee;
          padding-top: 15px;
        }
        
        .close-button, .select-button {
          padding: 8px 16px;
          border-radius: 4px;
          border: none;
          cursor: pointer;
        }
        
        .close-button {
          background-color: #f5f5f5;
          color: #333;
        }
        
        .select-button {
          background-color: #1976d2;
          color: white;
        }
        
        /* Diseño responsive */
        @media (max-width: 768px) {
          .plazas-container {
            padding: 15px 10px;
          }
          
          .filters-container {
            flex-direction: column;
            gap: 8px;
          }
          
          .filter-select {
            width: 100%;
          }
          
          .tabla-plazas th, .tabla-plazas td {
            padding: 10px 5px;
            font-size: 14px;
          }
          
          .centro-column {
            max-width: 120px;
          }
          
          .pagination-button {
            padding: 6px 10px;
          }
        }
      `}</style>
    </div>
  );
};

export default PlazasDisponibles; 