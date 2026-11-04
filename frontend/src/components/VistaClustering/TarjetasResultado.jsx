import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
         Tooltip, BarChart, Bar, Legend } from 'recharts';
import SeccionColapsable from './SeccionColapsable';
import { COLORES_ALGORITMO } from './constants';

function TarjetaSimple({ titulo, resumen, params, color }) {
  return (
    <SeccionColapsable titulo={titulo} border={`2px solid ${color}`}>
      <p style={{ fontSize: 13 }}><b>Clusters:</b> {resumen?.n_clusters ?? '—'}</p>
      <p style={{ fontSize: 13 }}>
        <b>Ruido:</b> {resumen?.n_ruido ?? '—'} ({Number(resumen?.pct_ruido ?? 0).toFixed(1)}%)
      </p>
      <p style={{ fontSize: 13 }}>
        <b>Tiempo:</b> {Number(resumen?.tiempo_ms ?? 0).toFixed(0)} ms
      </p>
      {params && (
        <p style={{ fontSize: 11, color: '#475569' }}>
          <b>Params:</b> {Object.entries(params).map(([k, v]) => `${k}=${v}`).join(' · ')}
        </p>
      )}
    </SeccionColapsable>
  );
}

export default function TarjetasResultado({ exploracion, clustering, resStknn, satscanRes, comparativa }) {
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
        <TarjetaSimple titulo="Resultado ST-DBSCAN" resumen={clustering}
          params={clustering.params} color={COLORES_ALGORITMO['ST-DBSCAN']} />
      )}
      {resStknn && (
        <TarjetaSimple titulo="Resultado ST-kNN" resumen={resStknn}
          params={resStknn.params} color={COLORES_ALGORITMO['ST-kNN']} />
      )}
      {satscanRes && (
        <SeccionColapsable titulo="Resultado SaTScan-Poisson"
          border={`2px solid ${COLORES_ALGORITMO['SaTScan-Poisson']}`}>
          <p style={{ fontSize: 13 }}><b>Significativos:</b> {satscanRes.n_clusters_significativos}</p>
          <p style={{ fontSize: 13 }}><b>Tiempo:</b> {satscanRes.tiempo_ms?.toFixed(0)} ms</p>
          {(satscanRes.clusters || []).map((c, i) => (
            <div key={i} style={{ background: 'white', padding: 8, marginTop: 6,
                                  borderRadius: 6, fontSize: 11,
                                  borderLeft: `4px solid ${c.significativo ? '#dc2626' : '#facc15'}` }}>
              <b>Centro:</b> {c.radio_id_centro} · <b>Radio:</b> {c.radio_km} km<br />
              <b>Obs:</b> {c.casos_observados} · <b>Esp:</b> {c.casos_esperados}<br />
              <b>LLR:</b> {c.llr} · <b>p:</b> {c.p_value}
            </div>
          ))}
        </SeccionColapsable>
      )}
      {comparativa && (
        <SeccionColapsable titulo="Comparativa de Algoritmos" border="2px solid #ea580c">
          <p style={{ fontSize: 12, color: '#ea580c', fontWeight: 'bold' }}>{comparativa.recomendacion}</p>
          <div style={{ height: 180, marginTop: 8 }}>
            <ResponsiveContainer>
              <BarChart data={Object.entries(comparativa.comparativa_metricas).map(([alg, m]) => ({
                algoritmo: alg, clusters: m.n_clusters || 0, ruido_pct: m.pct_ruido || 0,
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="algoritmo" tick={{ fontSize: 9 }} />
                <YAxis /><Tooltip /><Legend />
                <Bar dataKey="clusters" fill="#7c3aed" name="N° Clusters" />
                <Bar dataKey="ruido_pct" fill="#dc2626" name="% Ruido" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SeccionColapsable>
      )}
    </>
  );
}