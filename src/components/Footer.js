import React, { useState } from 'react';
import FeedbackForm from './FeedbackForm';

/**
 * Componente de pie de página
 * @returns {JSX.Element} - Componente Footer
 */
function Footer() {
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);

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
      <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <img 
            src={process.env.PUBLIC_URL + '/AG_LOGO.png'} 
            alt="AG-Marketing Logo" 
            style={{ 
              height: '100px',
              width: 'auto'
            }}
          />
          <p style={{ margin: '0' }}>
            Realizado por <a href="https://ag-marketing.es" target="_blank" rel="noopener noreferrer" style={{color: '#18539E', textDecoration: 'none', fontWeight: 'bold'}}>AG-Marketing</a>
          </p>
        </div>
        
        <div style={{ marginTop: '10px', marginBottom: '10px' }}>
          <a href="mailto:info@ag-marketing.es" style={{color: '#18539E', textDecoration: 'none', marginRight: '20px'}}>
            info@ag-marketing.es
          </a>
          <button 
            onClick={() => setShowFeedbackForm(true)}
            style={{
              backgroundColor: '#18539E',
              color: 'white',
              border: 'none',
              padding: '8px 15px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ¿Necesitas modificaciones en tu solicitud?
          </button>
        </div>

        <p style={{ margin: '10px 0' }}>© {new Date().getFullYear()} - Todos los derechos reservados</p>
      </div>

      {showFeedbackForm && (
        <FeedbackForm onClose={() => setShowFeedbackForm(false)} />
      )}
    </footer>
  );
}

export default Footer; 