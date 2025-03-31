// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDo7X1BLIW1hNYQpJLZcDws_L4aGHJWXOQ",
  authDomain: "asignacion-plazas.firebaseapp.com",
  projectId: "asignacion-plazas",
  storageBucket: "asignacion-plazas.firebasestorage.app",
  messagingSenderId: "525955676079",
  appId: "1:525955676079:web:a7e0b00391e75c902fe15a",
  measurementId: "G-E0DLWYPVKP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Inicializar analytics solo si estamos en un navegador y no en modo servidor
let analytics = null;
try {
  if (typeof window !== 'undefined') {
    analytics = getAnalytics(app);
  }
} catch (error) {
  console.error("Error al inicializar analytics:", error);
}

const db = getFirestore(app);

// Habilitar persistencia para que funcione offline
try {
  enableIndexedDbPersistence(db)
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('La persistencia falló: múltiples pestañas abiertas');
      } else if (err.code === 'unimplemented') {
        console.warn('El navegador no soporta persistencia');
      } else {
        console.error('Error al habilitar persistencia:', err);
      }
    });
} catch (error) {
  console.error("Error al configurar persistencia:", error);
}

export { db }; 