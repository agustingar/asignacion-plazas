// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
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
// const analytics = getAnalytics(app);
const db = getFirestore(app);

// Obtener instancia de Auth
const auth = getAuth(app);

// Habilitar persistencia para que funcione offline
try {
  enableIndexedDbPersistence(db)
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        // console.warn('La persistencia falló: múltiples pestañas abiertas');
      } else if (err.code === 'unimplemented') {
        // console.warn('El navegador no soporta persistencia');
      }
    });
} catch (error) {
  // console.warn('Error al configurar persistencia:', error);
}

export { db, app, auth }; 