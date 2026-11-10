import { colorPorEvento } from '../../utils/eventos';

export default function DetalleCluster({
  cluster, enfermedadesCluster,
  eventoSeleccionado, onToggleEvento, onCerrar, onAbrirModalRadios,
}) {
  return (
    <div style={{ background: '#eef2ff', border: '1px solid #6366f1',
                  borderRadius: 6, padding: 10, margin: '2px 0 10px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ fontSize: 12 }}>Detalle cluster {cluster.cluster_id}</b>
        <button onClick={onCerrar}
          style={{ border: 'none', background: 'transparent',
                   cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
      </div>
      <p style={{ fontSize: 11, margin: '4px 0' }}>
        <b>{cluster.n_casos} casos</b> en {cluster.n_radios} radios · {cluster.n_eventos} evento(s)
      </p>

      <button 
        onClick={onAbrirModalRadios}
        style={{ width: '100%', margin: '8px 0', padding: '6px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 'bold' }}
      >
        Ver información de radios y casos
      </button>

      {enfermedadesCluster.length > 0 && (
        <>
          <h5 style={{ margin: '8px 0 3px', fontSize: 11 }}>Enfermedades</h5>
          {enfermedadesCluster.map(({ evento, casos: n }) => {
            const activo = eventoSeleccionado === evento;
            return (
              <div key={evento} onClick={() => onToggleEvento(evento)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10,
                         cursor: 'pointer', padding: '1px 3px', borderRadius: 4,
                         background: activo ? '#c7d2fe' : 'transparent',
                         fontWeight: activo ? 'bold' : 'normal' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%',
                               background: colorPorEvento(evento),
                               border: '1px solid #111827' }} />
                <span style={{ flex: 1 }}>{evento}</span><b>{n}</b>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}