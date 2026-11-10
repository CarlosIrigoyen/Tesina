import SeccionColapsable from './SeccionColapsable';
import TarjetasResultado from './TarjetasResultado';
import ListaClusters from './ListaClusters';
import DetalleRadio from './DetalleRadio';
import { colorPorEvento } from '../../utils/eventos';

export default function PanelLateral({
  configActiva, exploracion, clustering, 
  mostrarHeatmap, setMostrarHeatmap, mostrarAnimacion, setMostrarAnimacion,
  enfermedadesResumen, filtroCiudad, eventoSeleccionado, setEventoSeleccionado,
  clustersInfoVisibles, clustersInfo, clustersVisibles, toggleCluster, toggleTodos,
  clusterSeleccionado, seleccionarCluster, cerrarCluster,
  radioDetalle, enfermedadesCluster, onCerrarRadio, onAbrirModalRadios,
}) {
  return (
    <div style={{ flex: 1, background: '#f8fafc', padding: 12, overflowY: 'auto', minWidth: 450 }}>
      {configActiva && (
        <SeccionColapsable titulo={`Configuración activa · ${configActiva.algoritmo}`}>
          <p style={{ fontSize: 12 }}><b>{configActiva.nombre}</b></p>
          <p style={{ fontSize: 11, color: '#475569' }}>{configActiva.localidad || 'Todas las ciudades'}</p>
        </SeccionColapsable>
      )}

      <SeccionColapsable titulo="Capas">
        <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>
          <input type="checkbox" checked={mostrarHeatmap} onChange={(e) => setMostrarHeatmap(e.target.checked)} /> Mapa de calor
        </label>
        <label style={{ display: 'block', fontSize: 13 }}>
          <input type="checkbox" checked={mostrarAnimacion} onChange={(e) => setMostrarAnimacion(e.target.checked)} /> Animación temporal
        </label>
      </SeccionColapsable>

      {enfermedadesResumen.length > 0 && (
        <SeccionColapsable
          titulo={`Enfermedades (${enfermedadesResumen.length})${filtroCiudad ? ` · ${filtroCiudad}` : ''}`}
          extra={eventoSeleccionado ? (
            <button onClick={() => setEventoSeleccionado(null)} style={{ background: '#e2e8f0', border: 'none', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>Todas</button>
          ) : null}
        >
          <div style={{ maxHeight: 190, overflowY: 'auto' }}>
            {enfermedadesResumen.map(({ evento, casos }) => {
              const activo = eventoSeleccionado === evento;
              return (
                <div key={evento} onClick={() => setEventoSeleccionado(activo ? null : evento)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 4, borderBottom: '1px solid #f1f5f9', fontSize: 12, cursor: 'pointer', background: activo ? '#e0e7ff' : 'transparent', fontWeight: activo ? 'bold' : 'normal' }}>
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: colorPorEvento(evento), border: '1px solid #111827' }} />
                  <span style={{ flex: 1 }}>{evento}</span><b>{casos}</b>
                </div>
              );
            })}
          </div>
        </SeccionColapsable>
      )}

      <TarjetasResultado exploracion={exploracion} clustering={clustering} />

      {clustersInfo.length > 0 && (
        <ListaClusters
          clustersInfoVisibles={clustersInfoVisibles}
          clustersInfo={clustersInfo}
          clustersVisibles={clustersVisibles}
          toggleCluster={toggleCluster}
          toggleTodos={toggleTodos}
          clusterSeleccionado={clusterSeleccionado}
          seleccionarCluster={seleccionarCluster}
          cerrarCluster={cerrarCluster}
          eventoSeleccionado={eventoSeleccionado}
          enfermedadesCluster={enfermedadesCluster}
          onToggleEvento={(e) => setEventoSeleccionado(eventoSeleccionado === e ? null : e)}
          onAbrirModalRadios={onAbrirModalRadios}
        />
      )}

      {radioDetalle && !clusterSeleccionado && (
        <DetalleRadio radio={radioDetalle} onCerrar={onCerrarRadio} />
      )}
    </div>
  );
}