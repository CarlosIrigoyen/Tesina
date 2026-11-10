import { formatoPct } from './constants';

export default function ModalRadiosCluster({ 
  cluster, 
  radios, 
  casos, 
  clustersNavegables = [], 
  onCambiarCluster, 
  onCerrar 
}) {
  if (!cluster) return null;

  // Calculamos en qué posición de la lista estamos
  const indexActual = clustersNavegables.findIndex(c => c.cluster_id === cluster.cluster_id);
  const hayAnterior = indexActual > 0;
  const haySiguiente = indexActual !== -1 && indexActual < clustersNavegables.length - 1;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.7)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 10, width: '100%', maxWidth: 1200, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 50px rgba(0,0,0,0.35)' }}>
        
        {/* Header del Modal con Navegación */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', borderTopLeftRadius: 10, borderTopRightRadius: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>
              Radios del Cluster {cluster.cluster_id}
              {clustersNavegables.length > 1 && (
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 'normal', marginLeft: 8 }}>
                  ({indexActual + 1} de {clustersNavegables.length} seleccionados)
                </span>
              )}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{cluster.localidades} · {radios.length} radios involucrados</p>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Botones de Navegación */}
            {clustersNavegables.length > 1 && (
              <div style={{ display: 'flex', gap: 4, marginRight: 16, background: '#e2e8f0', padding: 3, borderRadius: 6 }}>
                <button
                  onClick={() => onCambiarCluster(clustersNavegables[indexActual - 1])}
                  disabled={!hayAnterior}
                  style={{
                    background: hayAnterior ? '#475569' : 'transparent',
                    color: hayAnterior ? 'white' : '#94a3b8',
                    border: 'none', borderRadius: 4, padding: '4px 12px',
                    cursor: hayAnterior ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 'bold'
                  }}
                >
                  ◀ Anterior
                </button>
                <button
                  onClick={() => onCambiarCluster(clustersNavegables[indexActual + 1])}
                  disabled={!haySiguiente}
                  style={{
                    background: haySiguiente ? '#475569' : 'transparent',
                    color: haySiguiente ? 'white' : '#94a3b8',
                    border: 'none', borderRadius: 4, padding: '4px 12px',
                    cursor: haySiguiente ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 'bold'
                  }}
                >
                  Siguiente ▶
                </button>
              </div>
            )}

            <button onClick={onCerrar} style={{ border: 'none', background: 'transparent', fontSize: '1.5rem', cursor: 'pointer', color: '#475569' }}>×</button>
          </div>
        </div>

        {/* Contenido scrolleable */}
        <div style={{ padding: 18, overflowY: 'auto' }}>
          
          {/* TABLA DE RADIOS CON ÍNDICES DESAGREGADOS */}
          <div style={{ overflowX: 'auto', marginBottom: 30 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, whiteSpace: 'nowrap' }}>
              <thead style={{ background: '#0f172a', color: 'white' }}>
                <tr>
                  <th style={{ padding: 8, textAlign: 'left' }}>Radio Censal</th>
                  <th style={{ padding: 8, textAlign: 'left' }}>Localidad</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Casos</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Actividad</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Carencias Sanit.</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Demografía</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Educación</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Fuente Agua</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Infraestructura</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>Salud</th>
                  <th style={{ padding: 8, textAlign: 'right', background: '#1e293b' }}>Índice Comp.</th>
                </tr>
              </thead>
              <tbody>
                {radios.map((r, i) => (
                  <tr key={r.link || i} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 ? '#f8fafc' : 'white' }}>
                    <td style={{ padding: 8, fontFamily: 'monospace' }}>{r.link || r.radio_censal_id}</td>
                    <td style={{ padding: 8 }}>{r.localidad || '—'}</td>
                    <td style={{ padding: 8, textAlign: 'right', fontWeight: 'bold' }}>{r.casos}</td>
                    
                    {/* Índices desagregados */}
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatoPct(r.actividad)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatoPct(r.carencias_sanitarias)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatoPct(r.demografia)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatoPct(r.educacion)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatoPct(r.fuente_agua)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatoPct(r.infraestructuta)}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}>{formatoPct(r.salud)}</td>
                    
                    {/* Índice compuesto resaltado */}
                    <td style={{ padding: 8, textAlign: 'right', background: '#fef3c7', fontWeight: 'bold' }}>
                      {formatoPct(r.indice_compuesto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* TABLA DE CASOS */}
          <h4 style={{ marginBottom: 8, fontSize: 14, color: '#0f172a' }}>Casos del Cluster ({casos.length})</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: '#0f172a', color: 'white' }}>
              <tr>
                <th style={{ padding: 8, textAlign: 'left' }}>ID Caso</th>
                <th style={{ padding: 8, textAlign: 'left' }}>Evento</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Semana</th>
                <th style={{ padding: 8, textAlign: 'right' }}>Año</th>
              </tr>
            </thead>
            <tbody>
              {casos.map((c, i) => (
                <tr key={c.id_caso} style={{ borderBottom: '1px solid #e2e8f0', background: i % 2 ? '#f8fafc' : 'white' }}>
                  <td style={{ padding: 8, fontFamily: 'monospace' }}>{c.id_caso}</td>
                  <td style={{ padding: 8 }}>{c.evento}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{c.semana_epidemiologica}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{c.anio_epidemiologico}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}