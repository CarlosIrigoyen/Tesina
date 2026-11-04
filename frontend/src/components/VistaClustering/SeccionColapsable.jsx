import { useState } from 'react';

export default function SeccionColapsable({
  titulo, children, defaultOpen = true,
  border = '1px solid #e2e8f0', background = 'white', extra = null,
}) {
  const [abierta, setAbierta] = useState(defaultOpen);
  return (
    <div style={{ background, padding: 12, borderRadius: 8, marginBottom: 12, border }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 6,
            padding: 0, border: 'none', background: 'transparent',
            cursor: 'pointer', textAlign: 'left', fontWeight: 'bold',
            fontSize: 14, color: '#0f172a',
          }}
        >
          <span style={{ fontSize: 12, color: '#64748b' }}>{abierta ? '▾' : '▸'}</span>
          <span>{titulo}</span>
        </button>
        {extra}
      </div>
      {abierta && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}