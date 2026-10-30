import { useState } from 'react';
import { colorPorEvento } from '../utils/eventos';

export default function LeyendaEnfermedades({ eventos, style }) {
  const [abierta, setAbierta] = useState(true);

  if (!eventos || eventos.length === 0) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      right: 20,
      background: 'white',
      padding: '10px 12px',
      borderRadius: 8,
      boxShadow: '0 0 10px rgba(0,0,0,0.3)',
      zIndex: 1000,
      fontSize: '0.78rem',
      maxWidth: 260,
      maxHeight: abierta ? '40vh' : 'none',
      overflowY: abierta ? 'auto' : 'hidden',
      ...style
    }}>
      <button
        onClick={() => setAbierta(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          width: '100%',
          padding: 0,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '0.85rem',
          color: '#0f172a',
          textAlign: 'left'
        }}
      >
        <span>Enfermedades ({eventos.length})</span>
        <span>{abierta ? '▾' : '▸'}</span>
      </button>
      {abierta && (
        <div style={{ marginTop: 8 }}>
          {eventos.map(evento => (
            <div key={evento} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
              <span style={{
                width: 11,
                height: 11,
                borderRadius: '50%',
                background: colorPorEvento(evento),
                border: '1px solid #111827',
                flexShrink: 0
              }} />
              <span>{evento}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
