import React, { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { writeBatch, doc, collection, serverTimestamp, onSnapshot, query, where, addDoc, updateDoc, getDocs, deleteDoc, getDoc, setDoc } from "firebase/firestore";
import * as XLSX from 'xlsx';
import { db } from '../firebase';

/**
 * Componente AsignacionRow para mostrar una fila de asignación en la tabla
 */
const AsignacionRow = React.memo(({ 
  asignacion, 
  idx,
  asignacionesSeleccionadas, 
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
  
  // Obtener información completa del centro para mostrar plazas
  const centroCompleto = !esNoAsignable ? availablePlazas.find(c => c.id === asignacion.centerId) : null;
  
  // Cálculo mejorado de plazas - asegurarse de que valores numéricos se procesen correctamente
  let plazasTotal = 0;
  
  if (centroCompleto) {
    // Intentar obtener plazasTotal o plazas, asegurándose de que sea un número válido
    const plazasTotalRaw = centroCompleto.plazasTotal !== undefined ? centroCompleto.plazasTotal : 
                           centroCompleto.plazas !== undefined ? centroCompleto.plazas : null;
    
    if (plazasTotalRaw !== null && plazasTotalRaw !== undefined) {
      // Convertir a número, asegurándose de que '0' string se convierta a 0 número
      plazasTotal = parseInt(plazasTotalRaw, 10);
      
      // Si hubo error de conversión (NaN), usar 0
      if (isNaN(plazasTotal)) {
        plazasTotal = 0;
      }
    }
  }
  
  // Verificar si hay información válida sobre plazas configuradas en el centro
  // En lugar de verificar undefined, hacemos una comprobación más robusta
  // Consideramos que hay información si el centro existe y tiene algún valor de plazas
  // incluyendo 0 (que es un valor válido para plazas)
  const hayInfoPlazas = !!centroCompleto;
  
  // Calcular plazas ocupadas verificando todas las asignaciones activas para este centro
  // Esto proporciona un dato más preciso que el almacenado en el centro
  const asignacionesActivas = assignments.filter(a => 
      a.centerId === asignacion.centerId && 
      !a.noAsignable && 
      a.estado !== "NO_ASIGNABLE" && 
      a.estado !== "REASIGNACION_NO_VIABLE"
  );
  
  const asignacionesParaCentro = asignacionesActivas.length;
  
  // Usar primero los datos del centro si están disponibles, sino calcular basado en asignaciones
  let plazasOcupadas;
  if (centroCompleto && (centroCompleto.plazasOcupadas !== undefined || centroCompleto.asignadas !== undefined)) {
    plazasOcupadas = parseInt(centroCompleto.plazasOcupadas || centroCompleto.asignadas, 10);
    
    // Verificación de integridad: si el número calculado es mayor, usamos ese
    if (asignacionesParaCentro > plazasOcupadas) {
      plazasOcupadas = asignacionesParaCentro;
      
      // En desarrollo, mostrar advertencia si hay discrepancia
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Discrepancia de plazas en centro ${asignacion.centerId}: 
          Guardadas: ${centroCompleto.plazasOcupadas || centroCompleto.asignadas}, 
          Calculadas: ${asignacionesParaCentro}`);
      }
    }
  } else {
    plazasOcupadas = asignacionesParaCentro;
  }
  
  // REGLA DE CONSISTENCIA: Si hay plazas ocupadas, el total NUNCA puede ser cero
  if (plazasOcupadas > 0 && plazasTotal === 0) {
    // Si hay plazas ocupadas pero el total es 0, ajustar el total al número de ocupadas
    plazasTotal = plazasOcupadas;
    
    // En desarrollo, mostrar advertencia
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Inconsistencia detectada para centro ${asignacion.centerId || 'desconocido'}: 
        Hay ${plazasOcupadas} plazas ocupadas pero 0 plazas totales. 
        Se ha ajustado el total para evitar mostrar datos inconsistentes.`);
    }
  }
  
  // Calcular plazas disponibles (nunca negativo)
  const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
  
  // Porcentaje de ocupación para visualización
  const porcentajeOcupacion = plazasTotal > 0 ? Math.min(100, Math.round((plazasOcupadas / plazasTotal) * 100)) : 100;
  
  // Determinar color según porcentaje de ocupación
  let colorOcupacion;
  if (porcentajeOcupacion >= 90) {
    colorOcupacion = '#d32f2f'; // Rojo - muy ocupado
  } else if (porcentajeOcupacion >= 75) {
    colorOcupacion = '#ff9800'; // Naranja - bastante ocupado
  } else if (porcentajeOcupacion >= 50) {
    colorOcupacion = '#ffc107'; // Amarillo - medio ocupado
  } else {
    colorOcupacion = '#388e3c'; // Verde - poca ocupación
  }
  
  // Formatear fecha
  const fecha = new Date(asignacion.timestamp);
  const fechaFormateada = fecha && !isNaN(fecha.getTime())
    ? fecha.toLocaleDateString() + ' ' + fecha.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    : 'Fecha no disponible';
  
  // Verificar si hay información válida sobre plazas
  
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
            checked={!!asignacionesSeleccionadas[asignacion.docId] || false}
            onChange={(e) => onSeleccionChange(asignacion.docId, e.target.checked)}
          />
        )}
      </td>
      <td style={{ padding: '10px' }}>{numeroOrden}</td>
      <td style={{ padding: '10px' }}>
        <div style={{ 
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center'
        }}>
          {nombreCentro}
          {esNoAsignable && (
            <span style={{ 
              backgroundColor: '#f44336',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '11px',
              marginLeft: '8px'
            }}>
              No asignable
            </span> 
          )}
          {esReasignacionNoViable && (
            <span style={{ 
              backgroundColor: '#ff9800',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '3px',
              fontSize: '11px',
              marginLeft: '8px'
            }}>
              Reasignación no viable
            </span>
          )}
        </div>
        {!esNoAsignable && (
          <div style={{ fontSize: '12px', color: '#666' }}>
            {asignacion.localidad && `${asignacion.localidad}`}
            {asignacion.municipio && asignacion.municipio !== asignacion.localidad && ` - ${asignacion.municipio}`}
          </div>
        )}
        {esNoAsignable && (
          <div style={{ fontSize: '12px', color: '#d32f2f' }}>
            No hay plazas disponibles en ningún centro seleccionado
          </div>
        )}
        {esReasignacionNoViable && (
          <div style={{ fontSize: '12px', color: '#e65100' }}>
            {asignacion.mensajeReasignacion || "No fue posible reasignar por falta de plazas"}
          </div>
        )}
      </td>
      <td style={{ padding: '10px' }}>
        {!esNoAsignable ? (
          <div>
            <div style={{ 
              fontWeight: 'bold',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              marginBottom: '3px'
            }}>
              <span style={{ 
                color: plazasDisponibles === 0 ? '#d32f2f' : '#388e3c', 
                marginRight: '6px' 
              }}>
                {plazasDisponibles} disponibles
              </span>
              <span style={{ color: '#666' }}>
                / {plazasTotal} totales
              </span>
            </div>
            
            {/* Barra de progreso para visualizar ocupación */}
            <div style={{ 
              width: '100%', 
              height: '6px', 
              backgroundColor: '#e0e0e0', 
              borderRadius: '3px',
              marginBottom: '5px'
            }}>
              <div style={{ 
                width: `${porcentajeOcupacion}%`, 
                height: '100%', 
                backgroundColor: colorOcupacion,
                borderRadius: '3px'
              }}></div>
            </div>
            
            <div style={{ fontSize: '12px', color: '#666' }}>
              {plazasOcupadas} ocupadas ({porcentajeOcupacion}%)
            </div>
          </div>
        ) : (
          <div style={{ color: '#d32f2f', fontWeight: 'bold', fontSize: '13px' }}>
            Sin plazas
          </div>
        )}
      </td>
      <td style={{ padding: '10px' }}>{fechaFormateada}</td>
      <td style={{ padding: '10px', textAlign: 'center' }}>
        {!esNoAsignable ? (
          <>
            <button 
              onClick={() => onReasignar(asignacion)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#ff9800',
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
          </>
        ) : (
          <span style={{ color: '#999', fontSize: '12px' }}>
            No disponible
          </span>
        )}
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  // Comparación personalizada para evitar re-renderizados innecesarios
  return (
    prevProps.asignacion.docId === nextProps.asignacion.docId &&
    prevProps.idx === nextProps.idx &&
    !!prevProps.asignacionesSeleccionadas[prevProps.asignacion.docId] === 
    !!nextProps.asignacionesSeleccionadas[nextProps.asignacion.docId]
  );
});

/**
 * Componente que muestra el panel de administración
 * @param {Object} props - Propiedades del componente
 * @param {Array} props.assignments - Lista de asignaciones
 * @param {Array} props.availablePlazas - Lista de centros/plazas disponibles
 * @param {Array} props.solicitudes - Lista de solicitudes pendientes
 * @param {Function} props.procesarTodasLasSolicitudes - Función para procesar todas las solicitudes
 * @param {Function} props.procesarSolicitudesPorMinuto - Función para procesar la siguiente solicitud pendiente
 * @param {Function} props.cargarDatosDesdeFirebase - Función para recargar datos desde Firebase
 * @param {Function} props.eliminarSolicitudesDuplicadas - Función para eliminar solicitudes duplicadas
 * @param {Function} props.limpiarDuplicadosHistorial - Función para limpiar duplicados del historial
 * @param {Object} props.db - Referencia a la base de datos Firestore
 * @param {boolean} props.loadingProcess - Indica si hay un proceso en curso
 * @param {string} props.processingMessage - Mensaje del proceso en curso
 * @param {Function} props.showNotification - Función para mostrar notificaciones
 * @param {Date} props.lastProcessed - Fecha del último procesamiento
 * @param {Function} props.procesarSolicitudes - Función para procesar solicitudes individualmente
 * @param {Function} props.actualizarDatosManualmente - Función para actualizar datos manualmente
 * @param {boolean} props.isLoading - Indica si está cargando datos
 * @returns {JSX.Element} - Componente Admin
 */
const Admin = ({ 
  assignments = [], 
  availablePlazas = [], 
  solicitudes = [],
  procesarTodasLasSolicitudes,
  procesarSolicitudesPorMinuto,
  cargarDatosDesdeFirebase,
  eliminarSolicitudesDuplicadas,
  limpiarDuplicadosHistorial,
  db,
  loadingProcess,
  processingMessage,
  showNotification,
  lastProcessed,
  procesarSolicitudes,
  actualizarDatosManualmente,
  isLoading
}) => {
  // Estados para el componente
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminAuthAttempted, setAdminAuthAttempted] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchTermSolicitudes, setSearchTermSolicitudes] = useState('');
  const [searchTermAsignaciones, setSearchTermAsignaciones] = useState('');
  const [searchTermCentros, setSearchTermCentros] = useState('');
  const [internalProcessingMessage, setInternalProcessingMessage] = useState('');
  const [centrosNuevos, setCentrosNuevos] = useState([]);
  const [mostrarComparacion, setMostrarComparacion] = useState(false);
  const [seleccionados, setSeleccionados] = useState({});
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState(null);
  const [centroSeleccionadoManual, setCentroSeleccionadoManual] = useState("");
  const [modalAsignacionManual, setModalAsignacionManual] = useState(false);
  const [asignacionParaReasignar, setAsignacionParaReasignar] = useState(null);
  const [modalReasignacion, setModalReasignacion] = useState(false);
  const [centroSeleccionadoReasignacion, setCentroSeleccionadoReasignacion] = useState("");
  const [asignacionesSeleccionadas, setAsignacionesSeleccionadas] = useState({});
  const [feedbackSolicitudes, setFeedbackSolicitudes] = useState([]);
  const [feedbackFilter, setFeedbackFilter] = useState('todos'); // Nuevo estado para el filtro
  const [showFeedback, setShowFeedback] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('solicitudes');
  const [showReasignacionModal, setShowReasignacionModal] = useState(false);
  const [showAsignacionManualModal, setShowAsignacionManualModal] = useState(false);
  const [asignacionesRecreadas, setAsignacionesRecreadas] = useState([]);
  const [loadingAsignacionesRecreadas, setLoadingAsignacionesRecreadas] = useState(false);
  const [notificationText, setNotificationText] = useState(''); // Estado para el texto de la notificación
  // Estado para el modo forzado de reasignación
  const [modoForzadoReasignacion, setModoForzadoReasignacion] = useState(false);

  // Estilos comunes
  const tabButtonStyle = {
    padding: '10px 20px',
    marginRight: '10px',
    border: 'none',
    borderRadius: '5px',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 'bold'
  };

  // Limpiar entradas inválidas en asignacionesSeleccionadas
  useEffect(() => {
    if (Object.keys(asignacionesSeleccionadas).includes("undefined")) {
      console.warn("Detectada key 'undefined' en asignacionesSeleccionadas, limpiando...");
      const newSeleccionadas = {...asignacionesSeleccionadas};
      delete newSeleccionadas["undefined"];
      setAsignacionesSeleccionadas(newSeleccionadas);
    }
    
    console.log("Estado de asignacionesSeleccionadas actualizado:", asignacionesSeleccionadas);
  }, [asignacionesSeleccionadas]);

  // Normalizar asignaciones para asegurar docId válidos
  useEffect(() => {
    if (assignments && assignments.length > 0) {
      // Verificar asignaciones sin docId pero con id
      const asignacionesSinDocId = assignments.filter(a => !a.docId && a.id);
      
      if (asignacionesSinDocId.length > 0) {
        console.log(`Normalizando ${asignacionesSinDocId.length} asignaciones que tienen id pero no docId`);
        
        // Para cada asignación que encontramos, actualizar la referencia
        asignacionesSinDocId.forEach(asignacion => {
          asignacion.docId = asignacion.id;
        });
      }
    }
  }, [assignments]);

  // Función de renderizado del formulario de login
  const renderLoginForm = () => {
    return (
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '20px',
        fontFamily: 'Arial, sans-serif',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        flexDirection: 'column'
      }}>
        <h1 style={{ marginBottom: '30px', color: '#2c3e50' }}>Panel de Administración</h1>
        
        <div style={{ 
          backgroundColor: 'white', 
          padding: '30px', 
          borderRadius: '10px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '400px'
        }}>
          <h2 style={{ textAlign: 'center', marginBottom: '25px' }}>Autenticación Requerida</h2>
          
          {adminAuthAttempted && (
            <div style={{
              backgroundColor: '#f8d7da',
              color: '#721c24',
              padding: '10px',
              borderRadius: '5px',
              marginBottom: '15px',
              textAlign: 'center'
            }}>
              Contraseña incorrecta. Inténtalo de nuevo.
            </div>
          )}
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Contraseña de Administrador:
            </label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '16px'
              }}
              placeholder="Ingrese la contraseña"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (adminPassword === 'SoyAdmin') {
                    setIsAdminAuthenticated(true);
                    setIsAdmin(true);
                  } else {
                    setAdminAuthAttempted(true);
                  }
                }
              }}
            />
          </div>
          
          <button
            onClick={() => {
              if (adminPassword === 'SoyAdmin') {
                setIsAdminAuthenticated(true);
                setIsAdmin(true);
              } else {
                setAdminAuthAttempted(true);
              }
            }}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Acceder
          </button>
          
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <a 
              href="/"
              style={{
                color: '#3498db',
                textDecoration: 'none'
              }}
            >
              Volver a la página principal
            </a>
          </div>
        </div>
      </div>
    );
  };

  // Corregir el useEffect para que no sea condicional
  useEffect(() => {
    let unsubscribe = () => {};
    
    if (isAdmin) {
      unsubscribe = onSnapshot(collection(db, 'feedback'), (snapshot) => {
        const feedbackData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setFeedbackSolicitudes(feedbackData);
      });
      
      // Cargar asignaciones recreadas
      cargarAsignacionesRecreadas();
    }
    
    // Listener para el texto de la notificación
    const configDocRef = doc(db, 'config', 'general');
    const unsubscribeConfig = onSnapshot(configDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setNotificationText(docSnap.data().notificationText || '');
      } else {
        setNotificationText('');
      }
    });

    return () => {
      unsubscribe();
      unsubscribeConfig(); // Limpiar listener de config
    }
  }, [isAdmin, db]);

  // Si no está autenticado, mostrar formulario de login
  if (!isAdminAuthenticated) {
    return (
      <div style={{
        maxWidth: '1280px',
        margin: '0 auto',
        padding: '20px',
        fontFamily: 'Arial, sans-serif',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        flexDirection: 'column'
      }}>
        <h1 style={{ marginBottom: '30px', color: '#2c3e50' }}>Panel de Administración</h1>
        
        <div style={{ 
          backgroundColor: 'white', 
          padding: '30px', 
          borderRadius: '10px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '400px'
        }}>
          <h2 style={{ textAlign: 'center', marginBottom: '25px' }}>Autenticación Requerida</h2>
          
          {adminAuthAttempted && (
            <div style={{
              backgroundColor: '#f8d7da',
              color: '#721c24',
              padding: '10px',
              borderRadius: '5px',
              marginBottom: '15px',
              textAlign: 'center'
            }}>
              Contraseña incorrecta. Inténtalo de nuevo.
            </div>
          )}
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Contraseña de Administrador:
            </label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '5px',
                fontSize: '16px'
              }}
              placeholder="Ingrese la contraseña"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (adminPassword === 'SoyAdmin') {
                    setIsAdminAuthenticated(true);
                    setIsAdmin(true);
                  } else {
                    setAdminAuthAttempted(true);
                  }
                }
              }}
            />
          </div>
          
          <button
            onClick={() => {
              if (adminPassword === 'SoyAdmin') {
                setIsAdminAuthenticated(true);
                setIsAdmin(true);
              } else {
                setAdminAuthAttempted(true);
              }
            }}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Acceder
          </button>
          
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <a 
              href="/"
              style={{
                color: '#3498db',
                textDecoration: 'none'
              }}
            >
              Volver a la página principal
            </a>
          </div>
        </div>
      </div>
    );
  }
  
  // Funciones del componente
  const handleReasignar = async (assignment) => {
    try {
      // Validar la asignación
      if (!assignment) {
        showNotification("Error: Asignación no válida", "error");
        return;
      }
      
      // Obtener el número de orden de la asignación
      const ordenAsignacion = assignment.numeroOrden || assignment.order;
      if (!ordenAsignacion) {
        showNotification("Error: No se pudo determinar el número de orden de la asignación", "error");
        return;
      }

      console.log("Buscando opciones originales para la orden:", ordenAsignacion);
      setInternalProcessingMessage("Buscando opciones de centros originales...");
      
      // Array para almacenar los centros seleccionados
      let centrosParaSolicitud = [];
      let centrosInfoCompleta = [];
      
      // Verificar si la asignación ya tiene referencia a la solicitud original
      if (assignment.solicitudId) {
        setInternalProcessingMessage("Buscando solicitud original por ID...");
        try {
          const solicitudRef = doc(db, "solicitudes", assignment.solicitudId);
          const solicitudDoc = await getDoc(solicitudRef);
          
          if (solicitudDoc.exists()) {
            const solicitudData = solicitudDoc.data();
            if (solicitudData.centrosSeleccionados && Array.isArray(solicitudData.centrosSeleccionados) && solicitudData.centrosSeleccionados.length > 0) {
              centrosParaSolicitud = [...solicitudData.centrosSeleccionados];
              console.log("Centros encontrados en la solicitud original:", centrosParaSolicitud);
            }
          }
        } catch (error) {
          console.error("Error al buscar solicitud original:", error);
        }
      }
      
      // Si no se encontraron centros, buscar en solicitudes pendientes
      if (centrosParaSolicitud.length === 0) {
        setInternalProcessingMessage("Buscando en solicitudes pendientes...");
        const solicitudesQuery = query(
          collection(db, "solicitudes"), 
          where("numeroOrden", "==", ordenAsignacion)
        );
        const solicitudesSnapshot = await getDocs(solicitudesQuery);
        
        // Verificar si se encontró alguna solicitud
        if (!solicitudesSnapshot.empty) {
          solicitudesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.centrosSeleccionados && Array.isArray(data.centrosSeleccionados) && data.centrosSeleccionados.length > 0) {
              centrosParaSolicitud = [...data.centrosSeleccionados];
              console.log("Centros encontrados en solicitud pendiente:", centrosParaSolicitud);
            }
          });
        }
      }
      
      // Si aún no se encontraron centros, buscar en historial
      if (centrosParaSolicitud.length === 0) {
        setInternalProcessingMessage("Buscando en historial de solicitudes...");
        
        const historialQuery = query(
          collection(db, "historialSolicitudes"),
          where("numeroOrden", "==", ordenAsignacion)
        );
        const historialSnapshot = await getDocs(historialQuery);
        
        // Procesar todos los documentos del historial
        const todosLosDocumentos = {};
        
        historialSnapshot.forEach(doc => {
              const data = doc.data();
          data.docId = doc.id;
          data.timestamp = data.timestamp || 0; // Por si no tiene timestamp
          
          // Guardar/actualizar documento en nuestro objeto
          todosLosDocumentos[doc.id] = data;
          
          // Buscar en diferentes campos que podrían contener centros
          const camposPosiblesCentros = [
            { nombre: 'centrosSeleccionados', valores: data.centrosSeleccionados },
            { nombre: 'centrosIdsOriginales', valores: data.centrosIdsOriginales },
            { nombre: 'opcionesOriginales', valores: data.opcionesOriginales },
            { nombre: 'centros', valores: data.centros }
          ].filter(campo => 
            campo.valores && Array.isArray(campo.valores) && campo.valores.length > 0
          );
          
          if (camposPosiblesCentros.length > 0) {
            console.log(`Documento ${Object.keys(todosLosDocumentos).length} (${data.estado || 'sin estado'}, ID: ${doc.id}):`);
            console.log("  Campos que podrían contener centros:", camposPosiblesCentros);
            
            // Tomar los centros del primer array no vacío
            for (const campo of camposPosiblesCentros) {
              // Verificar si los elementos del array son strings (IDs) u objetos
              const primerElemento = campo.valores[0];
              
              if (typeof primerElemento === 'string') {
                console.log(`Centros encontrados en campo ${campo.nombre}:`, campo.valores);
                if (centrosParaSolicitud.length === 0) {
                  centrosParaSolicitud = [...campo.valores];
                }
              } else if (typeof primerElemento === 'object' && primerElemento !== null) {
                // Si son objetos, extraer los IDs
                const ids = campo.valores
                  .map(obj => obj.id || obj.centroId || obj.docId)
                  .filter(Boolean);
                  
                console.log(`IDs extraídos de objetos en campo ${campo.nombre}:`, ids);
                if (centrosParaSolicitud.length === 0 && ids.length > 0) {
                  centrosParaSolicitud = [...ids];
                }
                
                // También guardar la información completa
                if (centrosInfoCompleta.length === 0) {
                  centrosInfoCompleta = [...campo.valores];
                }
              }
            }
          }
        });
        
        // Convertir a array para ordenar por timestamp
        const historialDocs = Object.values(todosLosDocumentos);
        
        // Si después de revisar todo el historial no se encontraron centros,
        // y si hay algún historial disponible, intentar inferir el centro original
        if (centrosParaSolicitud.length === 0 && historialDocs.length > 0) {
          // Ordenar por timestamp (descendente)
          historialDocs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          
          // Buscar el primer documento que tenga centroId o centroAsignado
          for (const doc of historialDocs) {
            if (doc.centroId) {
              centrosParaSolicitud.push(doc.centroId);
              console.log("Usando centroId del historial como opción:", doc.centroId);
              break;
            } else if (doc.centroAsignado) {
              // Intentar encontrar el ID del centro por nombre
              const centroNombre = doc.centroAsignado.toLowerCase().trim();
              const centroEncontrado = availablePlazas.find(
                centro => (centro.nombre && centro.nombre.toLowerCase().trim() === centroNombre) ||
                          (centro.centro && centro.centro.toLowerCase().trim() === centroNombre)
              );
              
              if (centroEncontrado) {
                centrosParaSolicitud.push(centroEncontrado.id);
                console.log("Encontrado centro por nombre en historial:", centroEncontrado.id);
              break;
              }
            }
          }
        }
      }
      
      console.log("Resultado final - centros para reasignación:", centrosParaSolicitud);
      setInternalProcessingMessage("");
      
      // Intentar obtener información completa de los centros
      const centrosCompletos = await Promise.all(centrosParaSolicitud.map(async (id, index) => {
        // Primero, intentar encontrar el centro en availablePlazas con búsqueda flexible
        const centroEnDisponibles = (() => {
          // Validación
          if (!id || typeof id !== 'string') return null;
          
          // Búsqueda exacta
          let centro = availablePlazas.find(c => c.id === id || c.docId === id || c.codigo === id);
          if (centro) return centro;
          
          // Búsqueda insensible a mayúsculas/minúsculas
          const idLower = id.toLowerCase();
          centro = availablePlazas.find(c => 
            (c.id && c.id.toLowerCase() === idLower) || 
            (c.docId && c.docId.toLowerCase() === idLower) ||
            (c.codigo && c.codigo.toLowerCase() === idLower)
          );
          if (centro) return centro;
          
          // Búsqueda por prefijo
          if (id.length > 4) {
            const prefix = id.substring(0, 8);
            centro = availablePlazas.find(c => 
              (c.id && c.id.startsWith(prefix)) || 
              (c.docId && c.docId.startsWith(prefix))
            );
            if (centro) return centro;
          }
          
          return null;
        })();
        
        // Buscar en la información completa si existe
        const centroEnInfoCompleta = centrosInfoCompleta.find(c => 
          c && (c.id === id || c.centroId === id || c.docId === id)
        );
        
        // Si encontramos el centro en alguna de las fuentes de memoria, usarlo
        if (centroEnDisponibles || centroEnInfoCompleta) {
          return {
            id: id,
            ...(centroEnInfoCompleta || {}),
            ...(centroEnDisponibles || {}),
            nombre: (centroEnDisponibles?.nombre || centroEnDisponibles?.centro || 
                    centroEnInfoCompleta?.nombre || centroEnInfoCompleta?.centro || 
                    `Opción ${index + 1}`),
            centro: (centroEnDisponibles?.centro || centroEnDisponibles?.nombre || 
                    centroEnInfoCompleta?.centro || centroEnInfoCompleta?.nombre || 
                    `Opción ${index + 1}`),
            prioridad: index + 1,
            encontrado: true
          };
        }
        
        // Si no se encuentra en memoria, buscar directamente en la base de datos
        try {
          console.log(`Buscando centro con ID ${id} directamente en la base de datos...`);
          setInternalProcessingMessage(`Buscando centro ${index + 1} en la base de datos...`);
          
          // Intentar buscar por docId
          let centroDoc = await getDoc(doc(db, "centros", id));
          
          // Si no se encuentra por docId, buscar por id en la colección
          if (!centroDoc.exists()) {
            const centrosQuery = query(
              collection(db, "centros"),
              where("id", "==", id)
            );
            const centrosQuerySnapshot = await getDocs(centrosQuery);
            
            if (!centrosQuerySnapshot.empty) {
              centroDoc = centrosQuerySnapshot.docs[0];
            }
          }
          
          // Si encontramos el centro en la base de datos
          if (centroDoc && centroDoc.exists()) {
            const datosCentro = centroDoc.data();
            console.log(`Centro con ID ${id} encontrado en la base de datos:`, datosCentro);
            
            return {
              id: id,
              docId: centroDoc.id,
              ...datosCentro,
              nombre: datosCentro.nombre || datosCentro.centro || `Opción ${index + 1}`,
              centro: datosCentro.centro || datosCentro.nombre || `Opción ${index + 1}`,
              prioridad: index + 1,
              encontrado: true
            };
          }
        } catch (error) {
          console.error(`Error al buscar centro con ID ${id} en la base de datos:`, error);
        }
        
        // Si no se encuentra en ninguna fuente, crear un objeto básico pero descriptivo
        console.log(`Centro con ID ${id} no encontrado en ninguna fuente, creando placeholder para la opción ${index + 1}`);
        return {
          id: id,
          nombre: `Opción ${index + 1} [ID: ${id.substring(0, 6)}...]`,
          centro: `Opción ${index + 1}`,
          prioridad: index + 1,
          plazasTotal: 0,
          plazas: 0,
          localidad: '',
          municipio: '',
          plazasDisponiblesActualizadas: 0,
          sinPlazas: true,
          noEncontrado: true
        };
      }));
      
      // Configurar estados para la reasignación y mostrar el modal
      setAsignacionParaReasignar({
        ...assignment,
        centrosIdsOriginales: centrosParaSolicitud,
        centrosCompletos: centrosCompletos
      });
      setCentroSeleccionadoReasignacion("");
      setModalReasignacion(true);
      setShowReasignacionModal(true);
      
    } catch (error) {
      console.error("Error al preparar reasignación:", error);
      setInternalProcessingMessage("");
      showNotification(`Error al preparar reasignación: ${error.message}`, "error");
    }
  };

  // Función para buscar información del centro
  const encontrarCentro = (assignment) => {
    // Para debug: verificar qué campos tiene la asignación
    if (process.env.NODE_ENV === 'development') {
      console.log('Datos de asignación:', {
        id: assignment.id,
        docId: assignment.docId,
        centerId: assignment.centerId,
        nombreCentro: assignment.nombreCentro,
        centerName: assignment.centerName,
        centro: assignment.centro,
        centre: assignment.centre,
        municipality: assignment.municipio,
        order: assignment.order || assignment.numeroOrden
      });
    }
    
    // Validar que la asignación no sea undefined o null
    if (!assignment) {
      console.warn("encontrarCentro: assignment es undefined o null");
      return {
        id: "desconocido",
        nombre: "Centro desconocido",
        plazas: 0,
        asignadas: 0,
        municipio: "",
        localidad: ""
      };
    }
    
    // Buscar info del centro para mostrar plazas disponibles
    let centroInfo = null;
    
    try {
      // 1. Intentar usar la referencia guardada si existe
      if (assignment.centroAsociado) {
        centroInfo = assignment.centroAsociado;
      } 
      // 2. Intentar buscar por id
      else if (assignment.centerId && availablePlazas && Array.isArray(availablePlazas)) {
        centroInfo = availablePlazas.find(c => c && c.id === assignment.centerId);
      }
      // 3. Intentar buscar por nombre
      if (!centroInfo && assignment.nombreCentro && assignment.nombreCentro !== "Centro no encontrado" && availablePlazas && Array.isArray(availablePlazas)) {
        // Normalizar para búsqueda
        const nombreBusqueda = assignment.nombreCentro.toLowerCase();
        
        // Buscar por nombre exacto
        centroInfo = availablePlazas.find(c => 
          (c && c.nombre && c.nombre.toLowerCase() === nombreBusqueda) || 
          (c && c.centro && c.centro.toLowerCase() === nombreBusqueda)
        );
        
        // Si no se encuentra, intentar buscar sin acentos y en minúsculas
        if (!centroInfo) {
          try {
            const nombreNormalizado = nombreBusqueda
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            centroInfo = availablePlazas.find(c => {
              if (!c || (!c.nombre && !c.centro)) return false;
              
              const nombreCentroNormalizado = (c.nombre || c.centro || "")
                .toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              
              return nombreCentroNormalizado === nombreNormalizado;
            });
          } catch (error) {
            console.error("Error al normalizar nombre:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error en la búsqueda de centro:", error);
    }
    
    // 5. Crear objeto por defecto si no se encontró
    if (!centroInfo) {
      centroInfo = {
        id: assignment.centerId || "desconocido",
        nombre: assignment.nombreCentro || assignment.centerName || "Centro desconocido",
        plazas: 0,
        plazasTotal: 0,
        asignadas: 0,
        plazasOcupadas: 0,
        plazasDisponibles: 0,
        municipio: assignment.municipio || '',
        localidad: assignment.localidad || ''
      };
    } else {
      // Estandarizar propiedades para asegurar cálculos consistentes
      centroInfo.plazasTotal = centroInfo.plazasTotal || centroInfo.plazas || 0;
      centroInfo.plazasOcupadas = centroInfo.plazasOcupadas || centroInfo.asignadas || 0;
      centroInfo.plazasDisponibles = Math.max(0, centroInfo.plazasTotal - centroInfo.plazasOcupadas);
    }
    
    return centroInfo;
  };
  
  // Función para comparar centros del archivo con los existentes
  const compararCentros = async (file) => {
    try {
      setInternalProcessingMessage("Analizando archivo...");
      
      // Obtener centros existentes
      const centrosExistentesSnapshot = await getDocs(collection(db, "centros"));
      
      // Crear mapas de búsqueda para comparación rápida
      const centrosExistentesPorCodigo = {};
      const centrosExistentesPorNombre = {};
      
      centrosExistentesSnapshot.forEach(doc => {
        const centro = doc.data();
        if (centro.codigo) {
          centrosExistentesPorCodigo[centro.codigo.toLowerCase()] = {
            ...centro,
            docId: doc.id
          };
        }
        if (centro.centro) {
          // Normalizar nombre para búsqueda
          const nombreNormalizado = centro.centro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          centrosExistentesPorNombre[nombreNormalizado] = {
            ...centro,
            docId: doc.id
          };
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
        
        // Buscar encabezados (pueden estar en diferentes posiciones)
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
          throw new Error("No se encontró una fila de encabezado válida en el Excel. Prueba con otro archivo o formato.");
        }
        
        // Analizar encabezados para encontrar índices de columnas importantes
        const headers = jsonData[headerRow];
        console.log("Encabezados encontrados:", headers);
        
        const getColumnIndex = (keywords) => {
          // Primero intentar una coincidencia exacta
          let index = headers.findIndex(h => 
            typeof h === 'string' && 
            keywords.some(k => h.toUpperCase() === k.toUpperCase())
          );
          
          // Si no hay coincidencia exacta, buscar coincidencia parcial
          if (index === -1) {
            index = headers.findIndex(h => 
              typeof h === 'string' && 
              keywords.some(k => h.toUpperCase().includes(k.toUpperCase()))
            );
          }
          
          return index;
        };
        
        const codigoIdx = getColumnIndex(['CODIGO', 'CÓDIGO', 'COD', 'CODCENTRO', 'CODIGO_CENTRO']);
        const centroIdx = getColumnIndex(['CENTRO', 'CENT', 'NOMBRE', 'NOMBRE_CENTRO', 'NOMBRECENTRO', 'NOM_CENTRO']);
        const municipioIdx = getColumnIndex(['MUNICIPIO', 'MUN', 'LOCALIDAD', 'LOCAL', 'CIUDAD']);
        const plazasIdx = getColumnIndex(['PLAZAS', 'PLAZA', 'PLAZ', 'NUM_PLAZAS', 'PLAZAS_DISPONIBLES']);
        
        console.log("Índices de columnas:", { 
          codigo: codigoIdx, 
          centro: centroIdx, 
          municipio: municipioIdx, 
          plazas: plazasIdx 
        });
        
        if (codigoIdx === -1 && centroIdx === -1) {
          throw new Error("No se encontraron las columnas necesarias (código o centro). Se necesita al menos una de estas columnas.");
        }
        
        // Procesar filas de datos
        for (let i = headerRow + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!Array.isArray(row)) continue;
          
          const codigo = codigoIdx !== -1 && codigoIdx < row.length ? (row[codigoIdx]?.toString().trim() || "") : "";
          const centro = centroIdx !== -1 && centroIdx < row.length ? (row[centroIdx]?.toString().trim() || "") : "";
          const municipio = municipioIdx !== -1 && municipioIdx < row.length ? (row[municipioIdx]?.toString().trim() || "") : "";
          
          // Extraer plazas si está disponible
          let plazas = 1;
          if (plazasIdx !== -1 && plazasIdx < row.length && row[plazasIdx] !== undefined) {
            const plazasValue = parseFloat(row[plazasIdx]);
            if (!isNaN(plazasValue) && plazasValue > 0) {
              plazas = plazasValue;
            }
          }
          
          // Solo necesitamos al menos un código o nombre de centro
          if ((codigo && codigo.length > 0) || (centro && centro.length > 0)) {
            centrosDelArchivo.push({
              codigo: codigo,
              centro: centro || codigo, // Si no hay centro, usamos el código como nombre
              municipio: municipio,
              plazas: plazas
            });
          }
        }
      } else {
        // Procesar CSV
        const text = await file.text();
        const lines = text.split('\n')
          .map(line => line.replace(/"/g, '').trim())
          .filter(Boolean);
        
        // Detectar el tipo de separador (punto y coma, coma o tabulador)
        let separator = ';';
        const firstLine = lines[0];
        if (firstLine) {
          if (firstLine.includes('\t')) {
            separator = '\t';
            console.log("Formato detectado: CSV con separador de tabulaciones");
          } else if (firstLine.includes(',') && !firstLine.includes(';')) {
            separator = ',';
            console.log("Formato detectado: CSV con separador de comas");
          } else {
            console.log("Formato detectado: CSV con separador de punto y coma");
          }
        }
        
        // Buscar encabezados
        let headerRow = -1;
        for (let i = 0; i < Math.min(20, lines.length); i++) {
          const line = lines[i].toLowerCase();
          if (line.includes('codigo') || 
              line.includes('centro') || 
              line.includes('municipio') || 
              line.includes('cod') || 
              line.includes('cent')) {
            headerRow = i;
            break;
          }
        }
        
        if (headerRow === -1) {
          throw new Error("No se encontró una línea de encabezado válida en el CSV. Prueba con otro archivo o formato.");
        }
        
        // Analizar encabezados
        const headers = lines[headerRow].split(separator);
        console.log("Encabezados CSV encontrados:", headers);
        
        const getColumnIndex = (keywords) => {
          // Primero intentar una coincidencia exacta
          let index = headers.findIndex(h => 
            typeof h === 'string' && 
            keywords.some(k => h.toUpperCase() === k.toUpperCase())
          );
          
          // Si no hay coincidencia exacta, buscar coincidencia parcial
          if (index === -1) {
            index = headers.findIndex(h => 
              typeof h === 'string' && 
              keywords.some(k => h.toUpperCase().includes(k.toUpperCase()))
            );
          }
          
          return index;
        };
        
        const codigoIdx = getColumnIndex(['CODIGO', 'CÓDIGO', 'COD', 'CODCENTRO', 'CODIGO_CENTRO']);
        const centroIdx = getColumnIndex(['CENTRO', 'CENT', 'NOMBRE', 'NOMBRE_CENTRO', 'NOMBRECENTRO', 'NOM_CENTRO']);
        const municipioIdx = getColumnIndex(['MUNICIPIO', 'MUN', 'LOCALIDAD', 'LOCAL', 'CIUDAD']);
        const plazasIdx = getColumnIndex(['PLAZAS', 'PLAZA', 'PLAZ', 'NUM_PLAZAS', 'PLAZAS_DISPONIBLES']);
        
        console.log("Índices de columnas CSV:", { 
          codigo: codigoIdx, 
          centro: centroIdx, 
          municipio: municipioIdx, 
          plazas: plazasIdx 
        });
        
        if (codigoIdx === -1 && centroIdx === -1) {
          throw new Error("No se encontraron las columnas necesarias (código o centro). Se necesita al menos una de estas columnas.");
        }
        
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
          
          // Solo necesitamos al menos un código o nombre de centro
          if ((codigo && codigo.length > 0) || (centro && centro.length > 0)) {
            centrosDelArchivo.push({
              codigo: codigo,
              centro: centro || codigo, // Si no hay centro, usamos el código como nombre
              municipio: municipio,
              plazas: plazas
            });
          }
        }
      }
      
      console.log(`Se encontraron ${centrosDelArchivo.length} centros en el archivo`);
      
      // Identificar centros nuevos (no existentes en la base de datos)
      const nuevos = centrosDelArchivo.filter(centro => {
        const codigoNormalizado = centro.codigo.toLowerCase();
        const nombreNormalizado = centro.centro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        return !centrosExistentesPorCodigo[codigoNormalizado] && 
               !centrosExistentesPorNombre[nombreNormalizado];
      });
      
      // Actualizar estado con los centros nuevos
      setCentrosNuevos(nuevos);
      
      // Inicializar selección (todos seleccionados por defecto)
      const seleccionInicial = {};
      nuevos.forEach((centro, index) => {
        seleccionInicial[index] = true;
      });
      setSeleccionados(seleccionInicial);
      
      setMostrarComparacion(true);
      setInternalProcessingMessage("");
      
      return {
        total: centrosDelArchivo.length,
        nuevos: nuevos.length
      };
    } catch (error) {
      console.error("Error al comparar centros:", error);
      showNotification(`Error al analizar archivo: ${error.message}`, "error");
      setInternalProcessingMessage("");
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
      
      for (let i = 0; i < centrosAñadir.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const lote = centrosAñadir.slice(i, Math.min(i + BATCH_SIZE, centrosAñadir.length));
        
        for (const centro of lote) {
          const docRef = doc(collection(db, "centros"));
          batch.set(docRef, {
            id: (nextId++).toString(),
            codigo: centro.codigo,
            centro: centro.centro,
            nombre: centro.centro,
            localidad: centro.municipio,
            municipio: centro.municipio,
            plazas: centro.plazas,
            plazasTotal: centro.plazas,
            asignadas: 0,
            plazasOcupadas: 0,
            plazasDisponibles: centro.plazas,
            docId: docRef.id,
            timestamp: serverTimestamp()
          });
          procesados++;
        }
        
        await batch.commit();
        setInternalProcessingMessage(`Añadiendo centros: ${procesados}/${centrosAñadir.length}`);
      }
      
      // Recargar datos
      await cargarDatosDesdeFirebase();
      
      showNotification(`Se han añadido ${procesados} centros correctamente`, "success");
      setMostrarComparacion(false);
      setCentrosNuevos([]);
      setSeleccionados({});
      setInternalProcessingMessage("");
    } catch (error) {
      console.error("Error al añadir centros:", error);
      showNotification(`Error al añadir centros: ${error.message}`, "error");
      setInternalProcessingMessage("");
    }
  };
  
  // Añadir botón y sección de importación de centros
  const renderSeccionImportacionCentros = () => {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '20px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        marginBottom: '20px'
      }}>
        <h3 style={{ marginTop: 0, color: '#2c3e50', marginBottom: '15px' }}>
          Importación y Comparación de Centros
        </h3>
        
        {!mostrarComparacion ? (
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
        ) : (
          <div>
            <div style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>Centros Nuevos Encontrados: {centrosNuevos.length}</h4>
              <div>
                <button
                  onClick={() => {
                    const nuevoEstado = {};
                    centrosNuevos.forEach((_, idx) => { nuevoEstado[idx] = true; });
                    setSeleccionados(nuevoEstado);
                  }}
                  style={{
                    padding: '5px 10px',
                    backgroundColor: '#2ecc71',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    marginRight: '10px',
                    fontSize: '12px'
                  }}
                >
                  Seleccionar Todos
                </button>
                <button
                  onClick={() => {
                    const nuevoEstado = {};
                    centrosNuevos.forEach((_, idx) => { nuevoEstado[idx] = false; });
                    setSeleccionados(nuevoEstado);
                  }}
                  style={{
                    padding: '5px 10px',
                    backgroundColor: '#e74c3c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Deseleccionar Todos
                </button>
              </div>
            </div>
            
            <div style={{ 
              maxHeight: '400px', 
              overflowY: 'auto', 
              border: '1px solid #eee',
              borderRadius: '5px',
              marginBottom: '15px'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Selec.</th>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Código</th>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Centro</th>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Municipio</th>
                    <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #eee' }}>Plazas</th>
                  </tr>
                </thead>
                <tbody>
                  {centrosNuevos.map((centro, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px' }}>
                        <input
                          type="checkbox"
                          checked={seleccionados[index] || false}
                          onChange={() => {
                            setSeleccionados(prev => ({
                              ...prev,
                              [index]: !prev[index]
                            }));
                          }}
                        />
                      </td>
                      <td style={{ padding: '8px' }}>{centro.codigo}</td>
                      <td style={{ padding: '8px' }}>{centro.centro}</td>
                      <td style={{ padding: '8px' }}>{centro.municipio}</td>
                      <td style={{ padding: '8px' }}>{centro.plazas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button
                onClick={() => {
                  setMostrarComparacion(false);
                  setCentrosNuevos([]);
                  setSeleccionados({});
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#f1f1f1',
                  color: '#333',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
              
              <button
                onClick={añadirCentrosSeleccionados}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#2ecc71',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer'
                }}
                disabled={internalProcessingMessage !== ""}
              >
                {internalProcessingMessage ? (
                  <span className="processing-btn">
                    <span className="processing-indicator"></span>
                    Procesando...
                  </span>
                ) : (
                  `Añadir ${Object.values(seleccionados).filter(Boolean).length} centros seleccionados`
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };
  
  // Modificar la función abrirModalAsignacionManual
  const abrirModalAsignacionManual = (solicitud) => {
    if (!solicitud) {
      showNotification("Error: No se ha seleccionado una solicitud válida", "error");
      return;
    }

    // Verificar que la solicitud tiene centros seleccionados
    const centrosIds = solicitud.centrosIds || solicitud.centrosSeleccionados || [];
    if (!centrosIds.length) {
      showNotification("Error: La solicitud no tiene centros seleccionados", "error");
      return;
    }

    // Verificar que tenemos información de los centros
    const centrosDisponibles = centrosIds
      .map(id => availablePlazas.find(centro => centro.id === id))
      .filter(Boolean);

    if (!centrosDisponibles.length) {
      showNotification("Error: No se encontró información de los centros seleccionados", "error");
      return;
    }

    setSolicitudSeleccionada(solicitud);
    setCentroSeleccionadoManual("");
    setModalAsignacionManual(true);
    setShowAsignacionManualModal(true);
  };

  // Modificar la función realizarAsignacionManual
  const realizarAsignacionManual = async () => {
    if (!solicitudSeleccionada || !centroSeleccionadoManual) {
      showNotification("Por favor, seleccione un centro para asignar", "error");
      return;
    }

    try {
      setInternalProcessingMessage("Realizando asignación manual...");

      // Obtener información de la orden y el centro
      // Usar orden o numeroOrden, lo que esté disponible
      const ordenSolicitud = solicitudSeleccionada.orden || solicitudSeleccionada.numeroOrden;
      
      // Verificar que tenemos un número de orden válido
      if (!ordenSolicitud) {
        showNotification("Error: La solicitud no tiene un número de orden válido", "error");
        setInternalProcessingMessage("");
        return;
      }

      const centroInfo = availablePlazas.find(c => c.id === centroSeleccionadoManual);

      if (!centroInfo) {
        showNotification("Centro no encontrado", "error");
        setInternalProcessingMessage("");
        return;
      }

      // Verificar si ya existe una asignación para esta orden
      const asignacionExistente = assignments.find(a => 
        (a.order === ordenSolicitud) || (a.numeroOrden === ordenSolicitud)
      );

      // Crear batch para todas las operaciones
      const batch = writeBatch(db);

      // Si existe una asignación, eliminarla
      if (asignacionExistente && asignacionExistente.docId) {
        batch.delete(doc(db, "asignaciones", asignacionExistente.docId));
      }

      // Crear nueva asignación
      const nuevaAsignacion = {
        order: ordenSolicitud,
        numeroOrden: ordenSolicitud, // Añadir ambos campos para mayor compatibilidad
        centerId: centroInfo.id,
        centerName: centroInfo.nombre || centroInfo.centro,
        localidad: centroInfo.localidad || '',
        municipio: centroInfo.municipio || '',
        centro: centroInfo.nombre || centroInfo.centro,
        timestamp: Date.now(),
        asignacionManual: true
      };

      // Verificar que no haya campos undefined antes de guardar
      Object.keys(nuevaAsignacion).forEach(key => {
        if (nuevaAsignacion[key] === undefined) {
          console.warn(`Campo ${key} es undefined en la asignación. Se establecerá valor predeterminado.`);
          
          // Establecer valores predeterminados según el tipo de campo
          if (key.includes('Id') || key === 'order' || key === 'numeroOrden') {
            nuevaAsignacion[key] = "0"; // ID o número predeterminado como string
          } else if (key === 'timestamp') {
            nuevaAsignacion[key] = Date.now(); // Timestamp actual
          } else if (typeof nuevaAsignacion[key] === 'boolean') {
            nuevaAsignacion[key] = false; // Valor booleano predeterminado
          } else {
            nuevaAsignacion[key] = ""; // String vacío para otros campos
          }
        }
      });

      const asignacionRef = doc(collection(db, "asignaciones"));
      batch.set(asignacionRef, nuevaAsignacion);

      // Guardar en historial con todas las opciones de centros de la solicitud
      const historialData = {
        orden: ordenSolicitud,
        numeroOrden: ordenSolicitud, // Añadir ambos campos para mayor compatibilidad
        centroId: centroInfo.id,
        estado: "ASIGNADA_MANUAL",
        mensaje: `Asignación manual desde panel de administración a ${centroInfo.nombre || centroInfo.centro}`,
        fechaHistorico: new Date().toISOString(),
        timestamp: Date.now(),
        // Guardar todas las opciones de centros de la solicitud
        centrosSeleccionados: solicitudSeleccionada.centrosIds || solicitudSeleccionada.centrosSeleccionados || []
      };

      const historialRef = doc(collection(db, "historialSolicitudes"));
      batch.set(historialRef, historialData);

      // Eliminar la solicitud pendiente si existe
      if (solicitudSeleccionada.docId) {
        batch.delete(doc(db, "solicitudesPendientes", solicitudSeleccionada.docId));
      }

      // Ejecutar todas las operaciones
      await batch.commit();

      // Recargar datos
      await cargarDatosDesdeFirebase();

      showNotification(`Orden ${ordenSolicitud} asignada manualmente a ${centroInfo.nombre || centroInfo.centro}`, "success");
      setModalAsignacionManual(false);
      setShowAsignacionManualModal(false); // Añadir esta línea
      setSolicitudSeleccionada(null);
    } catch (error) {
      console.error("Error al realizar asignación manual:", error);
      showNotification(`Error: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };

  // Renderizar modal de asignación manual
  const renderModalAsignacionManual = () => {
    if (!solicitudSeleccionada) return null;

    // Obtener los centros seleccionados por el usuario
    const centrosIds = solicitudSeleccionada.centrosIds || 
                        solicitudSeleccionada.centrosSeleccionados || [];
    
    // Función para buscar un centro de forma más flexible
    const buscarCentroFlexible = (id) => {
      let centro = availablePlazas.find(c => c.id === id);
      if (centro) return centro;
      centro = availablePlazas.find(c => c.docId === id);
      if (centro) return centro;
      centro = availablePlazas.find(c => c.codigo === id);
      if (centro) return centro;
      if (typeof id === 'string') {
        centro = availablePlazas.find(c => 
          (c.id && c.id.toLowerCase() === id.toLowerCase()) || 
          (c.docId && c.docId.toLowerCase() === id.toLowerCase())
        );
      }
      return centro;
    };

    // Filtrar solo los centros seleccionados que existen en availablePlazas y mantener el orden original
    const centrosDisponibles = centrosIds
      .map(id => buscarCentroFlexible(id))
      .filter(Boolean);

    // Verificar si hay solicitudes con orden menor
    const ordenActual = solicitudSeleccionada.orden || solicitudSeleccionada.numeroOrden || 0;
    const solicitudesMenorOrden = solicitudes.filter(sol => {
      const ordenSol = sol.orden || sol.numeroOrden || 0;
      return ordenSol < ordenActual;
    });

    const hayOrdenMenor = solicitudesMenorOrden.length > 0;
    const soloUnaOpcion = centrosDisponibles.length === 1;

    // Calcular plazas disponibles actualizadas para cada centro
    const centrosConPlazasActualizadas = centrosDisponibles.map(centro => {
      // Contar cuántas asignaciones existen para este centro, excluyendo las no viables
      const asignacionesParaCentro = assignments.filter(a => 
        a.centerId === centro.id && 
        !a.noAsignable && 
        a.estado !== "NO_ASIGNABLE" && 
        a.estado !== "REASIGNACION_NO_VIABLE" // Esta asignación no contará para las plazas ocupadas
      ).length;
      
      // Calcular plazas disponibles
      const plazasTotal = parseInt(centro.plazasTotal || centro.plazas || '0', 10);
      const plazasOcupadas = parseInt(centro.plazasOcupadas || centro.asignadas || '0', 10);
      const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
      
      return {
        ...centro,
        plazasDisponiblesActualizadas: plazasDisponibles,
        plazasOcupadasActualizadas: plazasOcupadas
      };
    });

    // Verificar si hay al menos un centro con plazas disponibles
    const todosLosCentrosSinPlazas = centrosConPlazasActualizadas.every(c => c.plazasDisponiblesActualizadas <= 0);
    const hayAlMenosUnCentroConPlazas = !todosLosCentrosSinPlazas;

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
      <div style={{
        backgroundColor: 'white',
          borderRadius: '8px',
        padding: '20px',
          width: '90%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
        }}>
          <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
            Asignación Manual - Orden #{ordenActual}
          </h3>
          
          {hayOrdenMenor && soloUnaOpcion && (
            <div style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffeeba',
              borderRadius: '4px',
              padding: '12px',
              marginBottom: '15px',
              color: '#856404'
            }}>
              <strong>¡Atención!</strong> Esta solicitud tiene menor prioridad que otras pendientes y solo tiene una opción disponible. 
              Considere procesar primero las solicitudes con número de orden menores.
            </div>
          )}

          {hayOrdenMenor && !soloUnaOpcion && (
            <div style={{
              backgroundColor: '#fff3cd',
              border: '1px solid #ffeeba',
              borderRadius: '4px',
              padding: '12px',
              marginBottom: '15px',
              color: '#856404'
            }}>
              <strong>Aviso:</strong> Existen solicitudes con número de orden menor pendientes.
            </div>
          )}
          
          <p style={{ marginBottom: '20px' }}>
            Seleccione uno de los centros preferidos por el usuario para realizar la asignación manual:
          </p>
          
          <div style={{ marginBottom: '20px' }}>
            <h4>Centros seleccionados por el usuario:</h4>
            {centrosConPlazasActualizadas.length > 0 ? (
              <div style={{ 
              display: 'flex',
                flexDirection: 'column',
              gap: '10px',
                maxHeight: '300px',
                overflow: 'auto',
                padding: '10px',
                border: '1px solid #eee',
                borderRadius: '5px'
              }}>
                {centrosConPlazasActualizadas.map((centro, index) => {
                  const sinPlazas = centro.plazasDisponiblesActualizadas <= 0;
                  
                  return (
                    <div key={centro.id} style={{
                      padding: '10px',
              borderRadius: '5px',
                      border: '1px solid #ddd',
                      backgroundColor: centroSeleccionadoManual === centro.id 
                        ? '#e3f2fd' 
                        : sinPlazas 
                          ? '#ffebee' 
                          : 'white',
                      cursor: sinPlazas ? 'not-allowed' : 'pointer',
                      opacity: sinPlazas ? 0.7 : 1
                    }} onClick={() => {
                      if (!sinPlazas) setCentroSeleccionadoManual(centro.id);
                    }}>
                      <div style={{ fontWeight: 'bold' }}>
                        {index + 1}. {centro.nombre || centro.centro}
        </div>
                      <div style={{ fontSize: '14px', color: '#666' }}>
                        {centro.localidad && `${centro.localidad}`}
                        {centro.municipio && centro.municipio !== centro.localidad && ` - ${centro.municipio}`}
                      </div>
                      <div style={{ 
                        fontSize: '14px', 
                        marginTop: '5px',
                        color: sinPlazas ? '#d32f2f' : '#388e3c',
                        fontWeight: 'bold'
                      }}>
                        Plazas: <strong>{centro.plazasDisponibles}</strong> disponibles 
                        de {centro.plazasTotal || centro.plazas || 0}
                        {sinPlazas && ' - SIN PLAZAS DISPONIBLES'}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#d32f2f', padding: '10px', textAlign: 'center' }}>
                No hay centros disponibles para esta solicitud.
              </div>
            )}
      </div>
      
        <div style={{ 
          display: 'flex',
            justifyContent: 'flex-end', 
            gap: '10px',
            borderTop: '1px solid #eee',
            paddingTop: '15px'
          }}>
            {todosLosCentrosSinPlazas && (
              <div style={{ 
                marginRight: 'auto', 
                color: '#d32f2f', 
                fontWeight: 'bold',
                fontSize: '14px',
                display: 'flex',
          alignItems: 'center'
        }}>
                ⚠️ No hay plazas disponibles en ningún centro seleccionado
          </div>
            )}
          <button
              onClick={() => setModalAsignacionManual(false)}
              style={{
                padding: '8px 15px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            {todosLosCentrosSinPlazas && (
              <button 
                onClick={marcarNoAsignable}
            style={{
                  padding: '8px 15px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: '#f44336',
              color: 'white',
                  cursor: 'pointer'
                }}
              >
                No se puede asignar
              </button>
            )}
            <button 
              onClick={realizarAsignacionManual}
              disabled={!centroSeleccionadoManual}
              style={{
                padding: '8px 15px',
                borderRadius: '4px',
              border: 'none',
                backgroundColor: centroSeleccionadoManual ? '#2196f3' : '#cccccc',
                color: 'white',
                cursor: centroSeleccionadoManual ? 'pointer' : 'not-allowed'
              }}
            >
              Asignar
          </button>
        </div>
        </div>
      </div>
    );
  };

  // Renderizar sección de solicitudes pendientes
  const renderSolicitudesPendientes = () => {
    // Si está cargando, mostrar indicador
    if (isLoading) {
      return (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 20px',
          backgroundColor: '#f5f7fa',
          borderRadius: '8px',
          color: '#5c6c7c'
        }}>
          <div style={{ fontSize: '36px', marginBottom: '15px' }}>⏳</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
            Cargando solicitudes...
          </div>
        </div>
      );
    }

    // Ordenar solicitudes por número de orden (menor a mayor)
    const solicitudesOrdenadas = [...solicitudes].sort((a, b) => {
      const ordenA = a.orden || a.numeroOrden || 0;
      const ordenB = b.orden || b.numeroOrden || 0;
      return ordenA - ordenB;
    });
    
    // Filtrar solicitudes pendientes
    const solicitudesFiltradas = solicitudesOrdenadas.filter(sol => 
      !searchTermSolicitudes || 
      (sol.orden && sol.orden.toString().includes(searchTermSolicitudes)) ||
      (sol.numeroOrden && sol.numeroOrden.toString().includes(searchTermSolicitudes))
    );

    return (
      <div style={{ marginTop: '30px' }}>
        <h3>Solicitudes Pendientes</h3>
        
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            placeholder="Buscar por número de orden..."
            value={searchTermSolicitudes}
            onChange={(e) => setSearchTermSolicitudes(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}
          />
        </div>
        
        {solicitudesFiltradas.length === 0 ? (
          <div style={{ 
            padding: '20px', 
            textAlign: 'center', 
            color: '#666',
            backgroundColor: '#f9f9f9',
            borderRadius: '4px'
          }}>
            No hay solicitudes pendientes
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Prioridad</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Nº Orden</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Fecha</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Centros Disponibles</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
                {solicitudesFiltradas.map((solicitud, idx) => {
                  // Generar una key única usando múltiples campos y el índice
                  const uniqueKey = solicitud.docId 
                    ? `sol-${solicitud.docId}-${idx}` 
                    : `sol-${idx}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                  
                  // Obtener centros seleccionados
                  const centrosIds = solicitud.centrosIds || solicitud.centrosSeleccionados || [];
                  
                  // Formatear fecha correctamente, con manejo de error
                  let fechaFormateada = 'Fecha no disponible';
                  try {
                    if (typeof solicitud.timestamp === 'number') {
                      const fecha = new Date(solicitud.timestamp);
                      if (!isNaN(fecha.getTime())) {
                        fechaFormateada = fecha.toLocaleDateString() + ' ' + fecha.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                      }
                    } else if (typeof solicitud.timestamp === 'string') {
                      const fecha = new Date(solicitud.timestamp);
                      if (!isNaN(fecha.getTime())) {
                        fechaFormateada = fecha.toLocaleDateString() + ' ' + fecha.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                      }
                    } else if (solicitud.fechaSolicitud) {
                      const fecha = new Date(solicitud.fechaSolicitud);
                      if (!isNaN(fecha.getTime())) {
                        fechaFormateada = fecha.toLocaleDateString() + ' ' + fecha.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                      }
                    }
                  } catch (error) {
                    console.warn("Error al formatear fecha:", error);
                  }
                  
                  // Obtener información de los centros
                  const centrosSeleccionados = centrosIds
                    .map(centroId => {
                      const centro = availablePlazas.find(p => p.id === centroId);
                      if (!centro) return null;
                      
                      // Calcular plazas disponibles
                      const plazasTotal = parseInt(centro.plazasTotal || centro.plazas || '0', 10);
                      const asignacionesParaCentro = assignments.filter(a => 
                        a.centerId === centroId && 
                        !a.noAsignable && 
                        a.estado !== "NO_ASIGNABLE" && 
                        a.estado !== "REASIGNACION_NO_VIABLE"
                      ).length;
                      const plazasOcupadas = parseInt(centro.plazasOcupadas || centro.asignadas || '0', 10);
                      const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
                      
                      return {
                        ...centro,
                        plazasDisponiblesActualizadas: plazasDisponibles,
                        plazasOcupadasActualizadas: plazasOcupadas
                      };
                    })
                    .filter(Boolean);
                  
                  // Verificar si hay centros con plazas disponibles
                  const centrosConPlazas = centrosSeleccionados.filter(c => c.plazasDisponiblesActualizadas > 0);
                  const hayCentrosDisponibles = centrosConPlazas.length > 0;
                  
                  // Verificar si es la solicitud con menor número
                  const ordenActual = solicitud.orden || solicitud.numeroOrden || 0;
                  const esPrioritaria = idx === 0;
                  
                  // Determinar el estado de prioridad para estilizado
                  let prioridadEstilo = {
                    color: '#666',
                    backgroundColor: '#f5f5f5',
                    label: 'Normal'
                  };
                  
                  if (esPrioritaria) {
                    prioridadEstilo = {
                      color: 'white',
                      backgroundColor: '#4caf50',
                      label: 'Alta'
                    };
                  } else if (ordenActual <= 50) {
                    prioridadEstilo = {
                      color: 'white',
                      backgroundColor: '#ff9800',
                      label: 'Media'
                    };
                  }
                  
                  return (
                    <tr key={uniqueKey} style={{
                      borderBottom: '1px solid #eee',
                      backgroundColor: esPrioritaria ? '#f1f8e9' : ''
                    }}>
                      <td style={{ padding: '10px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          backgroundColor: prioridadEstilo.backgroundColor,
                          color: prioridadEstilo.color
                        }}>
                          {prioridadEstilo.label}
                        </span>
                      </td>
                      <td style={{ 
                        padding: '10px',
                        fontWeight: esPrioritaria ? 'bold' : 'normal'
                      }}>
                        {ordenActual}
                      </td>
                      <td style={{ padding: '10px' }}>
                        {fechaFormateada}
                      </td>
                      <td style={{ padding: '10px' }}>
                        {centrosConPlazas.length > 0 ? (
                          <div>
                            <div style={{ marginBottom: '5px' }}>
                              <strong>{centrosConPlazas.length}</strong> centros con plazas de <strong>{centrosSeleccionados.length}</strong> seleccionados
                            </div>
                            <ul style={{ margin: '0', paddingLeft: '20px' }}>
                              {centrosSeleccionados.slice(0, 3).map((centro, i) => {
                                const tieneDisponibles = centro.plazasDisponibles > 0;
                                return (
                                  <li key={`centro-${centro.id || i}-${i}`} style={{
                                    color: tieneDisponibles ? 'inherit' : '#d32f2f',
                                    marginBottom: '4px'
                                  }}>
                                    <div>
                                      <strong>{centro.nombre || centro.centro}</strong>
                                      {tieneDisponibles ? (
                            <span style={{ 
                                          color: '#388e3c', 
                                          fontSize: '12px',
                                          fontWeight: 'bold',
                                          marginLeft: '5px'
                                        }}>
                                          ({centro.plazasDisponibles} plazas)
                            </span> 
                                      ) : (
                              <span style={{ 
                                          color: '#d32f2f', 
                                          fontSize: '12px',
                                          fontWeight: 'bold',
                                          marginLeft: '5px'
                                        }}>
                                          (Sin plazas)
                              </span>
                            )}
                          </div>
                                  </li>
                                );
                              })}
                              {centrosSeleccionados.length > 3 && (
                                <li>Y {centrosSeleccionados.length - 3} más...</li>
                              )}
                            </ul>
                        </div>
                        ) : (
                          <span style={{ color: '#999' }}>Sin centros seleccionados</span>
                        )}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button 
                          onClick={() => abrirModalAsignacionManual(solicitud)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: hayCentrosDisponibles ? '#4caf50' : '#cccccc',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: hayCentrosDisponibles ? 'pointer' : 'not-allowed',
                            marginRight: '5px'
                          }}
                          title={hayCentrosDisponibles ? "Asignar manualmente" : "No hay centros con plazas disponibles"}
                          disabled={!hayCentrosDisponibles}
                        >
                          Asignar Manual
                        </button>
                        <button 
                          onClick={() => {
                            const idToDelete = solicitud.docId || solicitud.id;
                            if (!idToDelete) {
                              showNotification("Error: No se puede eliminar la solicitud (ID no válido)", "error");
                              console.warn("Solicitud sin ID detectada:", solicitud);
                              return;
                            }
                            eliminarSolicitudPendiente(idToDelete);
                          }}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#e74c3c',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            marginLeft: '5px'
                          }}
                          title="Eliminar solicitud pendiente"
                        >
                          Eliminar
                        </button>
                        {!hayCentrosDisponibles && (
                          <div style={{ 
                            fontSize: '11px', 
                            color: '#d32f2f', 
                            marginTop: '5px',
                            fontWeight: 'bold' 
                          }}>
                            Sin centros disponibles
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    );
  };

  // Función para eliminar múltiples asignaciones
  const eliminarAsignacionesSeleccionadas = async () => {
    const asignacionesAEliminar = Object.keys(asignacionesSeleccionadas).filter(id => asignacionesSeleccionadas[id]);
    
    if (asignacionesAEliminar.length === 0) {
      showNotification("No hay asignaciones seleccionadas para eliminar", "info");
      return;
    }
    
    try {
      setInternalProcessingMessage("Eliminando asignaciones seleccionadas...");
      
      // Batch para todas las operaciones
      const batch = writeBatch(db);
      
      // Para cada ID, eliminar el documento correspondiente
      for (const docId of asignacionesAEliminar) {
        // Ignorar IDs temporales que comienzan con "temp-"
        if (docId.startsWith("temp-")) {
          console.warn(`Ignorando ID temporal: ${docId}`);
          continue;
        }
        
        // Encontrar la asignación correspondiente para obtener detalles
        const asignacion = assignments.find(a => a.docId === docId || a.id === docId);
        
        if (!asignacion) {
          console.warn(`No se encontró información para la asignación ${docId}`);
          continue;
        }
        
        batch.delete(doc(db, "asignaciones", docId));
      }
      
      // Ejecutar el batch
      await batch.commit();
      
      showNotification(`Se eliminaron ${asignacionesAEliminar.length} asignaciones correctamente`, "success");
      
      // Recargar datos
      await cargarDatosDesdeFirebase();
    } catch (error) {
      console.error("Error al eliminar asignaciones:", error);
      showNotification(`Error al eliminar: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };

  // Renderizar sección de asignaciones existentes
  const renderAsignacionesExistentes = () => {
    // Filtrar asignaciones por búsqueda
    const asignacionesFiltradas = assignments.filter(asig => 
      !searchTermAsignaciones || 
      (asig.order && asig.order.toString().includes(searchTermAsignaciones)) ||
      (asig.numeroOrden && asig.numeroOrden.toString().includes(searchTermAsignaciones)) ||
      (asig.centro && asig.centro.toLowerCase().includes(searchTermAsignaciones.toLowerCase())) ||
      (asig.nombreCentro && asig.nombreCentro.toLowerCase().includes(searchTermAsignaciones.toLowerCase()))
    );

    return (
      <div style={{ marginTop: '30px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '15px' 
        }}>
          <h3>Asignaciones Realizadas</h3>
          <div style={{display: 'flex', gap: '10px'}}>
            <button
              onClick={async () => {
                // Recargar datos completos
                await recargarDatosCompletos();
              }}
              style={{
                padding: '8px 12px',
                backgroundColor: '#2ecc71',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Recargar Datos
            </button>
            
            <button
              onClick={async () => {
                if (window.confirm("¿Está seguro de que desea eliminar todas las solicitudes, asignaciones e historiales duplicados? Esta acción no se puede deshacer.")) {
                  try {
                    setInternalProcessingMessage("Eliminando duplicados...");
                    
                    // Primero eliminar solicitudes duplicadas
                    const resultadoSolicitudes = await eliminarSolicitudesDuplicadas();
                    
                    // Después limpiar historial y asignaciones
                    const resultadoHistorial = await limpiarDuplicadosHistorial();
                    
                    // Mostrar resumen de resultados
                    const mensaje = `
                      Proceso completado con éxito:
                      
                      Solicitudes:
                      - Duplicadas encontradas: ${resultadoSolicitudes.duplicadas}
                      - Duplicadas eliminadas: ${resultadoSolicitudes.eliminadas}
                      
                      Asignaciones:
                      - Duplicadas encontradas: ${resultadoHistorial.asignacionesDuplicadas}
                      - Duplicadas eliminadas: ${resultadoHistorial.asignacionesEliminadas}
                      
                      Historial:
                      - Duplicadas encontradas: ${resultadoHistorial.historialDuplicado}
                      - Duplicadas eliminadas: ${resultadoHistorial.historialEliminado}
                    `;
                    
                    alert(mensaje);
                    setInternalProcessingMessage("");
                    
                    // Recargar datos
                    await cargarDatosDesdeFirebase();
                  } catch (error) {
                    console.error("Error al eliminar duplicados:", error);
                    alert(`Error al eliminar duplicados: ${error.message}`);
                    setInternalProcessingMessage("");
                  }
                }
              }}
              style={{
                padding: '8px 12px',
                backgroundColor: '#f39c12',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Eliminar Duplicados
            </button>
            
            <button
              onClick={eliminarAsignacionesSeleccionadas}
              style={{
                padding: '8px 12px',
                backgroundColor: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
              disabled={Object.values(asignacionesSeleccionadas).filter(Boolean).length === 0}
            >
              Eliminar Seleccionadas ({Object.values(asignacionesSeleccionadas).filter(Boolean).length})
            </button>
          </div>
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <input
            type="text"
            placeholder="Buscar por número de orden o centro..."
            value={searchTermAsignaciones}
            onChange={(e) => setSearchTermAsignaciones(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '4px',
              border: '1px solid #ddd'
            }}
          />
        </div>
        
        {asignacionesFiltradas.length === 0 ? (
          <div style={{ 
            padding: '20px', 
            textAlign: 'center', 
            color: '#666',
            backgroundColor: '#f9f9f9',
            borderRadius: '4px'
          }}>
            No hay asignaciones que coincidan con la búsqueda
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>
                    <input
                      type="checkbox"
                      id="seleccionar-todas-asignaciones"
                      checked={
                        asignacionesFiltradas.length > 0 &&
                        Object.keys(asignacionesSeleccionadas).length > 0 &&
                        asignacionesFiltradas.filter(a => !a.noAsignable && a.estado !== "NO_ASIGNABLE").every(a => 
                          a.docId && asignacionesSeleccionadas[a.docId]
                        )
                      }
                      onChange={(e) => {
                        // Limpiar console.log innecesarios al seleccionar/deseleccionar
                        const isChecked = e.target.checked;
                        
                        if (!isChecked) {
                          // Si desmarcamos, simplemente limpiamos todas las selecciones
                          setAsignacionesSeleccionadas({});
                        } else {
                          // Si marcamos, creamos un nuevo objeto con las asignaciones válidas
                          const newSeleccionadas = {};
                          
                          // Solo incluir asignaciones válidas (no las no asignables)
                          asignacionesFiltradas.forEach(a => {
                            // Si no tiene docId pero tiene id, usamos el id como docId
                            if (!a.docId && a.id) {
                              a.docId = a.id;
                            }
                            
                            if (a.docId && !a.noAsignable && a.estado !== "NO_ASIGNABLE") {
                              newSeleccionadas[a.docId] = true;
                            }
                          });
                          
                          // Verificar que no haya keys indefinidas
                          if (Object.keys(newSeleccionadas).some(key => key === "undefined")) {
                            console.error("Se detectaron claves 'undefined' en las selecciones");
                            delete newSeleccionadas["undefined"];
                          }
                          
                          setAsignacionesSeleccionadas(newSeleccionadas);
                        }
                      }}
                    />
                  </th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Nº Orden</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Centro Asignado</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Plazas</th>
                  <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Fecha Asignación</th>
                  <th style={{ padding: '10px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {asignacionesFiltradas.map((asignacion, idx) => (
                  <AsignacionRow
                    key={`asig-row-${asignacion.docId || idx}`}
                    asignacion={asignacion}
                    idx={idx}
                    asignacionesSeleccionadas={asignacionesSeleccionadas}
                    onSeleccionChange={(docId, isChecked) => {
                      console.log(`Cambiando selección de asignación ${docId} a: ${isChecked}`);
                      
                      // Verificar que el docId no sea undefined
                      if (!docId) {
                        console.warn("Se intentó cambiar la selección de una asignación con docId undefined");
                        return;
                      }
                      
                      if (isChecked) {
                        // Agregar la asignación seleccionada
                        setAsignacionesSeleccionadas(prev => ({
                          ...prev,
                          [docId]: true
                        }));
                      } else {
                        // Quitar la asignación deseleccionada
                        setAsignacionesSeleccionadas(prev => {
                          const newState = {...prev};
                          delete newState[docId];
                          return newState;
                        });
                      }
                    }}
                    onReasignar={handleReasignar}
                    onEliminar={eliminarAsignacion}
                    assignments={assignments}
                    availablePlazas={availablePlazas}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // Renderizar sección de resumen de plazas disponibles
  const renderResumenPlazasDisponibles = () => {
    // Calcular el total de plazas disponibles y ocupadas
    let totalPlazasDisponibles = 0;
    let totalPlazasOcupadas = 0;
    let totalPlazas = 0;
    let centrosConPlazas = 0;
    let centrosSinPlazas = 0;
    
    // Procesar cada plaza disponible
    availablePlazas.forEach(centro => {
      // Obtener datos de plazas, utilizando los campos que estén disponibles
      const plazasTotal = parseInt(centro.plazasTotal || centro.plazas || '0', 10);
      
      // Contar asignaciones para este centro
      const asignacionesParaCentro = assignments.filter(a => 
        a.centerId === centro.id && 
        !a.noAsignable && 
        a.estado !== "NO_ASIGNABLE" && 
        a.estado !== "REASIGNACION_NO_VIABLE"
      ).length;
      
      // Usar plazasOcupadas del centro o calcular desde asignaciones
      const plazasOcupadas = centro.plazasOcupadas || centro.asignadas || asignacionesParaCentro || 0;
      
      // Calcular plazas disponibles
      const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
      
      // Actualizar conteos totales
      totalPlazas += plazasTotal;
      totalPlazasDisponibles += plazasDisponibles;
      totalPlazasOcupadas += plazasOcupadas;
      
      // Contar centros con/sin plazas
      if (plazasDisponibles > 0) {
        centrosConPlazas++;
      } else {
        centrosSinPlazas++;
      }
    });

    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        marginTop: '30px'
      }}>
        <h3 style={{ marginBottom: '15px', color: '#2c3e50' }}>Resumen de Plazas Disponibles</h3>
        
        {/* Resumen general */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          flexWrap: 'wrap', 
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px'
        }}>
          <div style={{ flex: '1 0 200px', margin: '5px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#2c3e50' }}>{totalPlazas}</div>
            <div>Total de plazas</div>
          </div>
          <div style={{ flex: '1 0 200px', margin: '5px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#27ae60' }}>{totalPlazasDisponibles}</div>
            <div>Plazas disponibles</div>
          </div>
          <div style={{ flex: '1 0 200px', margin: '5px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#e74c3c' }}>{totalPlazasOcupadas}</div>
            <div>Plazas ocupadas</div>
          </div>
          <div style={{ flex: '1 0 200px', margin: '5px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#3498db' }}>{centrosConPlazas}</div>
            <div>Centros con plazas</div>
          </div>
          <div style={{ flex: '1 0 200px', margin: '5px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#e67e22' }}>{centrosSinPlazas}</div>
            <div>Centros sin plazas</div>
          </div>
        </div>
      </div>
    );
  };

  // Función para realizar la reasignación después de seleccionar nuevo centro
  const realizarReasignacion = async () => {
    if (!asignacionParaReasignar || !centroSeleccionadoReasignacion) {
      showNotification("Por favor, seleccione un centro para reasignar", "error");
      return;
    }

    try {
      setInternalProcessingMessage("Realizando reasignación...");
      
      // Logging para depuración
      console.log("Iniciando reasignación:");
      console.log("- Centro seleccionado ID:", centroSeleccionadoReasignacion);
      console.log("- Asignación para reasignar:", asignacionParaReasignar);

      // Obtener información de la orden
      const ordenAsignacion = asignacionParaReasignar.order || asignacionParaReasignar.numeroOrden;
      
      if (!ordenAsignacion) {
        showNotification("Error: No se pudo obtener el número de orden", "error");
        setInternalProcessingMessage("");
        return;
      }

      // Crear batch para todas las operaciones
      const batch = writeBatch(db);

      // PASO 1: Buscar y eliminar TODAS las asignaciones existentes para este número de orden
      // Primero buscar por order
      const asignacionesPorOrderQuery = query(
        collection(db, "asignaciones"),
        where("order", "==", ordenAsignacion)
      );
      const asignacionesPorOrder = await getDocs(asignacionesPorOrderQuery);
      
      // Luego buscar por numeroOrden
      const asignacionesPorNumeroOrdenQuery = query(
        collection(db, "asignaciones"),
        where("numeroOrden", "==", ordenAsignacion)
      );
      const asignacionesPorNumeroOrden = await getDocs(asignacionesPorNumeroOrdenQuery);
      
      // Eliminar todas las asignaciones encontradas
      const asignacionesAEliminar = new Set();
      asignacionesPorOrder.forEach(doc => asignacionesAEliminar.add(doc.id));
      asignacionesPorNumeroOrden.forEach(doc => asignacionesAEliminar.add(doc.id));
      
      console.log(`- Se eliminarán ${asignacionesAEliminar.size} asignaciones existentes`);
      
      asignacionesAEliminar.forEach(docId => {
        batch.delete(doc(db, "asignaciones", docId));
      });

      // PASO 2: Obtener información del nuevo centro con búsqueda más flexible
      let nuevoCentroInfo = null;
      
      // 1. Buscar directamente por ID
      nuevoCentroInfo = availablePlazas.find(c => c.id === centroSeleccionadoReasignacion);
      
      // 2. Si no se encuentra, intentar por docId
      if (!nuevoCentroInfo) {
        nuevoCentroInfo = availablePlazas.find(c => c.docId === centroSeleccionadoReasignacion);
      }
      
      // 3. Si aún no se encuentra, buscar insensible a mayúsculas/minúsculas
      if (!nuevoCentroInfo && centroSeleccionadoReasignacion) {
        const idLowerCase = String(centroSeleccionadoReasignacion).toLowerCase();
        nuevoCentroInfo = availablePlazas.find(c => 
          (c.id && String(c.id).toLowerCase() === idLowerCase) || 
          (c.docId && String(c.docId).toLowerCase() === idLowerCase)
        );
      }
      
      console.log("- Centro encontrado para reasignación:", nuevoCentroInfo);
      
      if (!nuevoCentroInfo) {
        showNotification("Error: Información del nuevo centro no encontrada", "error");
        console.error("No se encontró información del centro con ID:", centroSeleccionadoReasignacion);
        console.log("availablePlazas:", availablePlazas.map(c => ({ id: c.id, nombre: c.nombre })));
        setInternalProcessingMessage("");
        return;
      }

      // Obtener información del centro actual para el historial
      const centroActualNombre = asignacionParaReasignar.centro || 
                              asignacionParaReasignar.centerName || 
                              asignacionParaReasignar.nombreCentro || 
                              'Centro desconocido';

      // PASO 3: Crear nueva asignación
      const nuevaAsignacion = {
        order: ordenAsignacion,
        numeroOrden: ordenAsignacion,
        centerId: nuevoCentroInfo.id,
        centerName: nuevoCentroInfo.nombre || nuevoCentroInfo.centro,
        centro: nuevoCentroInfo.nombre || nuevoCentroInfo.centro,
        nombreCentro: nuevoCentroInfo.nombre || nuevoCentroInfo.centro,
        localidad: nuevoCentroInfo.localidad || '',
        municipio: nuevoCentroInfo.municipio || '',
        timestamp: Date.now(),
        asignacionManual: true,
        reasignado: true,
        estado: "REASIGNADO",  // Añadir estado explícito
        centroOriginal: centroActualNombre,
        centroPrevio: centroActualNombre
      };

      // Validar campos antes de guardar
      Object.keys(nuevaAsignacion).forEach(key => {
        if (nuevaAsignacion[key] === undefined) {
          if (key.includes('Id') || key === 'order' || key === 'numeroOrden') {
            nuevaAsignacion[key] = "0";
          } else if (key === 'timestamp') {
            nuevaAsignacion[key] = Date.now();
          } else if (typeof nuevaAsignacion[key] === 'boolean') {
            nuevaAsignacion[key] = false;
          } else {
            nuevaAsignacion[key] = "";
          }
        }
      });

      // PASO 4: Guardar nueva asignación
      const nuevaAsignacionRef = doc(collection(db, "asignaciones"));
      batch.set(nuevaAsignacionRef, nuevaAsignacion);

      // PASO 5: Registrar en historial
      const ahora = new Date();
      const historialData = {
        orden: ordenAsignacion,
        numeroOrden: ordenAsignacion,
        centroId: nuevoCentroInfo.id,
        estado: "REASIGNADO",
        mensaje: `Reasignación manual desde panel de administración de ${centroActualNombre} a ${nuevoCentroInfo.nombre || nuevoCentroInfo.centro}`,
        fechaHistorico: ahora.toISOString(),
        timestamp: ahora.getTime(),
        centroOriginal: centroActualNombre,
        centroAsignado: nuevoCentroInfo.nombre || nuevoCentroInfo.centro,
        centroIdAnterior: asignacionParaReasignar.centerId || null
      };

      const historialRef = doc(collection(db, "historialSolicitudes"));
      batch.set(historialRef, historialData);

      // PASO 6: Ejecutar todas las operaciones en batch
      await batch.commit();

      // PASO 7: Recargar datos
      await cargarDatosDesdeFirebase();

      showNotification(`Asignación #${ordenAsignacion} reasignada correctamente de ${centroActualNombre} a ${nuevoCentroInfo.nombre || nuevoCentroInfo.centro}`, "success");
      setModalReasignacion(false);
      setShowReasignacionModal(false); // Añadir esta línea
      setAsignacionParaReasignar(null);
      setCentroSeleccionadoReasignacion("");
    } catch (error) {
      console.error("Error al realizar reasignación:", error);
      showNotification(`Error al reasignar: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };

  // Función para marcar una solicitud como no asignable
  const marcarNoAsignable = async () => {
    if (!solicitudSeleccionada) {
      showNotification("Error: No hay solicitud seleccionada", "error");
      return;
    }

    try {
      setInternalProcessingMessage("Procesando solicitud no asignable...");
      
      // Obtener datos de la solicitud
      const ordenSolicitud = solicitudSeleccionada.orden || solicitudSeleccionada.numeroOrden;
      const docId = solicitudSeleccionada.docId;
                              
                              if (!ordenSolicitud) {
        showNotification("Error: La solicitud no tiene número de orden", "error");
        setInternalProcessingMessage("");
        return;
      }
      
      if (!docId) {
        showNotification("Error: La solicitud no tiene identificador", "error");
        setInternalProcessingMessage("");
        return;
      }
      
      // Usar batch para operaciones atómicas
      const batch = writeBatch(db);
      
      // MODIFICACIÓN: Crear una entrada en asignaciones para que el usuario pueda ver su estado
      const nuevaAsignacion = {
        order: ordenSolicitud,
        numeroOrden: ordenSolicitud,
        noAsignable: true,  // Nuevo campo para identificar estas asignaciones especiales
        estado: "NO_ASIGNABLE",
        centro: "No hay plaza disponible",
        centerName: "No hay plaza disponible",
        nombreCentro: "No hay plaza disponible",
        mensaje: "No hay plazas disponibles en ninguno de los centros seleccionados",
        timestamp: Date.now(),
        asignacionManual: true
      };
      
      const asignacionRef = doc(collection(db, "asignaciones"));
      batch.set(asignacionRef, nuevaAsignacion);
      
      // Crear registro en historial
      const ahora = new Date();
      const historialData = {
                                orden: ordenSolicitud,
        numeroOrden: ordenSolicitud,
        estado: "NO_ASIGNABLE",
        mensaje: "No hay plazas disponibles en ninguno de los centros seleccionados",
        fechaHistorico: ahora.toISOString(),
        timestamp: ahora.getTime(),
        // Guardar todas las opciones de centros seleccionados
        centrosSeleccionados: solicitudSeleccionada.centrosIds || solicitudSeleccionada.centrosSeleccionados || []
      };
      
      const historialRef = doc(collection(db, "historialSolicitudes"));
      batch.set(historialRef, historialData);
      
      // Eliminar la solicitud pendiente
      batch.delete(doc(db, "solicitudesPendientes", docId));
      
      // Ejecutar los cambios
      await batch.commit();
      
      // Recargar datos
      await cargarDatosDesdeFirebase();
      
      showNotification(`Solicitud ${ordenSolicitud} marcada como no asignable por falta de opciones`, "info");
      setModalAsignacionManual(false);
      setShowAsignacionManualModal(false); // Añadir esta línea
      setSolicitudSeleccionada(null);
                                } catch (error) {
      console.error("Error al marcar como no asignable:", error);
      showNotification(`Error: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };

  // Función para marcar una reasignación como no asignable
  const marcarReasignacionNoAsignable = async () => {
    if (!asignacionParaReasignar) {
      showNotification("Error: No hay asignación seleccionada", "error");
      return;
    }

    try {
      setInternalProcessingMessage("Procesando reasignación no viable...");
      
      // Obtener datos de la asignación
      const ordenAsignacion = asignacionParaReasignar.order || asignacionParaReasignar.numeroOrden;
      const asignacionId = asignacionParaReasignar.docId || asignacionParaReasignar.id;
      const centroActual = asignacionParaReasignar.centro || asignacionParaReasignar.centerName || 'Centro desconocido';
      
      if (!ordenAsignacion) {
        showNotification("Error: La asignación no tiene número de orden", "error");
                              setInternalProcessingMessage("");
        return;
      }
      
      if (!asignacionId) {
        showNotification("Error: La asignación no tiene identificador", "error");
        setInternalProcessingMessage("");
        return;
      }
      
      // Usar batch para operaciones atómicas
      const batch = writeBatch(db);
      
      // MODIFICACIÓN: Actualizar la asignación existente con información sobre el intento de reasignación
      const asignacionActualizada = {
        intentoReasignacion: true,
        fechaIntentoReasignacion: new Date().toISOString(),
        mensajeReasignacion: "Reasignación no viable por falta de plazas disponibles",
        estado: "REASIGNACION_NO_VIABLE"
      };
      
      // Actualizar la asignación existente
      const asignacionRef = doc(db, "asignaciones", asignacionId);
      batch.update(asignacionRef, asignacionActualizada);
      
      // Crear registro en historial
      const ahora = new Date();
      const historialData = {
        orden: ordenAsignacion,
        numeroOrden: ordenAsignacion,
        estado: "REASIGNACION_NO_VIABLE",
        centroId: asignacionParaReasignar.centerId,
        mensaje: `No es posible reasignar. Se mantiene en ${centroActual} por falta de opciones disponibles`,
        fechaHistorico: ahora.toISOString(),
        timestamp: ahora.getTime(),
        // Guardar las opciones de centros originales
        centrosSeleccionados: asignacionParaReasignar.centrosIdsOriginales || []
      };
      
      const historialRef = doc(collection(db, "historialSolicitudes"));
      batch.set(historialRef, historialData);
      
      // Ejecutar los cambios
      await batch.commit();
      
      // Recargar datos
      await cargarDatosDesdeFirebase();
      
      showNotification(`Se mantiene la asignación de ${ordenAsignacion} en ${centroActual} por falta de alternativas`, "info");
      setModalReasignacion(false);
      setAsignacionParaReasignar(null);
      setCentroSeleccionadoReasignacion("");
                            } catch (error) {
      console.error("Error al mantener asignación:", error);
      showNotification(`Error: ${error.message}`, "error");
    } finally {
                              setInternalProcessingMessage("");
    }
  };

  // Renderizar el panel de administración principal con los botones de acción rápida
  const renderAccionesRapidas = () => {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h3 style={{ margin: 0, marginBottom: '15px', color: '#2c3e50' }}>Acciones Rápidas</h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={async () => {
              // Recargar datos completos
              await recargarDatosCompletos();
            }}
            style={{
              padding: '8px 12px',
              backgroundColor: '#2ecc71',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Recargar Datos
          </button>
          
          <button
            onClick={async () => {
              try {
                setInternalProcessingMessage("Actualizando plazas de centros...");
                
                // Actualizar datos manualmente si existe la función
                if (typeof actualizarDatosManualmente === 'function') {
                  await actualizarDatosManualmente();
                } else {
                  // Si no existe la función, hacer una recarga completa
                  await cargarDatosDesdeFirebase();
                }
                
                showNotification("Plazas de centros actualizadas correctamente", "success");
              } catch (error) {
                console.error("Error al actualizar plazas:", error);
                showNotification(`Error al actualizar plazas: ${error.message}`, "error");
              } finally {
                setInternalProcessingMessage("");
              }
            }}
            style={{
              padding: '8px 12px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Actualizar Plazas
          </button>
          
          <button
            onClick={async () => {
              if (window.confirm("¿Está seguro de que desea eliminar todas las solicitudes, asignaciones e historiales duplicados? Esta acción no se puede deshacer.")) {
                try {
                  setInternalProcessingMessage("Eliminando duplicados...");
                  
                  // Primero eliminar solicitudes duplicadas
                  const resultadoSolicitudes = await eliminarSolicitudesDuplicadas();
                  
                  // Después limpiar historial y asignaciones
                  const resultadoHistorial = await limpiarDuplicadosHistorial();
                  
                  // Mostrar resumen de resultados
                  const mensaje = `
                    Proceso completado con éxito:
                    
                    Solicitudes:
                    - Duplicadas encontradas: ${resultadoSolicitudes.duplicadas}
                    - Duplicadas eliminadas: ${resultadoSolicitudes.eliminadas}
                    
                    Asignaciones:
                    - Duplicadas encontradas: ${resultadoHistorial.asignacionesDuplicadas}
                    - Duplicadas eliminadas: ${resultadoHistorial.asignacionesEliminadas}
                    
                    Historial:
                    - Duplicadas encontradas: ${resultadoHistorial.historialDuplicado}
                    - Duplicadas eliminadas: ${resultadoHistorial.historialEliminado}
                  `;
                  
                  alert(mensaje);
                  setInternalProcessingMessage("");
                  
                  // Recargar datos
                await cargarDatosDesdeFirebase();
                
              } catch (error) {
                  console.error("Error al eliminar duplicados:", error);
                  alert(`Error al eliminar duplicados: ${error.message}`);
                  setInternalProcessingMessage("");
              }
              }
            }}
            style={{
              backgroundColor: '#e74c3c',
              color: 'white',
              padding: '10px 15px',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              marginRight: '10px',
              fontWeight: 'bold'
            }}
          >
            Eliminar Duplicados
          </button>
        </div>
      </div>
    );
  };

  // Función para manejar el cierre del modal
  const handleCloseModal = () => {
    setModalReasignacion(false);
    setShowReasignacionModal(false);
    setAsignacionParaReasignar(null);
    setCentroSeleccionadoReasignacion("");
    setSearchTermCentros("");
    setModoForzadoReasignacion(false); // Resetear el modo forzado al cerrar el modal
  };

  // Renderizar modal de reasignación
  const renderModalReasignacion = () => {
    if (!asignacionParaReasignar) return null;

    // Obtener todos los centros seleccionados por orden de prioridad original
    const centrosOriginales = asignacionParaReasignar.centrosIdsOriginales || [];
    
    // Función para buscar un centro de forma más flexible
    const buscarCentroFlexible = (id) => {
      // Validación de entrada
      if (!id || typeof id !== 'string') {
        return null;
      }
      
      // 1. Búsqueda exacta por id
      let centro = availablePlazas.find(c => c.id === id);
      if (centro) return centro;
      
      // 2. Búsqueda por docId
      centro = availablePlazas.find(c => c.docId === id);
      if (centro) return centro;
      
      // 3. Búsqueda por código
      centro = availablePlazas.find(c => c.codigo === id);
      if (centro) return centro;
      
      // 4. Búsqueda caso insensitivo (por si los IDs están en mayúsculas/minúsculas diferentes)
        centro = availablePlazas.find(c => 
          (c.id && c.id.toLowerCase() === id.toLowerCase()) || 
          (c.docId && c.docId.toLowerCase() === id.toLowerCase())
      );
      if (centro) return centro;
      
      // 5. Búsqueda por prefijo del ID (primeros caracteres)
      if (id.length > 4) {
        const idPrefix = id.substring(0, 8);
        centro = availablePlazas.find(c => 
          (c.id && c.id.startsWith(idPrefix)) || 
          (c.docId && c.docId.startsWith(idPrefix))
        );
        if (centro) return centro;
      }
      
      // 6. Como último recurso, buscar por nombre o codigo en toda la colección
      for (const centro of availablePlazas) {
        if (centro.codigo && centro.codigo === id) return centro;
        if (centro.nombre && centro.nombre === id) return centro;
        if (centro.centro && centro.centro === id) return centro;
      }
      
      // No encontrado
      return null;
    };
    
    // Usar información de centros completa si está disponible
    const centrosOriginalesData = asignacionParaReasignar.centrosCompletos && 
                                  Array.isArray(asignacionParaReasignar.centrosCompletos) && 
                                  asignacionParaReasignar.centrosCompletos.length > 0
      ? asignacionParaReasignar.centrosCompletos
      : centrosOriginales.map((centroId, index) => {
        // Intentar encontrar el centro con búsqueda flexible
        const centro = buscarCentroFlexible(centroId);
        
        // Si no se encuentra el centro, crear un objeto "placeholder"
        if (!centro) {
            return {
            id: centroId,
            nombre: `Opción ${index + 1}`,
            centro: `Opción ${index + 1}`,
            plazasTotal: 0,
            plazas: 0,
            localidad: '',
            municipio: '',
            prioridad: index + 1,
            plazasDisponiblesActualizadas: 0,
            sinPlazas: true,
            noEncontrado: true
          };
        }
        
        // Procesamiento normal para centros encontrados
        return {
          ...centro,
          nombre: centro.nombre || centro.centro,
          prioridad: index + 1,
          plazasDisponiblesActualizadas: Math.max(0, parseInt(centro.plazasTotal || centro.plazas || '0', 10) - parseInt(centro.plazasOcupadas || centro.asignadas || '0', 10)),
          sinPlazas: (Math.max(0, parseInt(centro.plazasTotal || centro.plazas || '0', 10) - parseInt(centro.plazasOcupadas || centro.asignadas || '0', 10)) <= 0)
        };
      });

    return (
      <div 
        style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 1000,
          display: 'flex', 
          justifyContent: 'center',
          alignItems: 'center'
        }}
        onClick={handleCloseModal}
      >
        <div 
          style={{ 
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            width: '90%',
            maxWidth: '700px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
          }}
          onClick={e => e.stopPropagation()}
        >
          <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
            Reasignación - Orden #{asignacionParaReasignar.order || asignacionParaReasignar.numeroOrden}
          </h3>
          
          <div style={{
            backgroundColor: '#e8f4fd',
            border: '1px solid #bedcf3',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '15px',
            color: '#0d4c8c'
          }}>
            <strong>Centro actual:</strong> {asignacionParaReasignar.centro || asignacionParaReasignar.centerName || asignacionParaReasignar.nombreCentro || 'Centro desconocido'}
          </div>
          
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ color: '#004d40', borderBottom: '2px solid #26a69a', paddingBottom: '8px', marginBottom: '12px' }}>
              Opciones seleccionadas por el usuario (en orden de prioridad): {centrosOriginalesData.length}
            </h4>
            
            {centrosOriginalesData.length > 0 ? (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: '10px',
                maxHeight: '250px',
                overflow: 'auto',
                padding: '10px',
                border: '1px solid #26a69a',
                borderRadius: '5px',
                backgroundColor: '#f5f5f5'
              }}>
                {centrosOriginalesData.map((centro, index) => {
                  // Eliminamos el log que causa re-renderizados
                  return (
                    <div key={`original-${centro.id}-${index}`} style={{
                      padding: '12px',
                      borderRadius: '5px',
                      border: '1px solid #ddd',
                      backgroundColor: centro.noEncontrado 
                        ? '#fff3cd'
                        : centroSeleccionadoReasignacion === centro.id 
                          ? '#e3f2fd' 
                          : centro.sinPlazas 
                            ? '#ffebee' 
                            : 'white',
                      cursor: centro.noEncontrado 
                        ? 'not-allowed' 
                        : (centro.sinPlazas && !modoForzadoReasignacion) 
                          ? 'not-allowed' 
                          : 'pointer',
                      opacity: centro.noEncontrado 
                        ? 0.8 
                        : (centro.sinPlazas && !modoForzadoReasignacion) 
                          ? 0.7 
                          : 1,
                      position: 'relative',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      marginBottom: '8px'
                    }} onClick={() => {
                      // Simplificamos esta condición para permitir seleccionar cualquier opción que no sea "noEncontrado"
                      if (!centro.noEncontrado) {
                        // Permitir seleccionar el centro independientemente de las plazas
                        // cuando el modo forzado está activo
                        setCentroSeleccionadoReasignacion(centro.id);
                        // Eliminar este log también para evitar re-renderizado
                      }
                    }}>
                      <div style={{ 
                        position: 'absolute', 
                        top: '8px', 
                        left: '8px',
                        backgroundColor: centro.noEncontrado ? '#ffc107' : '#26a69a',
                        color: centro.noEncontrado ? '#856404' : 'white',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        fontWeight: 'bold',
                        fontSize: '14px'
                      }}>
                        {centro.prioridad}
                      </div>
                      
                      <div style={{ 
                        fontWeight: 'bold', 
                        fontSize: '16px',
                        marginLeft: '30px',
                        color: centro.noEncontrado ? '#856404' : 
                               centro.sinPlazas ? '#d32f2f' : '#1a237e'
                      }}>
                        {centro.nombre || centro.centro || `Opción ${centro.prioridad}`}
                        
                        {centro.sinPlazas && !centro.noEncontrado && (
                          <span style={{
                            backgroundColor: '#f44336',
                            color: 'white',
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            marginLeft: '8px'
                          }}>
                            Sin plazas
                          </span>
                        )}
                      </div>
                      
                      {!centro.noEncontrado ? (
                        <>
                          <div style={{ fontSize: '14px', color: '#666', marginTop: '3px', marginLeft: '30px' }}>
                            {centro.localidad && `${centro.localidad}`}
                            {centro.municipio && centro.municipio !== centro.localidad && ` - ${centro.municipio}`}
                            {!centro.localidad && !centro.municipio && "Sin información de ubicación"}
                          </div>
                          
                          <div style={{ 
                            fontSize: '14px', 
                            marginTop: '5px',
                            marginLeft: '30px',
                            color: centro.sinPlazas ? '#d32f2f' : '#388e3c',
                            fontWeight: 'bold'
                          }}>
                            Plazas: <strong>{centro.plazasDisponiblesActualizadas || 0}</strong> disponibles 
                            de {centro.plazasTotal || centro.plazas || 0}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: '13px', color: '#856404', marginTop: '5px', marginLeft: '30px' }}>
                          Este centro ya no existe en la base de datos actual
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#666', padding: '10px', textAlign: 'center', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                No se encontraron las opciones originales del usuario.
              </div>
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h4 style={{ color: '#0d47a1', borderBottom: '2px solid #2196f3', paddingBottom: '8px', marginBottom: '12px' }}>
              Todos los centros disponibles:
            </h4>
            
            <input
              type="text"
              placeholder="Buscar por nombre, localidad o municipio..."
              value={searchTermCentros}
              onChange={(e) => setSearchTermCentros(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                marginBottom: '12px',
                border: '1px solid #2196f3',
                borderRadius: '4px'
              }}
            />
            
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              gap: '10px',
              maxHeight: '250px',
              overflow: 'auto',
              padding: '10px',
              border: '1px solid #2196f3',
              borderRadius: '5px',
              backgroundColor: '#f5f5f5'
            }}>
              {availablePlazas
                .filter(centro => 
                  // No filtrar centros originales, mostrar todos excepto el actual
                  centro.id !== asignacionParaReasignar.centerId &&
                  // Filtrar por término de búsqueda
                  (searchTermCentros === '' || 
                   (centro.nombre && centro.nombre.toLowerCase().includes(searchTermCentros.toLowerCase())) ||
                   (centro.centro && centro.centro.toLowerCase().includes(searchTermCentros.toLowerCase())) ||
                   (centro.localidad && centro.localidad.toLowerCase().includes(searchTermCentros.toLowerCase())) ||
                   (centro.municipio && centro.municipio.toLowerCase().includes(searchTermCentros.toLowerCase())))
                )
                .map((centro, index) => {
                  // Verificar si es centro prioritario original
                  const esCentroPrioritario = centrosOriginales.includes(centro.id);
                  const prioridadIndex = centrosOriginales.findIndex(id => id === centro.id);
                  
                  // Buscar también por docId ya que puede ser que los IDs originales sean docIds
                  const esCentroPrioritarioDocId = centro.docId && centrosOriginales.includes(centro.docId);
                  const prioridadIndexDocId = centro.docId ? centrosOriginales.findIndex(id => id === centro.docId) : -1;
                  
                  // Usar la mejor coincidencia
                  const esPrioritario = esCentroPrioritario || esCentroPrioritarioDocId;
                  const prioridad = prioridadIndex !== -1 ? prioridadIndex + 1 : 
                                    prioridadIndexDocId !== -1 ? prioridadIndexDocId + 1 : 0;
                  
                  // Calcular plazas disponibles
                  const plazasTotal = parseInt(centro.plazasTotal || centro.plazas || '0', 10);
                  const plazasOcupadas = parseInt(centro.plazasOcupadas || centro.asignadas || '0', 10);
                  const plazasDisponibles = Math.max(0, plazasTotal - plazasOcupadas);
                  const sinPlazas = plazasDisponibles <= 0;
                  
                  return (
                    <div key={`todos-${centro.id}-${index}`} style={{
                      padding: '10px',
                      borderRadius: '5px',
                      border: esPrioritario ? '2px solid #26a69a' : '1px solid #ddd',
                      backgroundColor: centroSeleccionadoReasignacion === centro.id 
                        ? '#e3f2fd' 
                        : sinPlazas
                          ? '#ffebee'
                          : esPrioritario
                            ? '#e0f2f1'
                            : 'white',
                      cursor: sinPlazas && !modoForzadoReasignacion ? 'not-allowed' : 'pointer',
                      opacity: sinPlazas && !modoForzadoReasignacion ? 0.7 : 1
                    }} onClick={() => {
                      // Siempre permitir seleccionar cualquier centro, independientemente de sus plazas
                      setCentroSeleccionadoReasignacion(centro.id);
                    }}>
                      <div style={{ 
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <div style={{ fontWeight: 'bold' }}>
                          {centro.nombre || centro.centro}
                        </div>
                        
                        {esPrioritario && (
                          <span style={{
                            backgroundColor: '#26a69a',
                            color: 'white',
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            Opción {prioridad}
                          </span>
                        )}
                        
                        {sinPlazas && (
                          <span style={{
                            backgroundColor: '#f44336',
                            color: 'white',
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px'
                          }}>
                            Sin plazas
                          </span>
                        )}
                      </div>
                      
                      <div style={{ fontSize: '13px', color: '#666' }}>
                        {centro.localidad && `${centro.localidad}`}
                        {centro.municipio && centro.municipio !== centro.localidad && ` - ${centro.municipio}`}
                      </div>
                      
                      <div style={{ 
                        fontSize: '13px', 
                        marginTop: '5px',
                        color: sinPlazas ? '#d32f2f' : '#388e3c',
                        fontWeight: 'bold'
                      }}>
                        Plazas: <strong>{plazasDisponibles}</strong> disponibles 
                        de {plazasTotal}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
          
          <div style={{
            backgroundColor: '#fffde7',
            border: '1px solid #ffd54f',
            borderRadius: '4px',
            padding: '10px',
            marginBottom: '15px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <input
              type="checkbox"
              id="modo-forzado"
              checked={modoForzadoReasignacion}
              onChange={() => setModoForzadoReasignacion(!modoForzadoReasignacion)}
            />
            <label htmlFor="modo-forzado" style={{ cursor: 'pointer' }}>
              <strong>Modo forzado:</strong> Permitir asignar a centros sin plazas disponibles (sobreocupación)
            </label>
          </div>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            gap: '10px',
            borderTop: '1px solid #eee',
            paddingTop: '15px'
          }}>
            <button 
              onClick={handleCloseModal}
              style={{
                padding: '8px 15px',
                borderRadius: '4px',
                border: '1px solid #ddd',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
            <button 
              onClick={marcarReasignacionNoAsignable}
              style={{
                padding: '8px 15px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: '#f44336',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              No se puede reasignar
            </button>
            <button 
              onClick={realizarReasignacion}
              disabled={!centroSeleccionadoReasignacion}
              style={{
                padding: '8px 15px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: centroSeleccionadoReasignacion ? '#ff9800' : '#cccccc',
                color: 'white',
                cursor: centroSeleccionadoReasignacion ? 'pointer' : 'not-allowed'
              }}
            >
              Reasignar
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  // Eliminar una solicitud pendiente específica
  const eliminarSolicitudPendiente = async (solicitudId) => {
    if (!solicitudId) {
      console.warn("Se intentó eliminar una solicitud con ID indefinido");
      showNotification("Error: No se puede eliminar la solicitud (ID no válido)", "error");
      return;
    }
    
    // Verificar que la solicitud exista
    const solicitud = solicitudes.find(s => s.docId === solicitudId || s.id === solicitudId);
    if (!solicitud) {
      console.warn(`No se encontró la solicitud con ID: ${solicitudId}`);
      
      // Si no se encuentra por docId, intentar buscar por id
      const solicitudPorId = solicitudes.find(s => s.id === solicitudId);
      if (solicitudPorId) {
        solicitudId = solicitudPorId.id; // Usar el id si se encuentra
      } else {
        showNotification("Error: La solicitud no existe o ya fue eliminada", "error");
        return;
      }
    }
    
    if (window.confirm("¿Está seguro de que desea eliminar esta solicitud pendiente y su historial? Esta acción no se puede deshacer.")) {
      try {
        setInternalProcessingMessage("Eliminando solicitud pendiente y su historial...");
        
        const batch = writeBatch(db);
        
        // 1. Eliminar la solicitud pendiente
        batch.delete(doc(db, "solicitudesPendientes", solicitudId));
        
        // 2. Buscar y eliminar registros relacionados en historialSolicitudes
        const orden = solicitud.orden || solicitud.numeroOrden;
        const historialSnapshot = await getDocs(
          query(collection(db, "historialSolicitudes"), 
            where("orden", "in", [orden, String(orden)])
        ));
        
        let historialEliminados = 0;
        historialSnapshot.forEach(doc => {
          batch.delete(doc.ref);
          historialEliminados++;
        });
        
        // 3. Registrar en solicitudes borradas
        const solicitudBorradaRef = doc(collection(db, "solicitudesBorradas"));
        batch.set(solicitudBorradaRef, {
          solicitudId: solicitudId,
          orden: orden,
          eliminadaEn: serverTimestamp(),
          eliminadaPor: "admin",
          historialEliminado: true,
          cantidadHistorialEliminado: historialEliminados
        });
        
        // 4. Ejecutar todas las operaciones
        await batch.commit();
        
        showNotification(`Solicitud y ${historialEliminados} registros de historial eliminados correctamente`, "success");
        await cargarDatosDesdeFirebase();
        
      } catch (error) {
        console.error("Error al eliminar solicitud:", error);
        showNotification(`Error al eliminar: ${error.message}`, "error");
      } finally {
        setInternalProcessingMessage("");
      }
    }
  };
  
  // Eliminar una entrada del historial de solicitudes
  const eliminarHistorialSolicitud = async (historialId) => {
    if (!historialId) return;
    
    if (window.confirm("¿Está seguro de que desea eliminar esta entrada del historial? Esta acción no se puede deshacer.")) {
      try {
        setInternalProcessingMessage("Eliminando entrada del historial...");
        
        await deleteDoc(doc(db, "historialSolicitudes", historialId));
        
        // Añadir a elementos borrados para evitar recreación
        await addDoc(collection(db, "elementosBorrados"), {
          tipo: "historial",
          itemId: historialId,
          eliminadaEn: serverTimestamp(),
          eliminadaPor: "admin"
        });
        
        showNotification("Entrada del historial eliminada correctamente", "success");
        await cargarDatosDesdeFirebase();
        
        setInternalProcessingMessage("");
      } catch (error) {
        console.error("Error al eliminar entrada del historial:", error);
        showNotification(`Error al eliminar: ${error.message}`, "error");
        setInternalProcessingMessage("");
      }
    }
  };
  
  // Función para eliminar una asignación individual
  const eliminarAsignacion = async (asignacion) => {
    if (!asignacion || !asignacion.docId) {
      showNotification("Error: No se puede eliminar la asignación", "error");
      return;
    }

    if (!window.confirm(`¿Está seguro de que desea eliminar la asignación para la orden ${asignacion.order || asignacion.numeroOrden}? Esta acción no se puede deshacer.`)) {
      return;
    }
    
    try {
      setInternalProcessingMessage(`Eliminando asignación para orden ${asignacion.order || asignacion.numeroOrden}...`);
      
      // 1. Eliminar de la colección de asignaciones
      await deleteDoc(doc(db, "asignaciones", String(asignacion.docId)));
      console.log(`Asignación ${asignacion.docId} eliminada correctamente`);
      
      // 2. Buscar y eliminar registros relacionados en historialSolicitudes
      const orden = asignacion.order || asignacion.numeroOrden;
      const historialSnapshot = await getDocs(
        query(collection(db, "historialSolicitudes"), where("orden", "==", orden))
      );
      
      const batch = writeBatch(db);
      let historialEliminados = 0;
      
      // Añadir operaciones de eliminación al batch
      historialSnapshot.forEach(doc => {
        batch.delete(doc.ref);
        historialEliminados++;
      });
      
      // Registrar en elementos borrados
      const elementosBorradosRef = doc(collection(db, "elementosBorrados"));
      batch.set(elementosBorradosRef, {
        tipo: "asignacion",
        itemId: asignacion.docId,
        orden: orden,
        eliminadoEn: serverTimestamp(),
        eliminadoPorAdmin: true
      });
      
      // 3. Ejecutar todas las operaciones en batch
      await batch.commit();
      
      showNotification(`Asignación eliminada correctamente. Se eliminaron también ${historialEliminados} registros de historial relacionados.`, "success");
      
      // 4. Recargar datos
      await cargarDatosDesdeFirebase();
      
      // 5. Resetear selecciones después de eliminar
      setAsignacionesSeleccionadas({});
    } catch (error) {
      console.error("Error al eliminar asignación:", error);
      showNotification(`Error al eliminar: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };
  
  const renderFeedbackSection = () => {
    // Filtrar las solicitudes según el estado seleccionado
    const solicitudesFiltradas = feedbackFilter === 'todos'
      ? feedbackSolicitudes
      : feedbackSolicitudes.filter(feedback => feedback.status === feedbackFilter);
      
    return (
      <div style={{ marginTop: '20px', padding: '20px', backgroundColor: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h3>Solicitudes de Modificación</h3>
        
        {/* Selector de filtro */}
        <div style={{ marginBottom: '15px' }}>
          <label style={{ marginRight: '10px', fontWeight: 'bold' }}>Filtrar por estado:</label>
          <select 
            value={feedbackFilter}
            onChange={(e) => setFeedbackFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              marginRight: '10px'
            }}
          >
            <option value="todos">Todos</option>
            <option value="pendiente">Pendientes</option>
            <option value="en_proceso">En Proceso</option>
            <option value="completado">Completadas</option>
            <option value="rechazado">Rechazadas</option>
          </select>
          <span style={{ fontSize: '14px', color: '#666' }}>
            {solicitudesFiltradas.length} {solicitudesFiltradas.length === 1 ? 'solicitud' : 'solicitudes'} {feedbackFilter !== 'todos' ? `en estado "${feedbackFilter}"` : 'en total'}
          </span>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Número de Orden</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Feedback</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Fecha</th>
                <th style={{ padding: '12px', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {solicitudesFiltradas.length > 0 ? (
                solicitudesFiltradas.map((feedback) => (
                  <tr key={feedback.id}>
                    <td style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>{feedback.orderNumber}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>{feedback.feedback}</td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>
                      {new Date(feedback.timestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>
                      <select
                        value={feedback.status}
                        onChange={async (e) => {
                          const newStatus = e.target.value;
                          await updateDoc(doc(db, 'feedback', feedback.id), {
                            status: newStatus
                          });
                        }}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid #ddd',
                          backgroundColor: 
                            feedback.status === 'pendiente' ? '#f8d7da' :
                            feedback.status === 'en_proceso' ? '#fff3cd' :
                            feedback.status === 'completado' ? '#d4edda' :
                            feedback.status === 'rechazado' ? '#d6d8db' : 'white'
                        }}
                      >
                        <option value="pendiente">Pendiente</option>
                        <option value="en_proceso">En Proceso</option>
                        <option value="completado">Completado</option>
                        <option value="rechazado">Rechazado</option>
                      </select>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" style={{ padding: '20px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>
                    No hay solicitudes {feedbackFilter !== 'todos' ? `con estado "${feedbackFilter}"` : ''} para mostrar
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };
  
  // Función para cargar asignaciones recreadas
  const cargarAsignacionesRecreadas = async () => {
    try {
      setLoadingAsignacionesRecreadas(true);
      const recredasSnapshot = await getDocs(collection(db, "asignacionesRecreadas"));
      
      if (recredasSnapshot.empty) {
        setAsignacionesRecreadas([]);
        setLoadingAsignacionesRecreadas(false);
        return;
      }
      
      const asignaciones = recredasSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          fechaDeteccion: doc.data().fechaDeteccion?.toDate() || new Date()
        }))
        .filter(a => !a.eliminada)
        .sort((a, b) => b.fechaDeteccion - a.fechaDeteccion);
      
      setAsignacionesRecreadas(asignaciones);
    } catch (error) {
      console.error("Error al cargar asignaciones recreadas:", error);
      showNotification("Error al cargar asignaciones recreadas", "error");
    } finally {
      setLoadingAsignacionesRecreadas(false);
    }
  };
  
  // Función para detectar manualmente asignaciones recreadas
  const detectarAsignacionesRecreadas = async () => {
    try {
      setInternalProcessingMessage("Detectando asignaciones recreadas...");
      
      // Obtener todas las asignaciones actuales
      const asignacionesSnapshot = await getDocs(collection(db, "asignaciones"));
      const asignacionesActuales = asignacionesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Obtener elementos borrados del tipo asignación
      const elementosBorradosSnapshot = await getDocs(
        query(collection(db, "elementosBorrados"), where("tipo", "==", "asignacion"))
      );
      
      if (elementosBorradosSnapshot.empty) {
        showNotification("No se encontraron registros de asignaciones eliminadas", "info");
        setInternalProcessingMessage("");
        return;
      }
      
      // Crear un mapa de órdenes que han sido eliminados previamente
      const ordenesEliminados = new Map();
      elementosBorradosSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.orden) {
          ordenesEliminados.set(Number(data.orden), true);
        }
      });
      
      let asignacionesRecreadasDetectadas = 0;
      const batch = writeBatch(db);
      
      // Verificar cada asignación actual
      for (const asignacion of asignacionesActuales) {
        const orden = asignacion.order || asignacion.numeroOrden;
        if (!orden) continue;
        
        const ordenNumerico = Number(orden);
        if (isNaN(ordenNumerico)) continue;
        
        // Si este orden está en la lista de eliminados, es una recreada
        if (ordenesEliminados.has(ordenNumerico)) {
          // Verificar si ya está registrada como recreada
          const yaRegistradaSnapshot = await getDocs(
            query(
              collection(db, "asignacionesRecreadas"), 
              where("asignacionId", "==", asignacion.id),
              where("eliminada", "==", false)
            )
          );
          
          // Si no está registrada, la añadimos
          if (yaRegistradaSnapshot.empty) {
            const nuevaRecreadaRef = doc(collection(db, "asignacionesRecreadas"));
            batch.set(nuevaRecreadaRef, {
              asignacionId: asignacion.id,
              data: asignacion,
              orden: ordenNumerico,
              fechaDeteccion: serverTimestamp(),
              eliminada: false
            });
            
            asignacionesRecreadasDetectadas++;
          }
        }
      }
      
      // Guardar cambios si hay asignaciones recreadas
      if (asignacionesRecreadasDetectadas > 0) {
        await batch.commit();
        showNotification(`Se detectaron ${asignacionesRecreadasDetectadas} asignaciones recreadas`, "success");
        
        // Recargar la lista
        await cargarAsignacionesRecreadas();
      } else {
        showNotification("No se detectaron nuevas asignaciones recreadas", "info");
      }
    } catch (error) {
      console.error("Error al detectar asignaciones recreadas:", error);
      showNotification(`Error: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };
  
  // Función para eliminar una asignación recreada
  const eliminarAsignacionRecreada = async (asignacion) => {
    if (!asignacion || !asignacion.asignacionId) {
      showNotification("Error: No se puede eliminar la asignación recreada", "error");
      return;
    }
    
    try {
      setInternalProcessingMessage("Eliminando asignación recreada...");
      
      // Crear batch para operaciones atómicas
      const batch = writeBatch(db);
      
      // Marcar como eliminada en la colección de recreadas
      batch.update(doc(db, "asignacionesRecreadas", asignacion.id), {
        eliminada: true,
        fechaEliminacion: serverTimestamp()
      });
      
      // Eliminar la asignación de la colección principal
      batch.delete(doc(db, "asignaciones", String(asignacion.asignacionId)));
      
      // Registrar en el historial y elementos borrados
      const historialData = {
        orden: asignacion.orden || "0",
        numeroOrden: asignacion.orden || "0",
        centroId: asignacion.data?.centerId || "0",
        estado: "ELIMINADA_RECREADA",
        mensaje: `Asignación recreada eliminada manualmente desde panel de administración`,
        fechaHistorico: new Date().toISOString(),
        timestamp: Date.now(),
        centroOriginal: asignacion.data?.centro || "Centro desconocido",
        centroAsignado: asignacion.data?.centro || "Centro desconocido"
      };
      
      const historialRef = doc(collection(db, "historialSolicitudes"));
      batch.set(historialRef, historialData);
      
      // Registrar en elementos borrados
      const elementosBorradosRef = doc(collection(db, "elementosBorrados"));
      batch.set(elementosBorradosRef, {
        tipo: "asignacion",
        itemId: asignacion.asignacionId || "",
        orden: asignacion.orden || 0,
        eliminadoEn: serverTimestamp(),
        eliminadoPorAdmin: true
      });
      
      // Ejecutar todas las operaciones
      await batch.commit();
      
      // Recargar datos
      await cargarAsignacionesRecreadas();
      await cargarDatosDesdeFirebase();
      
      showNotification(`Asignación recreada eliminada correctamente`, "success");
    } catch (error) {
      console.error("Error al eliminar asignación recreada:", error);
      showNotification(`Error: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };
  
  // Función para eliminar todas las asignaciones recreadas
  const eliminarTodasAsignacionesRecreadas = async () => {
    if (!asignacionesRecreadas.length) {
      showNotification("No hay asignaciones recreadas para eliminar", "info");
      return;
    }
    
    if (!window.confirm(`¿Está seguro de que desea eliminar TODAS las ${asignacionesRecreadas.length} asignaciones recreadas? Esta acción no se puede deshacer.`)) {
      return;
    }
    
    try {
      setInternalProcessingMessage("Eliminando todas las asignaciones recreadas...");
      
      // Crear un batch para operaciones masivas
      const batch = writeBatch(db);
      let contadorEliminadas = 0;
      
      // Preparar la eliminación de todas las asignaciones recreadas
      for (const asignacion of asignacionesRecreadas) {
        if (!asignacion || !asignacion.id || !asignacion.asignacionId) continue;
        
        // Marcar como eliminada en la colección de recreadas
        batch.update(doc(db, "asignacionesRecreadas", asignacion.id), {
          eliminada: true,
          fechaEliminacion: serverTimestamp()
        });
        
        // Eliminar la asignación de la colección principal
        batch.delete(doc(db, "asignaciones", String(asignacion.asignacionId)));
        
        // Registrar en el historial y elementos borrados
        const historialData = {
          orden: asignacion.orden || "0",
          numeroOrden: asignacion.orden || "0",
          centroId: asignacion.data?.centerId || "0",
          estado: "ELIMINADA_RECREADA",
          mensaje: `Asignación recreada eliminada masivamente desde panel de administración`,
          fechaHistorico: new Date().toISOString(),
          timestamp: Date.now(),
          centroOriginal: asignacion.data?.centro || "Centro desconocido",
          centroAsignado: asignacion.data?.centro || "Centro desconocido"
        };
        
        const historialRef = doc(collection(db, "historialSolicitudes"));
        batch.set(historialRef, historialData);
        
        // Registrar en elementos borrados
        const elementosBorradosRef = doc(collection(db, "elementosBorrados"));
        batch.set(elementosBorradosRef, {
          tipo: "asignacion",
          itemId: asignacion.asignacionId || "",
          orden: asignacion.orden || 0,
          eliminadoEn: serverTimestamp(),
          eliminadoPorAdmin: true
        });
        
        contadorEliminadas++;
      }
      
      // Ejecutar todas las operaciones
      await batch.commit();
      
      // Recargar datos
      await cargarAsignacionesRecreadas();
      await cargarDatosDesdeFirebase();
      
      showNotification(`${contadorEliminadas} asignaciones recreadas eliminadas correctamente`, "success");
    } catch (error) {
      console.error("Error al eliminar todas las asignaciones recreadas:", error);
      showNotification(`Error: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };
  
  // Función para renderizar la sección de asignaciones recreadas
  const renderAsignacionesRecreadas = () => {
    return (
      <div style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Asignaciones Recreadas Detectadas</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={detectarAsignacionesRecreadas}
              style={{
                backgroundColor: '#27ae60',
                color: 'white',
                border: 'none',
                padding: '8px 15px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Detectar Recreadas
            </button>
            <button
              onClick={cargarAsignacionesRecreadas}
              style={{
                backgroundColor: '#3498db',
                color: 'white',
                border: 'none',
                padding: '8px 15px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Actualizar Lista
            </button>
            {asignacionesRecreadas.length > 0 && (
              <button
                onClick={eliminarTodasAsignacionesRecreadas}
                style={{
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  padding: '8px 15px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Eliminar Todas ({asignacionesRecreadas.length})
              </button>
            )}
          </div>
        </div>
        
        {loadingAsignacionesRecreadas ? (
          <p>Cargando asignaciones recreadas...</p>
        ) : asignacionesRecreadas.length === 0 ? (
          <p>No hay asignaciones recreadas pendientes de eliminar.</p>
        ) : (
          <>
            <p style={{ marginBottom: '15px' }}>
              Las siguientes asignaciones han sido detectadas como recreadas. Estas son asignaciones que fueron eliminadas previamente pero han vuelto a aparecer.
            </p>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f2f2f2' }}>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Orden</th>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Centro</th>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Fecha Detección</th>
                    <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #ddd' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {asignacionesRecreadas.map((asignacion, index) => {
                    // Asegurarnos de tener claves realmente únicas
                    const uniqueKey = asignacion.id 
                      ? `recreada-${asignacion.id}-${index}` 
                      : `recreada-${index}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                    
                    return (
                      <tr key={uniqueKey} style={{ borderBottom: '1px solid #ddd' }}>
                        <td style={{ padding: '10px', border: '1px solid #ddd' }}>{asignacion.orden}</td>
                        <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                          {asignacion.data?.centro || asignacion.data?.centerName || "Centro desconocido"}
                        </td>
                        <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                          {asignacion.fechaDeteccion?.toLocaleString() || "Fecha desconocida"}
                        </td>
                        <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                          <button
                            onClick={() => eliminarAsignacionRecreada(asignacion)}
                            style={{
                              backgroundColor: '#e74c3c',
                              color: 'white',
                              border: 'none',
                              padding: '5px 10px',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  };
  
  // Función para recargar todos los datos forzando una actualización completa
  const recargarDatosCompletos = async () => {
    try {
      setInternalProcessingMessage("Recargando datos completamente...");
      // Primero llamamos a cargarDatosDesdeFirebase para actualizar las colecciones en memoria
      await cargarDatosDesdeFirebase();
      
      // Forzar la actualización del estado reasignado en todas las asignaciones
      const asignacionesActualizadas = assignments.map(asignacion => {
        if (asignacion.estado === 'REASIGNADO' && !asignacion.reasignado) {
          return { ...asignacion, reasignado: true };
        }
        return asignacion;
      });
      
      // Actualizar el Dashboard con datos frescos
      console.log(`Datos recargados completamente: ${asignacionesActualizadas.length} asignaciones, ${asignacionesActualizadas.filter(a => a.reasignado).length} reasignadas`);
      
      showNotification("Datos recargados completamente", "success");
    } catch (error) {
      console.error("Error al recargar datos completos:", error);
      showNotification(`Error al recargar datos: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };
  
  // Función para publicar la notificación global
  const handlePublishNotification = async () => {
    try {
      setInternalProcessingMessage("Publicando notificación...");
      const configDocRef = doc(db, 'config', 'general');
      await setDoc(configDocRef, { notificationText: notificationText }, { merge: true });
      showNotification("Notificación publicada correctamente", "success");
    } catch (error) {
      console.error("Error al publicar notificación:", error);
      showNotification(`Error al publicar notificación: ${error.message}`, "error");
    } finally {
      setInternalProcessingMessage("");
    }
  };

  // Función para eliminar la notificación global
  const handleDeleteNotification = async () => {
    if (window.confirm("¿Está seguro de que desea eliminar la notificación actual?")) {
      try {
        setInternalProcessingMessage("Eliminando notificación...");
        const configDocRef = doc(db, 'config', 'general');
        await setDoc(configDocRef, { notificationText: '' }, { merge: true });
        setNotificationText(''); // Limpiar estado local también
        showNotification("Notificación eliminada correctamente", "success");
      } catch (error) {
        console.error("Error al eliminar notificación:", error);
        showNotification(`Error al eliminar notificación: ${error.message}`, "error");
      } finally {
        setInternalProcessingMessage("");
      }
    }
  };

  // Renderizar el panel de notificaciones
  const renderNotificationPanel = () => {
    return (
      <div style={{
        backgroundColor: 'white',
        borderRadius: '10px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        marginTop: '30px'
      }}>
        <h3 style={{ marginBottom: '15px', color: '#2c3e50' }}>Notificación Global</h3>
        <p style={{ marginBottom: '15px', fontSize: '14px', color: '#666' }}>
          El texto introducido aquí se mostrará como un aviso en la parte superior del Dashboard para todos los usuarios.
        </p>
        <textarea
          value={notificationText}
          onChange={(e) => setNotificationText(e.target.value)}
          placeholder="Escribe aquí la notificación... (deja vacío para no mostrar nada)"
          style={{
            width: '100%',
            minHeight: '100px',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            marginBottom: '15px',
            fontSize: '14px'
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button
            onClick={handleDeleteNotification}
            style={{
              padding: '10px 20px',
              backgroundColor: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
            disabled={internalProcessingMessage !== ''}
          >
            {internalProcessingMessage === 'Eliminando notificación...' ? 'Eliminando...' : 'Eliminar Notificación'}
          </button>
          <button
            onClick={handlePublishNotification}
            style={{
              padding: '10px 20px',
              backgroundColor: '#2ecc71',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer'
            }}
            disabled={internalProcessingMessage !== ''}
          >
            {internalProcessingMessage === 'Publicando notificación...' ? 'Publicando...' : 'Publicar Notificación'}
          </button>
        </div>
      </div>
    );
  };

  // Actualizar el return principal para incluir el nuevo tab
  return !isAdminAuthenticated ? (
    renderLoginForm()
  ) : (
    <div style={{maxWidth: '1280px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif'}}>
      <h1 style={{marginBottom: '30px', color: '#2c3e50'}}>Panel de Administración</h1>
      
      {internalProcessingMessage && (
        <div style={{marginBottom: '20px', padding: '15px', backgroundColor: '#fffde7', borderLeft: '5px solid #fbc02d'}}>
          <strong>Procesando: </strong> {internalProcessingMessage}
        </div>
      )}
      
      <div style={{marginBottom: '30px'}}>
        <button 
          onClick={() => setActiveTab('solicitudes')}
          style={{
            ...tabButtonStyle,
            backgroundColor: activeTab === 'solicitudes' ? '#2980b9' : '#3498db'
          }}
        >
          Solicitudes Pendientes
        </button>
        <button 
          onClick={() => setActiveTab('asignaciones')}
          style={{
            ...tabButtonStyle,
            backgroundColor: activeTab === 'asignaciones' ? '#2980b9' : '#3498db'
          }}
        >
          Asignaciones / Plazas
        </button>
        <button 
          onClick={() => {setActiveTab('feedback'); setShowFeedback(true);}}
          style={{
            ...tabButtonStyle,
            backgroundColor: activeTab === 'feedback' ? '#2980b9' : '#3498db'
          }}
        >
          Feedback
        </button>
        <button 
          onClick={() => setActiveTab('recreadas')}
          style={{
            ...tabButtonStyle,
            backgroundColor: activeTab === 'recreadas' ? '#2980b9' : '#3498db'
          }}
        >
          Asig. Recreadas
        </button>
        <button 
          onClick={() => setActiveTab('notificaciones')}
          style={{
            ...tabButtonStyle,
            backgroundColor: activeTab === 'notificaciones' ? '#2980b9' : '#3498db'
          }}
        >
          Notificaciones
        </button>
      </div>
      
      {activeTab === 'solicitudes' && (
        <>
          {renderAccionesRapidas()}
          {renderSolicitudesPendientes()}
        </>
      )}
      {activeTab === 'asignaciones' && (
        <>
          {renderResumenPlazasDisponibles()}
          {renderAsignacionesExistentes()}
        </>
      )}
      {activeTab === 'feedback' && renderFeedbackSection()}
      {activeTab === 'recreadas' && renderAsignacionesRecreadas()}
      {activeTab === 'notificaciones' && renderNotificationPanel()} { /* Añadir renderizado del nuevo panel */ }
      
      {showAsignacionManualModal && renderModalAsignacionManual()}
      {showReasignacionModal && renderModalReasignacion()}
      
      <button 
        onClick={() => {
          window.location.href = '/';
        }}
        style={{
          display: 'block',
          marginTop: '30px',
          padding: '10px 20px',
          backgroundColor: '#34495e',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer'
        }}
      >
        Volver a página principal
      </button>
    </div>
  );
}

export default Admin; 