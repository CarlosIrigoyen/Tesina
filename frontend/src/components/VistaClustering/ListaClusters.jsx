import { Fragment } from 'react';
import SeccionColapsable from './SeccionColapsable';
import DetalleCluster from './DetalleCluster';
import { colorCluster } from './constants';

const btnMin = { background: '#e2e8f0', border: 'none', padding: '2px 6px',
                  borderRadius: 3, cursor: 'pointer', marginRight: 4 };

export default function ListaClusters({
  clustersInfoVisibles, clustersInfo, clustersVisibles, toggleCluster, toggleTodos,
  clusterSeleccionado, seleccionarCluster, cerrarCluster, eventoSeleccionado,
  enfermedadesCluster, onToggleEvento, onAbrirModalRadios,
}) {
  return (
    <SeccionColapsable
      titulo={`Clusters (${clustersInfoVisibles.length}${eventoSeleccionado ? ` de ${clustersInfo.length}` : ''})`}
      extra={
        <div style={{ fontSize: 11 }}>
          <button onClick={() => toggleTodos(true)} style={btnMin}>Todos</button>
          <button onClick={() => toggleTodos(false)} style={btnMin}>Ninguno</button>
        </div>
      }
    >
      <div style={{ maxHeight: 600, overflowY: 'auto' }}>
        {clustersInfoVisibles.map((c) => {
          const seleccionado = clusterSeleccionado?.cluster_id === c.cluster_id;
          return (
            <Fragment key={c.cluster_id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6,
                            borderBottom: '1px solid #f1f5f9',
                            background: seleccionado ? '#e0e7ff' : 'transparent' }}>
                <input type="checkbox" checked={clustersVisibles.has(c.cluster_id)}
                  onChange={() => toggleCluster(c.cluster_id)} />
                <div onClick={() => seleccionarCluster(c)}
                  style={{ flex: 1, cursor: 'pointer', paddingLeft: 4,
                           borderLeft: `4px solid ${colorCluster(c.cluster_id)}`, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <b>Cluster {c.cluster_id}</b><span>{c.n_casos} casos</span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                    {c.localidades} · {c.anio_min}-{c.anio_max}
                  </div>
                </div>
              </div>
              {seleccionado && (
                <DetalleCluster
                  cluster={c}
                  enfermedadesCluster={enfermedadesCluster}
                  eventoSeleccionado={eventoSeleccionado}
                  onToggleEvento={onToggleEvento}
                  onCerrar={cerrarCluster}
                  onAbrirModalRadios={onAbrirModalRadios}
                />
              )}
            </Fragment>
          );
        })}
      </div>
    </SeccionColapsable>
  );
}