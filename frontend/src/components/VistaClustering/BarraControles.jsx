import { colorPorEvento } from '../../utils/eventos';

export default function BarraControles({
  minSamples, setMinSamples, maxEpsOptics, setMaxEpsOptics,
  epsTemporal, setEpsTemporal,
  filtroCiudad, ciudadesDisponibles, cambiarCiudad,
  eventoSeleccionado, setEventoSeleccionado,
  ejecutar, limpiar, loadingDbscan = false,
  nCasosDisponibles = 0,
}) {
  const MIN_CASOS_ABSOLUTO = 3;
  const minDbscan = Math.max(MIN_CASOS_ABSOLUTO, Number(minSamples) || 5);

  const hayCiudad = Boolean(filtroCiudad);
  const casosSuficientesDbscan = nCasosDisponibles >= minDbscan;
  const puedeDbscan = hayCiudad && casosSuficientesDbscan;

  const tooltipDbscan = !hayCiudad
    ? 'Seleccioná una ciudad primero'
    : !casosSuficientesDbscan
      ? `Casos insuficientes: ${filtroCiudad} tiene ${nCasosDisponibles}, necesita al menos ${minDbscan}.`
      : `Ejecutar OPTICS → ST-DBSCAN con min_samples=${minSamples}`;

  const estiloBoton = (habilitado, color, bloqueado) => ({
    background: habilitado ? color : '#475569',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: 4,
    cursor: habilitado && !bloqueado ? 'pointer' : 'not-allowed',
    opacity: habilitado ? 1 : 0.55,
    transition: 'opacity 0.15s, background 0.15s',
  });

  const badgeColor = !hayCiudad ? '#94a3b8' : casosSuficientesDbscan ? '#86efac' : '#fca5a5';
  const inputStyle = { width: 60 };

  return (
    <div style={{ padding: 12, background: '#1e293b', color: 'white', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
      <label title="Vecinos mínimos para ST-DBSCAN">
        min_samples: <input type="number" min={1} value={minSamples} onChange={(e) => setMinSamples(+e.target.value)} style={inputStyle} />
      </label>
      <label title="Distancia espacial máxima para OPTICS (km)">
        max_eps: <input type="number" value={maxEpsOptics} onChange={(e) => setMaxEpsOptics(+e.target.value)} style={inputStyle} />
      </label>
      <label title="Ventana temporal en semanas">
        Δt (semanas): <input type="number" value={epsTemporal} onChange={(e) => setEpsTemporal(+e.target.value)} style={{ width: 55 }} />
      </label>

      <label>
        Ciudad:{' '}
        <select value={filtroCiudad} onChange={(e) => cambiarCiudad(e.target.value)} style={{ padding: '5px 6px', borderRadius: 4, minWidth: 160 }}>
          <option value="">Elegí una ciudad…</option>
          {ciudadesDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      {eventoSeleccionado && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: colorPorEvento(eventoSeleccionado), color: '#111827', padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 'bold' }}>
          {eventoSeleccionado}
          <button onClick={() => setEventoSeleccionado(null)} aria-label="Quitar filtro" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
        </span>
      )}

      <span title={!hayCiudad ? 'Elegí una ciudad para ver los casos disponibles' : `Casos en ${filtroCiudad}. Mínimo DBSCAN: ${minDbscan}.`} style={{ background: '#0f172a', border: `1px solid ${!hayCiudad ? '#475569' : casosSuficientesDbscan ? '#334155' : '#7f1d1d'}`, padding: '5px 10px', borderRadius: 6, fontSize: 11, color: badgeColor, fontWeight: 'bold' }}>
        {hayCiudad ? `Casos: ${nCasosDisponibles} / mín ${minDbscan}` : 'Casos: — (elegí ciudad)'}
      </span>

      <button onClick={ejecutar} disabled={!puedeDbscan || loadingDbscan} title={tooltipDbscan} style={estiloBoton(puedeDbscan, '#7c3aed', loadingDbscan)}>
        {loadingDbscan ? 'Ejecutando...' : '▶ OPTICS → ST-DBSCAN'}
      </button>

      <button onClick={limpiar} style={{ background: '#dc2626', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer' }}>
        Limpiar
      </button>
    </div>
  );
}