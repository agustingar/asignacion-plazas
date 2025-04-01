import React, { useState, useEffect } from 'react';
import './DashboardInfo.css';

const DashboardInfo = ({ plazasDisponibles, plazasTotal, onRecalcular, isRecalculando }) => {
  const [lastUpdate, setLastUpdate] = useState(null);
  const [timer, setTimer] = useState(45);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    // Función para actualizar la hora actual
    const updateTime = () => {
      const now = new Date();
      setLastUpdate(now.toLocaleTimeString());
      setTimer(30);
      startCountdown(30);
    };

    // Función para hacer la cuenta regresiva
    const startCountdown = (seconds) => {
      setUpdating(true);
      let timeLeft = seconds;
      
      const intervalId = setInterval(() => {
        timeLeft -= 1;
        setTimer(timeLeft);
        
        if (timeLeft <= 0) {
          clearInterval(intervalId);
          updateTime();
        }
      }, 1000);
      
      return () => clearInterval(intervalId);
    };

    // Iniciar la primera cuenta regresiva de 45 segundos
    const cleanupCountdown = startCountdown(45);
    
    return cleanupCountdown;
  }, []);

  const handleRecalcular = () => {
    if (onRecalcular) {
      onRecalcular();
    }
  };

  return (
    <div className="card-container">
      <div className="info-left">
        <span className="label">Plazas disponibles:</span>
        <span className="plazas">{plazasDisponibles} de {plazasTotal}</span>
        <button 
          className="btn-recalcular" 
          onClick={handleRecalcular}
          disabled={isRecalculando}
        >
          {isRecalculando ? 'Recalculando...' : 'Recalcular contadores'}
        </button>
      </div>
      <div className="info-right">
        <span className="label">Última actualización:</span>
        <span className="update-status">
          {lastUpdate ? lastUpdate : 'No disponible'}
        </span>
        {updating && (
          <span className="update-info">
            <span className="pulse-indicator"></span>
            <span>Actualizando pronto...</span>
            <span className="update-timer">{timer}s</span>
          </span>
        )}
      </div>
    </div>
  );
};

export default DashboardInfo; 