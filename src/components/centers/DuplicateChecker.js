import React, { useState } from 'react';
import { collection, getDocs, writeBatch, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { calculateStringSimilarity } from '../../utils/stringUtils';

/**
 * Componente para verificación avanzada de duplicados
 */
const DuplicateChecker = () => {
  const [duplicates, setDuplicates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [threshold, setThreshold] = useState(0.8);

  const findDuplicates = async () => {
    setLoading(true);
    try {
      const centersRef = collection(db, 'centers');
      const centersSnapshot = await getDocs(centersRef);
      const centers = centersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Agrupar centros por municipio para optimizar la búsqueda
      const centersByMunicipality = centers.reduce((acc, center) => {
        const municipality = center.municipality || 'unknown';
        if (!acc[municipality]) {
          acc[municipality] = [];
        }
        acc[municipality].push(center);
        return acc;
      }, {});

      const foundDuplicates = [];

      // Comparar centros dentro del mismo municipio
      Object.values(centersByMunicipality).forEach(municipalityCenters => {
        for (let i = 0; i < municipalityCenters.length; i++) {
          for (let j = i + 1; j < municipalityCenters.length; j++) {
            const center1 = municipalityCenters[i];
            const center2 = municipalityCenters[j];

            const similarity = calculateStringSimilarity(
              center1.name,
              center2.name
            );

            if (similarity >= threshold) {
              foundDuplicates.push({
                center1,
                center2,
                similarity
              });
            }
          }
        }
      });

      setDuplicates(foundDuplicates);
    } catch (error) {
      console.error('Error al buscar duplicados:', error);
    } finally {
      setLoading(false);
    }
  };

  const mergeCenters = async (center1, center2) => {
    try {
      const batch = writeBatch(db);

      // Actualizar las asignaciones del centro que se eliminará
      const assignmentsRef = collection(db, 'assignments');
      const assignmentsSnapshot = await getDocs(assignmentsRef);
      
      assignmentsSnapshot.docs.forEach(doc => {
        const assignment = doc.data();
        if (assignment.centerId === center2.id) {
          batch.update(doc.ref, { centerId: center1.id });
        }
      });

      // Eliminar el centro duplicado
      batch.delete(doc(db, 'centers', center2.id));

      await batch.commit();
      
      // Actualizar la lista de duplicados
      setDuplicates(duplicates.filter(d => 
        d.center1.id !== center2.id && d.center2.id !== center2.id
      ));
    } catch (error) {
      console.error('Error al fusionar centros:', error);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Verificador de Centros Duplicados</h2>
      
      <div className="mb-4">
        <label className="block mb-2">
          Umbral de similitud:
          <input
            type="range"
            min="0.5"
            max="1"
            step="0.1"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="ml-2"
          />
          <span className="ml-2">{threshold.toFixed(1)}</span>
        </label>
      </div>

      <button
        onClick={findDuplicates}
        disabled={loading}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
      >
        {loading ? 'Buscando...' : 'Buscar Duplicados'}
      </button>

      {duplicates.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">
            Centros Duplicados Encontrados: {duplicates.length}
          </h3>
          <div className="space-y-4">
            {duplicates.map((dup, index) => (
              <div key={index} className="border p-4 rounded">
                <div className="flex justify-between items-start">
                  <div>
                    <p><strong>Centro 1:</strong> {dup.center1.name}</p>
                    <p><strong>Centro 2:</strong> {dup.center2.name}</p>
                    <p><strong>Similitud:</strong> {(dup.similarity * 100).toFixed(1)}%</p>
                  </div>
                  <button
                    onClick={() => mergeCenters(dup.center1, dup.center2)}
                    className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600"
                  >
                    Fusionar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DuplicateChecker; 