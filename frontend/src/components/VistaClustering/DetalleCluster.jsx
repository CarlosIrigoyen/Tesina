import { formatoPct } from './constants';
import { colorPorEvento } from '../../utils/eventos';

const th = { padding: 3, textAlign: 'left' };
const td = { padding: 3 };

export default function DetalleCluster({
  cluster, casos, radios, enfermedadesCluster,
  eventoSeleccionado, onToggleEvento, onSeleccionarRadio, onCerrar,
}) {
  const casosFiltrados = eventoSeleccionado
    ? casos.filter((c) => c.evento === eventoSeleccionado)
    : casos;

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

      {radios.length > 0 && (
        <>
          <h5 style={{ margin: '8px 0 3px', fontSize: 11 }}>Radios</h5>
          <div style={{ maxHeight: 140, overflowY: 'auto' }}>
            <table style={{ width: '100%', fontSize: 10, background: 'white', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#1e293b', color: 'white' }}>
                <tr><th style={th}>Radio</th><th style={th}>Casos</th><th style={th}>Índice</th></tr>
              </thead>
              <tbody>
                {radios.map((r) => {
                  const link = r.link ?? r.radio_censal_id;
                  return (
                    <tr key={link} onClick={() => onSeleccionarRadio(r)}
                      style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                      <td style={td}>{link}</td>
                      <td style={{ ...td, fontWeight: 'bold' }}>{r.casos}</td>
                      <td style={td}>{formatoPct(r.indice_compuesto)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h5 style={{ margin: '8px 0 3px', fontSize: 11 }}>Casos ({casosFiltrados.length})</h5>
      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
        <table style={{ width: '100%', fontSize: 10, background: 'white', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#1e293b', color: 'white' }}>
            <tr><th style={th}>ID</th><th style={th}>Evento</th><th style={th}>Sem</th><th style={th}>Año</th></tr>
          </thead>
          <tbody>
            {casosFiltrados.map((c, i) => (
              <tr key={c.id_caso} style={{ background: i % 2 ? '#f8fafc' : 'white' }}>
                <td style={td}>{c.id_caso}</td><td style={td}>{c.evento}</td>
                <td style={td}>{c.semana_epidemiologica}</td><td style={td}>{c.anio_epidemiologico}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}