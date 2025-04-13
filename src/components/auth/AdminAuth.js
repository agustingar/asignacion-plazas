import React, { useState } from 'react';

/**
 * Componente para manejar la autenticación del administrador
 * @param {Object} props - Propiedades del componente
 * @param {Function} props.onAuthenticate - Función a llamar cuando la autenticación es exitosa
 * @returns {JSX.Element} Formulario de autenticación
 */
const AdminAuth = ({ onAuthenticate }) => {
  const [adminPassword, setAdminPassword] = useState('');
  const [adminAuthAttempted, setAdminAuthAttempted] = useState(false);
  const [passwordError, setPasswordError] = useState(false);

  const handleAuthentication = () => {
    if (adminPassword === 'SoyAdmin') {
      onAuthenticate(true);
      setAdminPassword('');
      setPasswordError(false);
    } else {
      setAdminAuthAttempted(true);
      setPasswordError(true);
      setTimeout(() => setPasswordError(false), 3000);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#f5f6fa'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '30px',
        borderRadius: '10px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px'
      }}>
        <h2 style={{ 
          textAlign: 'center', 
          color: '#2c3e50',
          marginBottom: '30px'
        }}>
          Acceso Administrador
        </h2>

        {adminAuthAttempted && passwordError && (
          <div style={{
            backgroundColor: '#ffebee',
            color: '#c62828',
            padding: '10px',
            borderRadius: '5px',
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            Contraseña incorrecta. Por favor, intente nuevamente.
          </div>
        )}

        <div style={{ marginBottom: '20px' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: 'bold',
            color: '#34495e'
          }}>
            Contraseña de Administrador:
          </label>
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAuthentication();
              }
            }}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              fontSize: '16px'
            }}
            placeholder="Ingrese la contraseña"
          />
        </div>

        <button
          onClick={handleAuthentication}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'background-color 0.3s'
          }}
        >
          Acceder
        </button>

        <div style={{ 
          marginTop: '20px', 
          textAlign: 'center' 
        }}>
          <a 
            href="/"
            style={{
              color: '#3498db',
              textDecoration: 'none'
            }}
          >
            Volver al Dashboard
          </a>
        </div>
      </div>
    </div>
  );
};

export default AdminAuth; 