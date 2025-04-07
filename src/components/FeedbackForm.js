import React, { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

function FeedbackForm({ onClose }) {
  const [orderNumber, setOrderNumber] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      // Validar número de orden
      if (!orderNumber.trim()) {
        throw new Error('Por favor, introduce un número de orden');
      }
      // Validar feedback
      if (!feedback.trim()) {
        throw new Error('Por favor, describe las modificaciones necesarias');
      }

      // Guardar en Firestore
      await addDoc(collection(db, 'feedback'), {
        orderNumber: orderNumber.trim(),
        feedback: feedback.trim(),
        timestamp: new Date().toISOString(),
        status: 'pendiente'
      });

      setSuccess(true);
      setOrderNumber('');
      setFeedback('');
      
      // Cerrar el modal después de 2 segundos
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (error) {
      setError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalStyle = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    maxWidth: '500px',
    width: '90%',
    zIndex: 1000
  };

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 999
  };

  const inputStyle = {
    width: '100%',
    padding: '8px',
    marginBottom: '15px',
    border: '1px solid #ddd',
    borderRadius: '4px'
  };

  const buttonStyle = {
    padding: '10px 20px',
    backgroundColor: '#18539E',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginRight: '10px'
  };

  return (
    <>
      <div style={overlayStyle} onClick={onClose} />
      <div style={modalStyle}>
        <h2 style={{ marginBottom: '20px' }}>¿Necesitas modificaciones en tu solicitud?</h2>
        
        {success ? (
          <div style={{ color: 'green', marginBottom: '20px' }}>
            ¡Gracias! Tu solicitud ha sido enviada correctamente.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="orderNumber" style={{ display: 'block', marginBottom: '5px' }}>
                Número de Orden:
              </label>
              <input
                type="text"
                id="orderNumber"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                style={inputStyle}
                disabled={isSubmitting}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label htmlFor="feedback" style={{ display: 'block', marginBottom: '5px' }}>
                Describe las modificaciones necesarias:
              </label>
              <textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                style={{ ...inputStyle, height: '100px', resize: 'vertical' }}
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div style={{ color: 'red', marginBottom: '15px' }}>
                {error}
              </div>
            )}

            <div>
              <button 
                type="submit" 
                style={buttonStyle}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Enviando...' : 'Enviar'}
              </button>
              <button 
                type="button" 
                onClick={onClose}
                style={{ ...buttonStyle, backgroundColor: '#6c757d' }}
                disabled={isSubmitting}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

export default FeedbackForm; 