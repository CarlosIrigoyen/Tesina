import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts';

/**
 * Panel de análisis temporal de casos:
 * - Reproducción de la animación por año/semana epidemiológica.
 * - Gráfico de casos por semana con umbral de picos.
 * - Lista de picos detectados para saltar a esa semana.
 */
export default function PanelTemporal({
  serie,
  picos,
  umbral,
  media,
  frameActual,
  onFrameChange,
  playing,
  onTogglePlaying,
  velocidad,
  onVelocidadChange,
  onClose
}) {
  const frame = serie[frameActual];

  const clavesPicos = useMemo(
    () => new Set((picos || []).map(p => p.key)),
    [picos]
  );

  const datosGrafico = useMemo(
    () => serie.map(d => ({ ...d, esPico: clavesPicos.has(d.key) })),
    [serie, clavesPicos]
  );

  const intervaloEtiquetas = serie.length > 12
    ? Math.max(1, Math.ceil(serie.length / 8) - 1)
    : 0;

  return (
    <div style={{
      position: 'absolute',
      top: 20,
      left: 20,
      width: 'min(380px, calc(100vw - 40px))',
      maxHeight: 'calc(100% - 40px)',
      overflowY: 'auto',
      background: 'rgba(255,255,255,0.98)',
      borderRadius: 10,
      boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
      zIndex: 1000,
      padding: 14,
      fontSize: 12,
      color: '#0f172a'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Evolución temporal</h4>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            {serie.length} semanas con casos · {serie.reduce((a, d) => a + d.casos, 0)} casos
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar panel temporal"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.35rem', lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: 8,
        background: '#f1f5f9',
        borderRadius: 8,
        marginBottom: 10
      }}>
        <button
          onClick={onTogglePlaying}
          disabled={serie.length < 2}
          style={{
            background: serie.length < 2 ? '#94a3b8' : '#2563eb',
            color: 'white',
            border: 'none',
            padding: '5px 10px',
            borderRadius: 4,
            cursor: serie.length < 2 ? 'default' : 'pointer',
            fontWeight: 'bold',
            fontSize: 12
          }}
        >
          {playing ? '⏸ Pausar' : '▶ Reproducir'}
        </button>

        <span style={{ fontFamily: 'monospace', minWidth: 80 }}>
          {frame ? frame.label : 'Sin datos'}
        </span>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          Velocidad
          <select
            value={velocidad}
            onChange={e => onVelocidadChange(Number(e.target.value))}
            style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid #cbd5e1' }}
          >
            <option value={1200}>Lenta</option>
            <option value={700}>Normal</option>
            <option value={350}>Rápida</option>
            <option value={150}>Muy rápida</option>
          </select>
        </label>
      </div>

      <input
        type="range"
        min={0}
        max={Math.max(0, serie.length - 1)}
        value={frameActual}
        onChange={e => onFrameChange(Number(e.target.value))}
        disabled={serie.length < 2}
        style={{ width: '100%', marginBottom: 10 }}
      />

      <div style={{ height: 180, marginBottom: 10 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datosGrafico} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9 }}
              interval={intervaloEtiquetas}
              angle={-35}
              textAnchor="end"
              height={46}
            />
            <YAxis tick={{ fontSize: 10 }} width={32} allowDecimals={false} />
            <Tooltip
              formatter={(valor) => [`${valor} casos`, 'Casos']}
              labelFormatter={label => `Semana ${label}`}
            />
            <ReferenceLine
              y={umbral}
              stroke="#d97706"
              strokeDasharray="4 4"
              label={{ value: 'umbral', fontSize: 9, fill: '#b45309', position: 'insideTopRight' }}
            />
            <Bar dataKey="casos" radius={[2, 2, 0, 0]}>
              {datosGrafico.map(d => (
                <Cell key={d.key} fill={d.esPico ? '#dc2626' : '#3b82f6'} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
        Media semanal: <b>{media?.toFixed(1)}</b> · Umbral de pico: <b>{umbral?.toFixed(1)}</b>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h5 style={{ margin: 0, fontSize: 12 }}>Picos detectados ({picos.length})</h5>
        {picos.length > 0 && <span style={{ fontSize: 9, color: '#dc2626' }}>barras rojas</span>}
      </div>

      {picos.length === 0 ? (
        <p style={{ margin: '4px 0', fontSize: 11, color: '#64748b' }}>
          No se detectaron picos con el filtro actual. Probá quitar el filtro de año/semana.
        </p>
      ) : (
        <div style={{ maxHeight: 170, overflowY: 'auto' }}>
          {picos.map(p => (
            <div
              key={p.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '5px 0',
                borderBottom: '1px solid #f1f5f9'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold' }}>{p.label}</div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  {p.casos} casos · z = {p.zScore.toFixed(1)}
                </div>
              </div>
              <button
                onClick={() => onFrameChange(serie.findIndex(d => d.key === p.key))}
                style={{
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '3px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 10
                }}
              >
                Ver
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
