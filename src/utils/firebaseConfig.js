// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  enableIndexedDbPersistence, 
  CACHE_SIZE_UNLIMITED,
  collection,
  doc,
  setDoc,
  deleteDoc
} from "firebase/firestore";
// import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyDo7X1BLIW1hNYQpJLZcDws_L4aGHJWXOQ",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "asignacion-plazas.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "asignacion-plazas",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "asignacion-plazas.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "525955676079",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:525955676079:web:a7e0b00391e75c902fe15a",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-E0DLWYPVKP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Comentar analytics para evitar errores en entorno de producción
// const analytics = getAnalytics(app);

// Configuración mejorada para Firestore
const db = getFirestore(app);

// Configurar parámetros adicionales para mejorar la estabilidad
const firestoreSettings = {
  cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  ignoreUndefinedProperties: true, // Ignora propiedades undefined al guardar documentos
};

// Habilitar persistencia para que funcione offline
try {
  enableIndexedDbPersistence(db)
    .then(() => {
      console.log("Persistencia offline habilitada correctamente");
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('La persistencia falló: múltiples pestañas abiertas');
      } else if (err.code === 'unimplemented') {
        console.warn('El navegador no soporta persistencia');
      } else {
        console.error('Error al configurar persistencia:', err);
      }
    });
} catch (error) {
  console.warn('Error al configurar persistencia:', error);
}

// Función para verificar la conexión a Firestore
export const verificarConexion = async () => {
  try {
    const testCollection = collection(db, "test_connection");
    const testDocRef = doc(testCollection);
    await setDoc(testDocRef, { timestamp: Date.now() });
    await deleteDoc(testDocRef);
    return { success: true };
  } catch (error) {
    console.error("Error de conexión con Firebase:", error);
    return { success: false, error };
  }
};

export { db, app }; 