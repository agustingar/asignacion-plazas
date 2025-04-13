import React, { useState, useMemo, useEffect } from 'react';
import { Pagination } from '@mui/material';
import { procesarInfoCentro } from '../../utils/centerUtils';

const ITEMS_PER_PAGE = 10;

/**
 * Componente para visualizar centros con filtros avanzados
 */
const CenterView = ({ availablePlazas = [], assignments = [] }) => {
  // Estados
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filtroMunicipio, setFiltroMunicipio] = useState('');
  const [filtroLocalidad, setFiltroLocalidad] = useState('');
  const [filtroPlazas, setFiltroPlazas] = useState('todas');

  // Procesar información de centros - asegurando unicidad por ID/código
  const centrosProcesados = useMemo(() => {
    // Crear un Map para mantener centros únicos por ID
    const centrosUnicos = new Map();
    
    // Asegurarse de que availablePlazas siempre sea un array y filtrar entradas no válidas
    const plazasArray = Array.isArray(availablePlazas) ? availablePlazas : [];
    const plazasValidas = plazasArray.filter(centro => centro && typeof centro === 'object');
    
    plazasValidas.forEach(centro => {
      // Extraer código o generar un ID apropiado
      const codigo = centro.codigo || '';
      const nombre = centro.nombre || centro.centro || centro.nombreCentro || '';
      const municipio = centro.municipio || '';
      
      // Usar un ID confiable (preferir código si existe)
      const id = codigo || centro.id || centro.docId || `${nombre}-${municipio}`.trim();
      
      if (!id) return; // Ignorar centros sin ID válido
      
      if (!centrosUnicos.has(id)) {
        // Procesar campos con valores por defecto seguros
        const localidad = centro.localidad || municipio || '';
        
        // Calcular plazas totales y disponibles
        const plazasTotal = parseInt(centro.plazasTotal || centro.plazas || '0', 10) || 0;
        const plazasOcupadas = parseInt(centro.plazasOcupadas || centro.asignadas || '0', 10) || 0;
        const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
        
        centrosUnicos.set(id, {
          ...centro,
          id,
          codigo,
          nombre,
          municipio,
          localidad,
          plazasTotal,
          plazasDisponibles
        });
      }
    });
    
    // Convertir Map a Array
    return Array.from(centrosUnicos.values());
  }, [availablePlazas]);

  // Filtrar centros
  const centrosFiltrados = useMemo(() => {
    if (!searchTerm && !filtroMunicipio && !filtroLocalidad && filtroPlazas === 'todas') {
      return centrosProcesados;
    }

    return centrosProcesados.filter(centro => {
      if (!centro) return false;

      // Filtro por término de búsqueda
      const searchLower = searchTerm.toLowerCase().trim();
      const matchesSearch = !searchTerm || (
        (centro.nombre?.toLowerCase().includes(searchLower) || false) ||
        (centro.municipio?.toLowerCase().includes(searchLower) || false) ||
        (centro.localidad?.toLowerCase().includes(searchLower) || false) ||
        (centro.codigo?.toLowerCase().includes(searchLower) || false)
      );

      // Filtro por municipio
      const matchesMunicipio = !filtroMunicipio || 
        centro.municipio?.toLowerCase() === filtroMunicipio.toLowerCase();

      // Filtro por localidad
      const matchesLocalidad = !filtroLocalidad || 
        centro.localidad?.toLowerCase() === filtroLocalidad.toLowerCase();

      // Filtro por plazas disponibles
      let matchesPlazas = true;
      if (filtroPlazas === 'disponibles') {
        matchesPlazas = centro.plazasDisponibles > 0;
      } else if (filtroPlazas === 'completas') {
        matchesPlazas = centro.plazasDisponibles === 0;
      }

      return matchesSearch && matchesMunicipio && matchesLocalidad && matchesPlazas;
    });
  }, [centrosProcesados, searchTerm, filtroMunicipio, filtroLocalidad, filtroPlazas]);

  // Obtener municipios únicos
  const municipios = useMemo(() => {
    const unique = new Set();
    centrosProcesados.forEach(centro => {
      if (centro?.municipio) unique.add(centro.municipio);
    });
    return Array.from(unique).sort();
  }, [centrosProcesados]);

  // Obtener localidades únicas
  const localidades = useMemo(() => {
    const unique = new Set();
    centrosProcesados.forEach(centro => {
      if (centro?.localidad) unique.add(centro.localidad);
    });
    return Array.from(unique).sort();
  }, [centrosProcesados]);

  // Calcular páginas
  const totalPages = Math.ceil(centrosFiltrados.length / ITEMS_PER_PAGE);
  const indexOfLastItem = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstItem = indexOfLastItem - ITEMS_PER_PAGE;
  const currentItems = centrosFiltrados.slice(indexOfFirstItem, indexOfLastItem);

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filtroMunicipio, filtroLocalidad, filtroPlazas]);

  return (
    <div style={{ padding: '20px' }}>
      {/* Contador de centros y plazas */}
      <div style={{ 
        marginBottom: '20px',
        padding: '15px',
        backgroundColor: '#f8f9fa',
        borderRadius: '5px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ margin: '0 0 5px 0' }}>Total de Centros: {centrosProcesados.length}</h3>
            <p style={{ margin: '0' }}>Centros filtrados: {centrosFiltrados.length}</p>
          </div>
          <div style={{ 
            backgroundColor: '#e6f7ff', 
            padding: '10px', 
            borderRadius: '5px',
            borderLeft: '4px solid #1890ff'
          }}>
            <p style={{ fontWeight: 'bold', margin: '0 0 5px 0' }}>Recuento de Plazas:</p>
            <div style={{ display: 'flex', gap: '15px' }}>
              <div>
                <span style={{ fontSize: '14px' }}>Total: </span>
                <span style={{ fontWeight: 'bold' }}>
                  {centrosProcesados.reduce((acc, centro) => acc + centro.plazasTotal, 0)}
                </span>
              </div>
              <div>
                <span style={{ fontSize: '14px' }}>Disponibles: </span>
                <span style={{ fontWeight: 'bold', color: '#27ae60' }}>
                  {centrosProcesados.reduce((acc, centro) => acc + centro.plazasDisponibles, 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {searchTerm && (
          <div style={{ backgroundColor: '#fff8e6', padding: '8px', borderRadius: '4px', marginTop: '5px' }}>
            <p style={{ margin: '0' }}>Buscando: <strong>"{searchTerm}"</strong></p>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        marginBottom: '20px',
        flexWrap: 'wrap'
      }}>
        <input
          type="text"
          placeholder="Buscar por nombre, municipio, localidad o código..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ 
            padding: '8px', 
            borderRadius: '4px', 
            border: '1px solid #ddd',
            flex: '1',
            minWidth: '200px'
          }}
        />
        
        <select
          value={filtroMunicipio}
          onChange={(e) => setFiltroMunicipio(e.target.value)}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
        >
          <option value="">Todos los municipios</option>
          {municipios.map(municipio => (
            <option key={municipio} value={municipio}>{municipio}</option>
          ))}
        </select>

        <select
          value={filtroLocalidad}
          onChange={(e) => setFiltroLocalidad(e.target.value)}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
        >
          <option value="">Todas las localidades</option>
          {localidades.map(localidad => (
            <option key={localidad} value={localidad}>{localidad}</option>
          ))}
        </select>

        <select
          value={filtroPlazas}
          onChange={(e) => setFiltroPlazas(e.target.value)}
          style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
        >
          <option value="todas">Todas las plazas</option>
          <option value="disponibles">Solo con plazas disponibles</option>
          <option value="completas">Completas</option>
        </select>
      </div>

      {/* Vista de Tabla */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f8f9fa' }}>
              <th style={{ padding: '10px', textAlign: 'left' }}>Código</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Centro</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Municipio</th>
              <th style={{ padding: '10px', textAlign: 'left' }}>Localidad</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Plazas</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Disponibles</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.length > 0 ? (
              currentItems.map((centro) => (
                <tr key={centro.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}>{centro.codigo}</td>
                  <td style={{ padding: '10px' }}>{centro.nombre}</td>
                  <td style={{ padding: '10px' }}>{centro.municipio}</td>
                  <td style={{ padding: '10px' }}>{centro.localidad}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{centro.plazasTotal}</td>
                  <td style={{ 
                    padding: '10px', 
                    textAlign: 'right',
                    color: centro.plazasDisponibles > 0 ? '#27ae60' : '#e74c3c'
                  }}>
                    {centro.plazasDisponibles}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" style={{ padding: '20px', textAlign: 'center' }}>
                  No se encontraron centros que coincidan con los criterios de búsqueda
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Paginación */}
        {totalPages > 1 && (
          <div style={{ 
            marginTop: '20px', 
            display: 'flex', 
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px'
          }}>
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                backgroundColor: currentPage === 1 ? '#f5f5f5' : '#fff',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              Anterior
            </button>
            
            <span>
              Página {currentPage} de {totalPages}
            </span>
            
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                backgroundColor: currentPage === totalPages ? '#f5f5f5' : '#fff',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CenterView; 