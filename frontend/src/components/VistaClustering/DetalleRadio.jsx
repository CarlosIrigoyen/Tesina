import { Fragment } from 'react';
import SeccionColapsable from './SeccionColapsable';
import { ETIQUETAS_INDICES, formatoPct } from './constants';

export default function DetalleRadio({ radio, onCerrar }) {
  return (
    <SeccionColapsable
      titulo={`Radio ${radio.link ?? radio.radio_censal_id}`}
      border="2px solid #0ea5e9"
      background="#f0f9ff"
      extra={<button onClick={onCerrar}
        style={{ border: 'none', background: 'transparent',
                 cursor: 'pointer', fontSize: '1.2rem' }}>×</button>}
    >
      <p style={{ fontSize: 11, margin: '4px 0' }}>
        <b>Localidad:</b> {radio.localidad || '—'} · <b>Casos:</b> {radio.casos ?? 0}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto',
                    gap: '3px 10px', fontSize: 10 }}>
        {ETIQUETAS_INDICES.map(([clave, etiqueta]) => (
          <Fragment key={clave}>
            <span style={{ color: '#475569' }}>{etiqueta}</span>
            <b style={{ textAlign: 'right' }}>{formatoPct(radio[clave])}</b>
          </Fragment>
        ))}
      </div>
    </SeccionColapsable>
  );
}