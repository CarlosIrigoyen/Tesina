import PanelConfiguraciones from './PanelConfiguraciones';
import { colorPorEvento } from '../../utils/eventos';

export default function BarraControles({
  minSamples, setMinSamples, maxEpsOptics, setMaxEpsOptics,
  epsTemporal, setEpsTemporal, filtroCiudad, ciudadesDisponibles,
  cambiarCiudad, configuraciones, configActivaId, cargarConfiguracion,
  cargarListaConfiguraciones, eliminarConfiguracion, cargandoConfig,
  eventoSeleccionado, setEventoSeleccionado, loading, algoritmoActivo,
  ejecutar, ejecutarStknn, ejecutarComparativa, limpiar, loadingComp,
}) {
  return (
    <div style={{ padding: 12, background: '#1e293b', color: 'white',
                  display: 'flex', gap: 12, alignItems: 'center',
                  flexWrap: 'wrap', fontSize: 13 }}>
      <label>min_samples/k: <input type="number" value={minSamples}
        onChange={(e) => setMinSamples(+e.target.value)} style={{ width: 55 }} /></label>
      <label>max_eps: <input type="number" value={maxEpsOptics}
        onChange={(e) => setMaxEpsOptics(+e.target.value)} style={{ width: 55 }} /></label>
      <label>Δt (semanas): <input type="number" value={epsTemporal}
        onChange={(e) => setEpsTemporal(+e.target.value)} style={{ width: 50 }} /></label>

      <label>Ciudad:{' '}
        <select value={filtroCiudad} onChange={(e) => cambiarCiudad(e.target.value)}
          style={{ padding: '5px 6px', borderRadius: 4, minWidth: 160 }}>
          <option value="">Todas las ciudades</option>
          {ciudadesDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <PanelConfiguraciones
        configuraciones={configuraciones}
        valor={configActivaId}
        onChange={cargarConfiguracion}
        onRefrescar={cargarListaConfiguraciones}
        onEliminar={eliminarConfiguracion}
        cargando={cargandoConfig}
      />

      {eventoSeleccionado && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                       background: colorPorEvento(eventoSeleccionado), color: '#111827',
                       padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 'bold' }}>
          {eventoSeleccionado}
          <button onClick={() => setEventoSeleccionado(null)}
            aria-label="Quitar filtro"
            style={{ border: 'none', background: 'transparent',
                     cursor: 'pointer', fontWeight: 'bold' }}>×</button>
        </span>
      )}

      <button onClick={ejecutar} disabled={loading}
        style={{ background: '#7c3aed', color: 'white', border: 'none',
                 padding: '6px 12px', borderRadius: 4, cursor: 'pointer' }}>
        {loading && algoritmoActivo !== 'stknn' ? 'Ejecutando...' : '▶ OPTICS → ST-DBSCAN'}
      </button>
      <button onClick={ejecutarStknn} disabled={loading}
        style={{ background: '#059669', color: 'white', border: 'none',
                 padding: '6px 12px', borderRadius: 4, cursor: 'pointer' }}>
        {loading && algoritmoActivo === 'stknn' ? 'Ejecutando...' : '▶ ST-kNN'}
      </button>
      <button onClick={ejecutarComparativa} disabled={loadingComp}
        style={{ background: '#ea580c', color: 'white', border: 'none',
                 padding: '6px 12px', borderRadius: 4, cursor: 'pointer' }}>
        {loadingComp ? 'Comparando...' : '📊 Comparativa'}
      </button>
      <button onClick={limpiar}
        style={{ background: '#dc2626', color: 'white', border: 'none',
                 padding: '6px 12px', borderRadius: 4, cursor: 'pointer' }}>
        Limpiar
      </button>
    </div>
  );
}