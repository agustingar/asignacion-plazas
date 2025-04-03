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
        <div style={{
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <p style={{ margin: '10px 0' }}>
            Realizado por <a 
              href="https://ag-marketing.es" 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{
                color: '#18539E', 
                textDecoration: 'none', 
                fontWeight: 'bold'
              }}
            >
              AG-Marketing
            </a>
          </p>
          <img 
            src={`${process.env.PUBLIC_URL}/AG_LOGO.png`} 
            alt="AG-Marketing" 
            style={{ 
              width: '120px', 
              height: 'auto',
              objectFit: 'contain',
              maxHeight: '50px'
            }} 
          />
        </div>
        <p style={{ margin: '10px 0' }}>© {new Date().getFullYear()} - Todos los derechos reservados</p>
      </div>
    </footer>
  );
}

export default Footer; 