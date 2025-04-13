import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import CenterView from './CenterView';

/**
 * Componente para gestionar los centros y sus plazas
 * @param {Object} props - Propiedades del componente
 * @param {Array} props.availablePlazas - Lista de centros disponibles
 * @param {Array} props.assignments - Lista de asignaciones existentes
 * @param {Object} props.db - Referencia a la base de datos Firestore
 * @param {Function} props.showNotification - Función para mostrar notificaciones
 * @param {Function} props.setInternalProcessingMessage - Función para mostrar mensajes de procesamiento
 * @returns {JSX.Element} Componente de gestión de centros
 */
const CenterManager = ({
  availablePlazas,
  assignments,
  db,
  showNotification,
  setInternalProcessingMessage
}) => {
  const [activeTab, setActiveTab] = useState('visualizacion'); // 'visualizacion' o 'importacion'
  const [searchTermCentros, setSearchTermCentros] = useState('');
  const [centrosNuevos, setCentrosNuevos] = useState([]);
  const [mostrarComparacion, setMostrarComparacion] = useState(false);
  const [seleccionados, setSeleccionados] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Función para comparar centros del archivo con los existentes
  const compararCentros = async (file) => {
    try {
      setLoading(true);
      setError(null);
      
      // Obtener todos los centros de la base de datos
      const centrosSnapshot = await getDocs(collection(db, "centros"));
      const centrosDB = centrosSnapshot.docs.map(doc => ({
        id: doc.id,
        docId: doc.id,
        ...doc.data()
      }));
      
      // Crear un Map para mantener centros únicos por código
      const centrosUnicos = new Map();
      
      // Procesar centros de la base de datos
      centrosDB.forEach(centro => {
        // Usar código como ID si está disponible, o ID del documento en caso contrario
        const id = centro.codigo || centro.id;
        if (!centrosUnicos.has(id)) {
          centrosUnicos.set(id, {
            ...centro,
            origen: 'base_de_datos'
          });
        }
      });
      
      // Procesar archivo según su tipo
      let centrosDelArchivo = [];
      const fileName = file.name.toLowerCase();
      
      if (fileName.endsWith('.xlsx')) {
        // Procesar Excel
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Obtener la primera hoja
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // Convertir a JSON
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
        
        // Buscar encabezados
        let headerRow = -1;
        for (let i = 0; i < Math.min(20, jsonData.length); i++) {
          const row = jsonData[i];
          if (Array.isArray(row) && row.some(cell => 
            typeof cell === 'string' && 
            (cell.toLowerCase().includes('codigo') || 
             cell.toLowerCase().includes('centro') || 
             cell.toLowerCase().includes('municipio') ||
             cell.toLowerCase().includes('cod') ||
             cell.toLowerCase().includes('cent'))
          )) {
            headerRow = i;
            break;
          }
        }
        
        if (headerRow === -1) {
          throw new Error("No se encontró una fila de encabezado válida en el Excel");
        }
        
        // Analizar encabezados
        const headers = jsonData[headerRow];
        const codigoIdx = headers.findIndex(h => typeof h === 'string' && 
          (h.toLowerCase().includes('codigo') || h.toLowerCase().includes('cod')));
        const centroIdx = headers.findIndex(h => typeof h === 'string' && 
          (h.toLowerCase().includes('centro') || h.toLowerCase().includes('cent')));
        const municipioIdx = headers.findIndex(h => typeof h === 'string' && 
          h.toLowerCase().includes('municipio'));
        const plazasIdx = headers.findIndex(h => typeof h === 'string' && 
          (h.toLowerCase().includes('plaza') || h.toLowerCase().includes('plaz')));
        
        // Procesar filas de datos
        for (let i = headerRow + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!Array.isArray(row)) continue;
          
          const codigo = codigoIdx !== -1 && codigoIdx < row.length ? String(row[codigoIdx] || "").trim() : "";
          const centro = centroIdx !== -1 && centroIdx < row.length ? String(row[centroIdx] || "").trim() : "";
          const municipio = municipioIdx !== -1 && municipioIdx < row.length ? String(row[municipioIdx] || "").trim() : "";
          
          // Extraer plazas si está disponible
          let plazas = 1;
          if (plazasIdx !== -1 && plazasIdx < row.length && row[plazasIdx] !== undefined) {
            const plazasValue = parseFloat(row[plazasIdx]);
            if (!isNaN(plazasValue) && plazasValue > 0) {
              plazas = plazasValue;
            }
          }
          
          if ((codigo && codigo.length > 0) || (centro && centro.length > 0)) {
            centrosDelArchivo.push({
              codigo: codigo,
              centro: centro || codigo,
              municipio: municipio,
              plazas: plazas
            });
          }
        }
      } else if (fileName.endsWith('.csv')) {
        // Procesar CSV
        const text = await file.text();
        const lines = text.split('\n');
        
        // Detectar el separador
        const firstLine = lines[0];
        let separator = ',';
        if (firstLine.includes(';')) {
          separator = ';';
        } else if (firstLine.includes('\t')) {
          separator = '\t';
        }
        
        // Buscar encabezados
        let headerRow = -1;
        for (let i = 0; i < Math.min(20, lines.length); i++) {
          const line = lines[i].toLowerCase();
          if (line.includes('codigo') || line.includes('centro') || 
              line.includes('municipio') || line.includes('cod') || 
              line.includes('cent')) {
            headerRow = i;
            break;
          }
        }
        
        if (headerRow === -1) {
          throw new Error("No se encontró una fila de encabezado válida en el CSV");
        }
        
        // Analizar encabezados
        const headers = lines[headerRow].split(separator);
        const codigoIdx = headers.findIndex(h => 
          h.toLowerCase().includes('codigo') || h.toLowerCase().includes('cod'));
        const centroIdx = headers.findIndex(h => 
          h.toLowerCase().includes('centro') || h.toLowerCase().includes('cent'));
        const municipioIdx = headers.findIndex(h => 
          h.toLowerCase().includes('municipio'));
        const plazasIdx = headers.findIndex(h => 
          h.toLowerCase().includes('plaza') || h.toLowerCase().includes('plaz'));
        
        // Procesar líneas de datos
        for (let i = headerRow + 1; i < lines.length; i++) {
          const parts = lines[i].split(separator);
          
          const codigo = codigoIdx !== -1 && codigoIdx < parts.length ? (parts[codigoIdx]?.trim() || "") : "";
          const centro = centroIdx !== -1 && centroIdx < parts.length ? (parts[centroIdx]?.trim() || "") : "";
          const municipio = municipioIdx !== -1 && municipioIdx < parts.length ? (parts[municipioIdx]?.trim() || "") : "";
          
          // Extraer plazas si está disponible
          let plazas = 1;
          if (plazasIdx !== -1 && plazasIdx < parts.length && parts[plazasIdx] !== undefined) {
            const plazasValue = parseFloat(parts[plazasIdx]);
            if (!isNaN(plazasValue) && plazasValue > 0) {
              plazas = plazasValue;
            }
          }
          
          if ((codigo && codigo.length > 0) || (centro && centro.length > 0)) {
            centrosDelArchivo.push({
              codigo: codigo,
              centro: centro || codigo,
              municipio: municipio,
              plazas: plazas
            });
          }
        }
      }
      
      // Procesar centros del archivo
      centrosDelArchivo.forEach(centro => {
        const id = centro.codigo || centro.centro;
        if (!centrosUnicos.has(id)) {
          centrosUnicos.set(id, {
            ...centro,
            origen: 'archivo'
          });
        }
      });
      
      // Convertir el Map a array
      const centrosComparados = Array.from(centrosUnicos.values());
      
      setCentrosNuevos(centrosComparados);
      setSeleccionados({});
      centrosComparados.forEach((_, index) => {
        seleccionados[index] = true;
      });
      
      setMostrarComparacion(true);
      setLoading(false);
      
      return {
        total: centrosComparados.length,
        nuevos: centrosComparados.length
      };
    } catch (error) {
      console.error("Error al comparar centros:", error);
      setError("Error al comparar centros: " + error.message);
      setLoading(false);
      showNotification(`Error al analizar archivo: ${error.message}`, "error");
      return null;
    }
  };

  // Función para añadir centros seleccionados a la base de datos
  const añadirCentrosSeleccionados = async () => {
    try {
      setInternalProcessingMessage("Añadiendo centros seleccionados...");
      
      // Filtrar solo los centros seleccionados
      const centrosAñadir = centrosNuevos.filter((_, index) => seleccionados[index]);
      
      if (centrosAñadir.length === 0) {
        showNotification("No hay centros seleccionados para añadir", "warning");
        setInternalProcessingMessage("");
        return;
      }
      
      // Obtener ID para nuevos centros
      const centrosSnapshot = await getDocs(collection(db, "centros"));
      let nextId = centrosSnapshot.size + 1;
      
      // Añadir los centros en batches
      const BATCH_SIZE = 100;
      let procesados = 0;
      
      while (procesados < centrosAñadir.length) {
        const batch = writeBatch(db);
        const lote = centrosAñadir.slice(procesados, procesados + BATCH_SIZE);
        
        for (const centro of lote) {
          const centroDoc = {
            ...centro,
            id: `CENTRO_${nextId}`,
            plazasTotal: centro.plazas,
            plazasOcupadas: 0,
            timestamp: new Date().toISOString()
          };
          
          const docRef = doc(collection(db, "centros"));
          batch.set(docRef, centroDoc);
          nextId++;
        }
        
        await batch.commit();
        procesados += lote.length;
        setInternalProcessingMessage(`Añadidos ${procesados} de ${centrosAñadir.length} centros...`);
      }
      
      showNotification(`Se añadieron ${procesados} centros correctamente`, "success");
      setMostrarComparacion(false);
      setCentrosNuevos([]);
      setSeleccionados({});
    } catch (error) {
      console.error("Error al añadir centros:", error);
      showNotification(`Error al añadir centros: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };

  return (
    <div style={{
      backgroundColor: 'white',
      borderRadius: '10px',
      padding: '20px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
      marginBottom: '20px'
    }}>
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={() => setActiveTab('visualizacion')}
          style={{
            padding: '10px 15px',
            border: 'none',
            borderRadius: '5px 5px 0 0',
            marginRight: '5px',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 'bold',
            backgroundColor: activeTab === 'visualizacion' ? '#2980b9' : '#3498db'
          }}
        >
          Visualización
        </button>
        <button 
          onClick={() => setActiveTab('importacion')}
          style={{
            padding: '10px 15px',
            border: 'none',
            borderRadius: '5px 5px 0 0',
            marginRight: '5px',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 'bold',
            backgroundColor: activeTab === 'importacion' ? '#2980b9' : '#3498db'
          }}
        >
          Importación
        </button>
      </div>

      {activeTab === 'visualizacion' && (
        <CenterView 
          availablePlazas={availablePlazas}
          assignments={assignments}
        />
      )}

      {activeTab === 'importacion' && (
        <div>
          <p style={{ marginBottom: '20px' }}>
            Selecciona un archivo Excel o CSV para comparar con los centros existentes y añadir los nuevos.
          </p>
          
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
            <input
              type="file"
              id="fileInput"
              accept=".csv,.xlsx"
              style={{ display: 'none' }}
              onChange={async (e) => {
                if (e.target.files && e.target.files.length > 0) {
                  const file = e.target.files[0];
                  await compararCentros(file);
                }
              }}
            />
            <button
              onClick={() => document.getElementById('fileInput').click()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Seleccionar Archivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CenterManager; 