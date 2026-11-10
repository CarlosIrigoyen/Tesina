import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import SeccionColapsable from './SeccionColapsable';

export default function TarjetasResultado({ exploracion, clustering }) {
  return (
    <>
      {exploracion && (
        <SeccionColapsable titulo="Exploración OPTICS">
          <p style={{ fontSize: 13 }}><b>eps sugerido:</b> {exploracion.eps_espacial_sugerido_km} km</p>
          <p style={{ fontSize: 13 }}><b>min_samples:</b> {exploracion.min_samples_sugerido}</p>
          <p style={{ fontSize: 13 }}><b>Tiempo:</b> {exploracion.tiempo_ms?.toFixed(0)} ms</p>
          <div style={{ height: 140, marginTop: 8 }}>
            <ResponsiveContainer>
              <LineChart data={exploracion.reachability_plot.filter((p) => p.valor_km !== null)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="indice" /><YAxis /><Tooltip />
                <Line dataKey="valor_km" stroke="#7c3aed" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SeccionColapsable>
      )}

      {clustering && (
        <SeccionColapsable titulo="Resultado ST-DBSCAN" border="2px solid #7c3aed">
          <p style={{ fontSize: 13 }}><b>Clusters:</b> {clustering.n_clusters ?? '—'}</p>
          <p style={{ fontSize: 13 }}><b>Ruido:</b> {clustering.n_ruido ?? '—'} ({Number(clustering.pct_ruido ?? 0).toFixed(1)}%)</p>
          <p style={{ fontSize: 13 }}><b>Tiempo:</b> {Number(clustering.tiempo_ms ?? 0).toFixed(0)} ms</p>
          {clustering.params && (
            <p style={{ fontSize: 11, color: '#475569' }}>
              <b>Params:</b> {Object.entries(clustering.params).map(([k, v]) => `${k}=${v}`).join(' · ')}
            </p>
          )}
        </SeccionColapsable>
      )}
    </>
  );
}