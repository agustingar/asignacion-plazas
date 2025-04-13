/**
 * Utilidades para gestionar centros y mejorar la búsqueda cuando hay discrepancias
 * entre diferentes conjuntos de datos
 */

/**
 * Normaliza un texto para comparaciones: elimina acentos, espacios, símbolos 
 * y convierte a mayúsculas
 * @param {string} texto Texto a normalizar
 * @returns {string} Texto normalizado
 */
export const normalizarTexto = (texto) => {
  return texto
    ? texto.toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/g, "")
    : "";
};

/**
 * Busca un centro de forma flexible probando diferentes estrategias
 * @param {string} id ID o nombre del centro a buscar
 * @param {Array} centrosDisponibles Lista de centros disponibles
 * @returns {Object|null} Centro encontrado o null
 */
export const buscarCentroFlexible = (id, centrosDisponibles) => {
  // Validación de entrada
  if (!id || typeof id !== 'string' || !centrosDisponibles || !Array.isArray(centrosDisponibles)) {
    return null;
  }
  
  // 1. Búsqueda exacta por id
  let centro = centrosDisponibles.find(c => c.id === id);
  if (centro) return centro;
  
  // 2. Búsqueda por docId
  centro = centrosDisponibles.find(c => c.docId === id);
  if (centro) return centro;
  
  // 3. Búsqueda por código
  centro = centrosDisponibles.find(c => c.codigo === id);
  if (centro) return centro;
  
  // 4. Búsqueda caso insensitivo
  centro = centrosDisponibles.find(c => 
    (c.id && c.id.toLowerCase() === id.toLowerCase()) || 
    (c.docId && c.docId.toLowerCase() === id.toLowerCase())
  );
  if (centro) return centro;
  
  // 5. Búsqueda por prefijo del ID
  if (id.length > 4) {
    const idPrefix = id.substring(0, 8);
    centro = centrosDisponibles.find(c => 
      (c.id && c.id.startsWith(idPrefix)) || 
      (c.docId && c.docId.startsWith(idPrefix))
    );
    if (centro) return centro;
  }

  // 6. Buscar coincidencias de nombres normalizados
  if (id.includes(' ') || id.length > 15) {
    const idNormalizado = normalizarTexto(id);
    
    // Búsqueda por coincidencia exacta del nombre normalizado
    centro = centrosDisponibles.find(c => {
      const nombreNormalizado = normalizarTexto(c.centro || c.nombre || '');
      return nombreNormalizado === idNormalizado;
    });
    if (centro) return centro;
    
    // Búsqueda por coincidencia parcial (una contiene a la otra)
    centro = centrosDisponibles.find(c => {
      const nombreNormalizado = normalizarTexto(c.centro || c.nombre || '');
      return nombreNormalizado.includes(idNormalizado) || 
             idNormalizado.includes(nombreNormalizado);
    });
    if (centro) return centro;
  }
  
  // 7. Casos especiales para hospitales conocidos
  // Hospital La Fe - caso especial muy común
  if (id.toUpperCase().includes('LA FE') || 
      id.toUpperCase().includes('POLITECNIC') || 
      id.toUpperCase().includes('POLITÈCNIC')) {
    centro = centrosDisponibles.find(c => {
      const nombre = (c.centro || c.nombre || '').toUpperCase();
      return nombre.includes('LA FE') || 
             nombre.includes('POLITECNIC') || 
             nombre.includes('POLITÈCNIC');
    });
    if (centro) return centro;
  }
  
  // Hospital Clínico - otro caso común
  if (id.toUpperCase().includes('CLÍNICO') || 
      id.toUpperCase().includes('CLINICO') || 
      id.toUpperCase().includes('VALÈNCIA')) {
    centro = centrosDisponibles.find(c => {
      const nombre = (c.centro || c.nombre || '').toUpperCase();
      return nombre.includes('CLÍNICO') || 
             nombre.includes('CLINICO') || 
             nombre.includes('VALÈNCIA') ||
             nombre.includes('VALENCIA');
    });
    if (centro) return centro;
  }
  
  // 8. Como último recurso, comparación directa con nombres
  for (const centro of centrosDisponibles) {
    if (centro.codigo && centro.codigo === id) return centro;
    if (centro.nombre && centro.nombre === id) return centro;
    if (centro.centro && centro.centro === id) return centro;
  }
  
  // No encontrado
  return null;
};

/**
 * Obtiene información completa y actualizada de un centro
 * @param {Object} centro Centro a procesar
 * @param {Array} asignaciones Lista de asignaciones activas
 * @returns {Object} Centro con información completa y campos estandarizados
 */
export const procesarInfoCentro = (centro, asignaciones = []) => {
  if (!centro) return null;
  
  // Calcular asignaciones activas para este centro
  const asignacionesActivas = (asignaciones || []).filter(a => 
    a.centerId === centro.id && 
    !a.noAsignable && 
    a.estado !== "NO_ASIGNABLE" && 
    a.estado !== "REASIGNACION_NO_VIABLE"
  ).length;
  
  // Usar el valor más alto entre plazasTotal y plazas para asegurar consistencia
  const plazasTotalValue = Math.max(
    parseInt(centro.plazasTotal || 0, 10),
    parseInt(centro.plazas || 0, 10)
  );
  
  // Usar el valor más alto entre plazasOcupadas, asignadas y asignacionesActivas
  const plazasOcupadasValue = Math.max(
    parseInt(centro.plazasOcupadas || 0, 10),
    parseInt(centro.asignadas || 0, 10),
    asignacionesActivas
  );
  
  // Proceso especial para el Hospital La Fe (tiene 1056 plazas)
  let plazasTotal = plazasTotalValue;
  if ((centro.centro || centro.nombre || "").toUpperCase().includes("LA FE")) {
    plazasTotal = 1056;
  }
  
  // Devolver objeto estandarizado
  return {
    ...centro,
    nombre: centro.nombre || centro.centro || "Centro sin nombre",
    plazasTotal: plazasTotal,
    plazas: plazasTotal,
    plazasOcupadas: plazasOcupadasValue,
    asignadas: plazasOcupadasValue,
    plazasDisponibles: Math.max(0, plazasTotal - plazasOcupadasValue),
    sinPlazas: (Math.max(0, plazasTotal - plazasOcupadasValue) <= 0)
  };
}; 