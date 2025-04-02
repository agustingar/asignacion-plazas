import React from 'react';

/**
 * Componente de pie de página
 * @returns {JSX.Element} - Componente Footer
 */
function Footer() {
  return (
    <footer style={{
      marginTop: '60px',
      padding: '20px 15px',
      borderTop: '1px solid #ddd',
      backgroundColor: '#f8f9fa',
      textAlign: 'center',
      color: '#333',
      fontSize: '14px',
      width: '100%',
      position: 'relative',
      display: 'block'
    }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        <p style={{ margin: '10px 0' }}>Realizado por <a href="https://ag-marketing.es" target="_blank" rel="noopener noreferrer" style={{color: '#18539E', textDecoration: 'none', fontWeight: 'bold'}}>AG-Marketing</a></p>
        <p style={{ margin: '10px 0' }}>© {new Date().getFullYear()} - Todos los derechos reservados</p>
      </div>
    </footer>
  );
}

export default Footer; 