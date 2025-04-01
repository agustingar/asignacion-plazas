import React from 'react';

/**
 * Componente de pie de página
 * @returns {JSX.Element} - Componente Footer
 */
function Footer() {
  return (
    <div style={{
      marginTop: '40px',
      marginBottom: '20px',
      padding: '15px',
      borderTop: '1px solid #eee',
      textAlign: 'center',
      color: '#666',
      fontSize: '14px'
    }}>
      <p>Realizado por <a href="https://ag-marketing.es" target="_blank" rel="noopener noreferrer" style={{color: '#18539E', textDecoration: 'none', fontWeight: 'bold'}}>AG-Marketing</a></p>
      <p>© {new Date().getFullYear()} - Todos los derechos reservados</p>
    </div>
  );
}

export default Footer; 