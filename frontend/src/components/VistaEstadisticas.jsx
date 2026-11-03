import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  LabelList
} from 'recharts';
import { colorPorEvento } from '../utils/eventos';

const API = 'http://localhost:8000/api/v1/experimentos';

const COLORES_ANIO = ['#2563eb', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

const nf = new Intl.NumberFormat('es-AR');

const fmt = (v, dec = 0) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  return Number(v).toLocaleString('es-AR', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  });
};

const fmtPct = (v, dec = 1) => {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  return `${n > 0 ? '+' : ''}${n.toFixed(dec)}%`;
};

function Tarjeta({ titulo, valor, detalle, color = '#2563eb', fondo = 'white' }) {
  return (
    <div
      style={{
        background: fondo,
        border: '1px solid #e2e8f0',
        borderTop: `4px solid ${color}`,
        borderRadius: 10,
        padding: '12px 14px',
        minWidth: 0
      }}
    >
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {titulo}
      </div>
      <div style={{ fontSize: '1.45rem', fontWeight: 700, color: '#0f172a', marginTop: 4, lineHeight: 1.2 }}>
        {valor}
      </div>
      {detalle && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{detalle}</div>}
    </div>
  );
}

function Seccion({ titulo, subtitulo, children, extra }) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: 16,
        minWidth: 0
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          marginBottom: 12
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>{titulo}</h3>
          {subtitulo && (
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#64748b' }}>{subtitulo}</p>
          )}
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}

export default function VistaEstadisticas() {
  const [opciones, setOpciones] = useState({ localidades: [], eventos: [], anios: [] });
  const [localidad, setLocalidad] = useState('');
  const [evento, setEvento] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [aniosOcultos, setAniosOcultos] = useState([]);

  useEffect(() => {
    axios
      .get(`${API}/estadisticas/opciones`)
      .then(res => setOpciones({
        localidades: res.data?.localidades || [],
        eventos: res.data?.eventos || [],
        anios: res.data?.anios || []
      }))
      .catch(e => {
        console.error('Error cargando opciones de estadísticas:', e);
        setError('No se pudieron cargar las opciones. Verificá que el backend esté corriendo.');
      });
  }, []);

  useEffect(() => {
    let activo = true;
    axios
      .get(`${API}/estadisticas`, {
        params: {
          localidad: localidad || undefined,
          evento: evento || undefined
        }
      })
      .then(res => {
        if (!activo) return;
        setData(res.data);
        setError('');
      })
      .catch(e => {
        if (!activo) return;
        console.error('Error cargando estadísticas:', e);
        setError('No se pudieron cargar las estadísticas.');
        setData(null);
      });
    return () => {
      activo = false;
    };
  }, [localidad, evento]);

  const filtrosPendientes = Boolean(
    !data
    || (data.filtros?.localidad || null) !== (localidad || null)
    || (data.filtros?.evento || null) !== (evento || null)
  );
  const loading = !error && filtrosPendientes;

  const anios = useMemo(
    () => (data?.por_anio || []).map(a => a.anio),
    [data]
  );

  const comparativa = useMemo(() => {
    if (!data?.serie_anual?.length) return [];
    const maxSemanaPorAnio = {};
    data.serie_anual.forEach(d => {
      maxSemanaPorAnio[d.anio] = Math.max(maxSemanaPorAnio[d.anio] || 0, d.semana);
    });

    const mapa = new Map();
    data.serie_anual.forEach(d => {
      if (!mapa.has(d.semana)) mapa.set(d.semana, { semana: d.semana });
      mapa.get(d.semana)[d.anio] = d.casos;
    });

    for (let semana = 1; semana <= 53; semana += 1) {
      if (!mapa.has(semana)) mapa.set(semana, { semana });
      const fila = mapa.get(semana);
      anios.forEach(anio => {
        if (semana <= maxSemanaPorAnio[anio] && fila[anio] === undefined) {
          fila[anio] = 0;
        }
      });
    }

    return [...mapa.values()].sort((a, b) => a.semana - b.semana);
  }, [data, anios]);

  const colorAnio = useMemo(() => {
    const mapa = {};
    anios.forEach((anio, i) => {
      mapa[anio] = COLORES_ANIO[i % COLORES_ANIO.length];
    });
    return mapa;
  }, [anios]);

  const aniosIncompletos = useMemo(
    () => new Set((data?.por_anio || []).filter(a => !a.es_completo).map(a => a.anio)),
    [data]
  );

  const aniosVisibles = useMemo(
    () => anios.filter(a => !aniosOcultos.includes(a)),
    [anios, aniosOcultos]
  );

  const casosPorAnio = useMemo(() => {
    const mapa = {};
    (data?.por_anio || []).forEach(a => {
      mapa[a.anio] = a.casos;
    });
    return mapa;
  }, [data]);

  const toggleAnio = (anio) => {
    setAniosOcultos(prev => (
      prev.includes(anio) ? prev.filter(a => a !== anio) : [...prev, anio]
    ));
  };

  const promedioEstacional = useMemo(() => {
    if (!data?.estacionalidad?.length) return 0;
    const suma = data.estacionalidad.reduce((acc, d) => acc + Number(d.casos_promedio || 0), 0);
    return suma / data.estacionalidad.length;
  }, [data]);

  const picosGrafico = useMemo(
    () => (data?.picos || []).slice(0, 12),
    [data]
  );

  const resumen = data?.resumen;
  const sinDatos = !loading && !error && (!data || data.vacio || resumen?.total_casos === 0);

  const selectStyle = {
    padding: '7px 9px',
    borderRadius: 6,
    border: '1px solid #cbd5e1',
    background: 'white',
    color: '#0f172a',
    fontSize: '0.85rem'
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#f1f5f9', padding: 16 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Controles */}
        <div
          style={{
            background: '#0f172a',
            color: 'white',
            borderRadius: 10,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: 14,
            flexWrap: 'wrap'
          }}
        >
          <div style={{ marginRight: 'auto' }}>
            <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Estadísticas epidemiológicas</h2>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94a3b8' }}>
              Resumen, indicadores, comparativa interanual, alto contagio y estacionalidad
            </p>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Ciudad
            <select
              value={localidad}
              onChange={e => setLocalidad(e.target.value)}
              style={{ ...selectStyle, minWidth: 210 }}
            >
              <option value="">Todas las ciudades</option>
              {opciones.localidades.map(l => (
                <option key={`${l.localidad}-${l.departamento}`} value={l.localidad}>
                  {l.localidad} ({l.casos})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tipo de enfermedad
            <select
              value={evento}
              onChange={e => setEvento(e.target.value)}
              style={{ ...selectStyle, minWidth: 240 }}
            >
              <option value="">Todos los eventos</option>
              {opciones.eventos.map(e => (
                <option key={e.evento} value={e.evento}>
                  {e.evento} ({e.casos})
                </option>
              ))}
            </select>
          </label>

          {(localidad || evento) && (
            <button
              onClick={() => {
                setLocalidad('');
                setEvento('');
              }}
              style={{
                background: '#475569',
                color: 'white',
                border: 'none',
                padding: '8px 12px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ background: 'white', padding: 24, borderRadius: 10, textAlign: 'center', color: '#475569' }}>
            Calculando estadísticas...
          </div>
        )}

        {sinDatos && !loading && (
          <div style={{ background: 'white', padding: 24, borderRadius: 10, textAlign: 'center', color: '#64748b' }}>
            No hay casos para los filtros seleccionados.
          </div>
        )}

        {!loading && data && !sinDatos && (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <Tarjeta
                titulo="Total de casos"
                valor={nf.format(resumen.total_casos)}
                detalle={`${resumen.n_eventos} eventos · ${resumen.n_localidades} localidades`}
                color="#2563eb"
              />
              <Tarjeta
                titulo="Promedio semanal"
                valor={fmt(resumen.promedio_semanal, 1)}
                detalle={`Mediana ${fmt(resumen.mediana_semanal, 1)} · CV ${fmt(resumen.coef_variacion_pct, 1)}%`}
                color="#0891b2"
              />
              <Tarjeta
                titulo="Semana pico"
                valor={resumen.semana_pico_global.label}
                detalle={`${resumen.semana_pico_global.casos} casos en una semana`}
                color="#dc2626"
              />
              <Tarjeta
                titulo="Alto contagio"
                valor={`${resumen.semanas_alto_contagio} semanas`}
                detalle={`Umbral: ${fmt(resumen.umbral_alto_contagio, 1)} casos/semana`}
                color="#ea580c"
              />
              <Tarjeta
                titulo={`Último año completo (${resumen.ultimo_anio_completo.anio})`}
                valor={nf.format(resumen.ultimo_anio_completo.casos)}
                detalle={`Variación ${fmtPct(resumen.ultimo_anio_completo.variacion_vs_anio_previo_pct)} vs año previo`}
                color="#059669"
              />
              <Tarjeta
                titulo="Tendencia anual"
                valor={resumen.tendencia_direccion}
                detalle={`Pendiente ${fmt(resumen.tendencia_anual_pendiente, 1)} casos/año`}
                color="#7c3aed"
              />
              <Tarjeta
                titulo="Patrón estacional"
                valor={`${fmt(resumen.varianza_estacional_explicada_pct, 1)}%`}
                detalle={`Contraste pico-valle ${fmt(resumen.rango_relativo_pico_valle_pct, 1)}% · semana pico ${resumen.semana_estacional_max ?? '—'}`}
                color="#db2777"
              />
              <Tarjeta
                titulo="Período analizado"
                valor={`${resumen.anio_min}–${resumen.anio_max}`}
                detalle={`${resumen.n_anios} años · ${resumen.n_radios} radios`}
                color="#475569"
              />
            </div>

            {/* Comparativa interanual */}
            <Seccion
              titulo="Comparativa interanual"
              subtitulo="Casos por semana epidemiológica. Hacé clic en un año para mostrarlo u ocultarlo y comparar períodos puntuales. Las líneas punteadas corresponden a años incompletos."
              extra={(
                <button
                  onClick={() => setAniosOcultos([])}
                  disabled={aniosOcultos.length === 0}
                  style={{
                    background: aniosOcultos.length === 0 ? '#f1f5f9' : '#2563eb',
                    color: aniosOcultos.length === 0 ? '#94a3b8' : 'white',
                    border: '1px solid #cbd5e1',
                    padding: '5px 10px',
                    borderRadius: 5,
                    cursor: aniosOcultos.length === 0 ? 'default' : 'pointer',
                    fontSize: 11
                  }}
                >
                  Mostrar todos
                </button>
              )}
            >
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {anios.map(anio => {
                  const activo = !aniosOcultos.includes(anio);
                  return (
                    <button
                      key={anio}
                      onClick={() => toggleAnio(anio)}
                      title={activo ? `Ocultar ${anio}` : `Mostrar ${anio}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: activo ? colorAnio[anio] : 'white',
                        color: activo ? 'white' : '#64748b',
                        border: `1px solid ${activo ? colorAnio[anio] : '#cbd5e1'}`,
                        padding: '4px 9px',
                        borderRadius: 20,
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 600
                      }}
                    >
                      <span
                        style={{
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          background: activo ? 'white' : colorAnio[anio],
                          opacity: activo ? 1 : 0.5
                        }}
                      />
                      {anio}
                      <span style={{ opacity: 0.8, fontWeight: 400 }}>
                        ({nf.format(casosPorAnio[anio] || 0)})
                      </span>
                      {aniosIncompletos.has(anio) && <span style={{ opacity: 0.8 }}>*</span>}
                    </button>
                  );
                })}
              </div>

              {aniosVisibles.length === 0 ? (
                <div
                  style={{
                    height: 320,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                    fontSize: 13,
                    background: '#f8fafc',
                    borderRadius: 8
                  }}
                >
                  Seleccioná al menos un año para ver la comparativa.
                </div>
              ) : (
                <div style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparativa} margin={{ top: 8, right: 18, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="semana"
                        tick={{ fontSize: 10 }}
                        interval={3}
                        label={{ value: 'Semana epidemiológica', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#64748b' }}
                      />
                      <YAxis tick={{ fontSize: 10 }} width={38} allowDecimals={false} />
                      <Tooltip
                        formatter={(valor, nombre) => [`${valor ?? 0} casos`, `Año ${nombre}`]}
                        labelFormatter={semana => `Semana ${semana}`}
                      />
                      {aniosVisibles.map(anio => (
                        <Line
                          key={anio}
                          type="monotone"
                          dataKey={String(anio)}
                          name={String(anio)}
                          stroke={colorAnio[anio]}
                          strokeWidth={2}
                          strokeDasharray={aniosIncompletos.has(anio) ? '5 3' : undefined}
                          dot={false}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Seccion>

            {/* Estacionalidad + alto contagio */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: 14 }}>
              <Seccion
                titulo="Patrón de estacionalidad"
                subtitulo="Promedio de casos por semana del año. Las barras resaltadas superan un índice estacional de 120."
                extra={(
                  <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
                    <div>
                      Pico estacional: <b style={{ color: '#be123c' }}>semana {resumen.semana_estacional_max}</b>
                    </div>
                    <div>
                      Semanas de mayor incidencia:{' '}
                      {(data.semanas_pico_estacional || []).map(s => s.semana).join(', ') || '—'}
                    </div>
                  </div>
                )}
              >
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.estacionalidad} margin={{ top: 8, right: 10, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="semana" tick={{ fontSize: 10 }} interval={3} />
                      <YAxis tick={{ fontSize: 10 }} width={36} />
                      <Tooltip
                        formatter={(valor, nombre) => [
                          `${fmt(valor, 2)} casos`,
                          nombre === 'casos_promedio' ? 'Promedio' : nombre
                        ]}
                        labelFormatter={semana => `Semana ${semana}`}
                      />
                      <ReferenceLine
                        y={promedioEstacional}
                        stroke="#475569"
                        strokeDasharray="4 4"
                        label={{ value: 'media', fontSize: 9, fill: '#475569', position: 'insideTopRight' }}
                      />
                      <Bar dataKey="casos_promedio" radius={[2, 2, 0, 0]}>
                        {data.estacionalidad.map(d => (
                          <Cell key={d.semana} fill={d.alta_temporada ? '#dc2626' : '#38bdf8'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#475569', marginTop: 8, flexWrap: 'wrap' }}>
                  <span>Varianza estacional explicada: <b>{fmt(resumen.varianza_estacional_explicada_pct, 1)}%</b></span>
                  <span>Contraste pico-valle: <b>{fmt(resumen.rango_relativo_pico_valle_pct, 1)}%</b></span>
                  <span>Semana de menor promedio: <b>{resumen.semana_estacional_min ?? '—'}</b></span>
                </div>
              </Seccion>

              <Seccion
                titulo="Momentos de alto contagio"
                subtitulo="Semanas por encima de la media + 1,5 desvíos estándar."
              >
                {picosGrafico.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                    No se detectaron semanas de alto contagio con los filtros actuales.
                  </p>
                ) : (
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={picosGrafico}
                        layout="vertical"
                        margin={{ top: 4, right: 24, left: 4, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={68} />
                        <Tooltip
                          formatter={(valor, nombre, item) => [
                            `${valor} casos · z=${item?.payload?.zscore ?? '—'} (${item?.payload?.nivel ?? ''})`,
                            'Casos'
                          ]}
                          labelFormatter={label => `Semana ${label}`}
                        />
                        <Bar dataKey="casos" radius={[0, 3, 3, 0]}>
                          {picosGrafico.map(p => (
                            <Cell
                              key={p.label}
                              fill={p.nivel === 'Crítico' ? '#dc2626' : p.nivel === 'Alto' ? '#ea580c' : '#f59e0b'}
                            />
                          ))}
                          <LabelList dataKey="casos" position="right" style={{ fontSize: 10, fill: '#334155' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Seccion>
            </div>

            {!evento && (
              <Seccion
                titulo="Casos por tipo de enfermedad"
                subtitulo="Distribución del total de casos según el evento notificado."
              >
                <div style={{ height: Math.max(220, Math.min(330, (data.por_evento.length || 1) * 28)) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.por_evento.slice(0, 10)}
                      layout="vertical"
                      margin={{ top: 0, right: 40, left: 4, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="evento"
                        tick={{ fontSize: 10 }}
                        width={150}
                      />
                      <Tooltip formatter={valor => [`${valor} casos`, 'Casos']} />
                      <Bar dataKey="casos" radius={[0, 3, 3, 0]}>
                        {data.por_evento.slice(0, 10).map(e => (
                          <Cell key={e.evento} fill={colorPorEvento(e.evento)} />
                        ))}
                        <LabelList dataKey="casos" position="right" style={{ fontSize: 10, fill: '#334155' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Seccion>
            )}

            <div style={{ fontSize: 11, color: '#64748b', textAlign: 'right' }}>
              Fuente: {nf.format(resumen.total_casos)} casos notificados
              {data.filtros?.localidad ? ` · ${data.filtros.localidad}` : ''}
              {data.filtros?.evento ? ` · ${data.filtros.evento}` : ''}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
