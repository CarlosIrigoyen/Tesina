import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, useMap } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import HeatmapLayer from './HeatmapLayer';
import HeatmapAnimation from './HeatmapAnimation';

const { BaseLayer, Overlay } = LayersControl;
const STORAGE_KEY = 'clustering_resultados_v5';

function CentrarEnCluster({ centro }) {
  const map = useMap();
  useEffect(() => {
    if (centro && centro[0] && centro[1]) {
      map.setView(centro, 13, { animate: true });
    }
  }, [centro, map]);
  return null;
}

export default function VistaClustering({ radiosGeoJson }) {
  const [minSamples, setMinSamples] = useState(5);
  const [maxEpsOptics, setMaxEpsOptics] = useState(20);
  const [epsTemporal, setEpsTemporal] = useState(2);
  const [exploracion, setExploracion] = useState(null);
  const [clustering, setClustering] = useState(null);
  const [casosGeoJson, setCasosGeoJson] = useState(null);
  const [clustersPoligonos, setClustersPoligonos] = useState(null);
  const [clustersInfo, setClustersInfo] = useState([]);
  const [clusterSeleccionado, setClusterSeleccionado] = useState(null);
  const [casosDelCluster, setCasosDelCluster] = useState([]);
  const [radiosDelCluster, setRadiosDelCluster] = useState([]);
  const [centroMapa, setCentroMapa] = useState(null);
  const [loading, setLoading] = useState(false);
  const [clustersVisibles, setClustersVisibles] = useState(new Set());
  const [mostrarHeatmap, setMostrarHeatmap] = useState(false);
  const [mostrarAnimacion, setMostrarAnimacion] = useState(false);

  useEffect(() => {
    try {
      const g = localStorage.getItem(STORAGE_KEY);
      if (g) {
        const data = JSON.parse(g);
        if (data.exploracion) setExploracion(data.exploracion);
        if (data.clustering) setClustering(data.clustering);
        if (data.minSamples !== undefined) setMinSamples(data.minSamples);
        if (data.maxEpsOptics !== undefined) setMaxEpsOptics(data.maxEpsOptics);
        if (data.epsTemporal !== undefined) setEpsTemporal(data.epsTemporal);
      }
    } catch (e) {}
    cargarTodo();
  }, []);

  const cargarTodo = async () => {
    try {
      const [resCasos, resPoligonos, resInfo] = await Promise.all([
        axios.get('http://localhost:8000/api/v1/experimentos/casos-geojson'),
        axios.get('http://localhost:8000/api/v1/experimentos/clusters-poligonos').catch(() => ({ data: null })),
        axios.get('http://localhost:8000/api/v1/experimentos/clusters-info').catch(() => ({ data: [] })),
      ]);
      setCasosGeoJson(resCasos.data);
      if (resPoligonos.data) setClustersPoligonos(resPoligonos.data);
      if (resInfo.data) {
        setClustersInfo(resInfo.data);
        // Inicializar todos visibles
        setClustersVisibles(new Set(resInfo.data.map(c => c.cluster_id)));
      }
    } catch (e) {
      console.error('Error cargando datos:', e);
    }
  };

  const ejecutar = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `http://localhost:8000/api/v1/experimentos/flujo-clustering?min_samples=${minSamples}&max_eps_optics=${maxEpsOptics}&eps_temporal_semanas=${epsTemporal}`
      );
      setExploracion(res.data.exploracion_optics);
      setClustering(res.data.clustering_final);
      await cargarTodo();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        exploracion: res.data.exploracion_optics,
        clustering: res.data.clustering_final,
        minSamples, maxEpsOptics, epsTemporal
      }));
    } catch (e) {
      console.error(e);
      alert('Error en clustering');
    } finally {
      setLoading(false);
    }
  };

  const seleccionarCluster = async (cluster) => {
    setClusterSeleccionado(cluster);
    if (cluster && cluster.centro_lat && cluster.centro_lon) {
      setCentroMapa([parseFloat(cluster.centro_lat), parseFloat(cluster.centro_lon)]);
    }
    try {
      const [resCasos, resRadios] = await Promise.all([
        axios.get(`http://localhost:8000/api/v1/experimentos/cluster-casos/${cluster.cluster_id}`),
        axios.get(`http://localhost:8000/api/v1/experimentos/cluster-radios/${cluster.cluster_id}`),
      ]);
      setCasosDelCluster(resCasos.data);
      setRadiosDelCluster(resRadios.data);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleCluster = (id) => {
    const nuevo = new Set(clustersVisibles);
    if (nuevo.has(id)) nuevo.delete(id);
    else nuevo.add(id);
    setClustersVisibles(nuevo);
  };

  const toggleTodos = (visible) => {
    if (visible) {
      setClustersVisibles(new Set(clustersInfo.map(c => c.cluster_id)));
    } else {
      setClustersVisibles(new Set());
    }
  };

  const limpiar = () => {
    localStorage.removeItem(STORAGE_KEY);
    setExploracion(null);
    setClustering(null);
    setClustersPoligonos(null);
    setClustersInfo([]);
    setClusterSeleccionado(null);
    setCasosDelCluster([]);
    setRadiosDelCluster([]);
    setClustersVisibles(new Set());
    cargarTodo();
  };

  const colorCluster = (c) => {
    if (c === null || c === undefined || c === -1) return '#94a3b8';
    return `hsl(${(c * 47) % 360}, 70%, 50%)`;
  };

  // Filtrar polígonos y puntos según visibilidad
  const poligonosFiltrados = useMemo(() => {
    if (!clustersPoligonos) return null;
    return {
      type: 'FeatureCollection',
      features: clustersPoligonos.features.filter(f => clustersVisibles.has(f.properties.cluster))
    };
  }, [clustersPoligonos, clustersVisibles]);

  const casosFiltrados = useMemo(() => {
    if (!casosGeoJson) return null;
    return {
      type: 'FeatureCollection',
      features: casosGeoJson.features.filter(f => {
        const c = f.properties.cluster_stdbscan;
        return c === null || c === -1 || clustersVisibles.has(c);
      })
    };
  }, [casosGeoJson, clustersVisibles]);

  const puntosHeatmap = useMemo(() => {
    if (!casosGeoJson) return [];
    return casosGeoJson.features.map(f => [
      f.geometry.coordinates[1],
      f.geometry.coordinates[0],
      1
    ]);
  }, [casosGeoJson]);

  const pointToLayer = (feature, latlng) => {
    const c = feature.properties.cluster_stdbscan;
    const destacado = clusterSeleccionado && c === clusterSeleccionado.cluster_id;
    return L.circleMarker(latlng, {
      radius: destacado ? 8 : 5,
      fillColor: colorCluster(c),
      color: destacado ? '#000' : '#333',
      weight: destacado ? 2 : 1,
      fillOpacity: destacado ? 1 : 0.85
    });
  };

  const onEachFeatureCaso = (f, l) => {
    const p = f.properties;
    l.bindPopup(`
      <div style="font-family: sans-serif; font-size: 13px;">
        <strong>${p.evento}</strong><br/>
        Caso: ${p.id_caso}<br/>
        Radio: ${p.radio_censal_id || 'sin asignar'}<br/>
        Localidad: ${p.localidad}<br/>
        Semana: ${p.semana}/${p.anio}<br/>
        <hr style="margin: 4px 0;"/>
        <b>Cluster: ${p.cluster_stdbscan === -1 ? 'Ruido' : p.cluster_stdbscan}</b>
      </div>
    `);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Barra superior */}
      <div style={{
        padding: 12, background: '#1e293b', color: 'white',
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 13
      }}>
        <label>min_samples: <input type="number" value={minSamples} onChange={e => setMinSamples(+e.target.value)} style={{ width: 55 }} /></label>
        <label>max_eps: <input type="number" value={maxEpsOptics} onChange={e => setMaxEpsOptics(+e.target.value)} style={{ width: 55 }} /></label>
        <label>Δt: <input type="number" value={epsTemporal} onChange={e => setEpsTemporal(+e.target.value)} style={{ width: 50 }} /></label>
        <button onClick={ejecutar} disabled={loading} style={{
          background: '#7c3aed', color: 'white', border: 'none',
          padding: '6px 12px', borderRadius: 4, cursor: 'pointer'
        }}>
          {loading ? 'Ejecutando...' : '▶ Ejecutar OPTICS → ST-DBSCAN'}
        </button>
        <button onClick={limpiar} style={{
          background: '#dc2626', color: 'white', border: 'none',
          padding: '6px 12px', borderRadius: 4, cursor: 'pointer'
        }}>Limpiar</button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Mapa */}
        <div style={{ flex: 2, position: 'relative' }}>
          <MapContainer center={[-43.6, -69.0]} zoom={7} style={{ height: '100%', width: '100%' }}>
            <CentrarEnCluster centro={centroMapa} />
            <LayersControl position="topright">
              <BaseLayer checked name="OpenStreetMap">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              </BaseLayer>
              <BaseLayer name="Satélite">
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              </BaseLayer>
              <BaseLayer name="Sin Mapa Base"><TileLayer url="" /></BaseLayer>

              <Overlay checked name="Radios Censales">
                {radiosGeoJson && (
                  <GeoJSON data={radiosGeoJson} style={{ color: '#1d4ed8', weight: 1, fillOpacity: 0.08 }} />
                )}
              </Overlay>

              <Overlay name="Mapa de Calor">
                {mostrarHeatmap && <HeatmapLayer puntos={puntosHeatmap} radio={25} blur={15} />}
              </Overlay>

              <Overlay name="Animación Temporal">
                {mostrarAnimacion && <HeatmapAnimation casosGeoJson={casosFiltrados} />}
              </Overlay>

              <Overlay checked name="Áreas de Clusters (convex hull)">
                {poligonosFiltrados && poligonosFiltrados.features.length > 0 && (
                  <GeoJSON
                    key={JSON.stringify(Array.from(clustersVisibles))}
                    data={poligonosFiltrados}
                    style={(feature) => ({
                      color: colorCluster(feature.properties.cluster),
                      weight: clusterSeleccionado && feature.properties.cluster === clusterSeleccionado.cluster_id ? 4 : 2,
                      fillColor: colorCluster(feature.properties.cluster),
                      fillOpacity: clusterSeleccionado && feature.properties.cluster === clusterSeleccionado.cluster_id ? 0.5 : 0.25
                    })}
                    onEachFeature={(f, l) => {
                      const c = f.properties.cluster;
                      const info = clustersInfo.find(x => x.cluster_id === c);
                      l.bindPopup(`
                        <div style="font-family: sans-serif; font-size: 13px;">
                          <b>Cluster ${c}</b><br/>
                          ${f.properties.n_puntos} casos<br/>
                          ${info ? `Localidades: ${info.localidades}<br/>
                          Años: ${info.anio_min}-${info.anio_max}<br/>
                          Radios: ${info.n_radios}` : ''}
                        </div>
                      `);
                      l.on('click', () => info && seleccionarCluster(info));
                    }}
                  />
                )}
              </Overlay>

              <Overlay checked name="Puntos de Clusters">
                {casosFiltrados && (
                  <GeoJSON
                    key={`puntos-${clusterSeleccionado?.cluster_id || 'all'}-${clustersVisibles.size}`}
                    data={casosFiltrados}
                    pointToLayer={pointToLayer}
                    onEachFeature={onEachFeatureCaso}
                  />
                )}
              </Overlay>
            </LayersControl>
          </MapContainer>
        </div>

        {/* Panel lateral */}
        <div style={{ flex: 1, background: '#f8fafc', padding: 12, overflowY: 'auto', minWidth: 450 }}>
          {/* Toggles de capas */}
          <div style={{ background: 'white', padding: 12, borderRadius: 8, marginBottom: 12, border: '1px solid #e2e8f0' }}>
            <h4 style={{ marginTop: 0, fontSize: 14 }}>Capas</h4>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>
              <input type="checkbox" checked={mostrarHeatmap} onChange={e => setMostrarHeatmap(e.target.checked)} /> Mapa de calor
            </label>
            <label style={{ display: 'block', fontSize: 13 }}>
              <input type="checkbox" checked={mostrarAnimacion} onChange={e => setMostrarAnimacion(e.target.checked)} /> Animación temporal
            </label>
          </div>

          {exploracion && (
            <div style={{ background: 'white', padding: 12, borderRadius: 8, marginBottom: 12, border: '1px solid #e2e8f0' }}>
              <h4 style={{ marginTop: 0, fontSize: 14 }}>Exploración OPTICS</h4>
              <p style={{ fontSize: 13 }}><b>eps sugerido:</b> {exploracion.eps_espacial_sugerido_km} km</p>
              <p style={{ fontSize: 13 }}><b>min_samples sugerido:</b> {exploracion.min_samples_sugerido}</p>
              <p style={{ fontSize: 13 }}><b>Tiempo:</b> {exploracion.tiempo_ms?.toFixed(0)} ms</p>
              <div style={{ height: 140, marginTop: 8 }}>
                <ResponsiveContainer>
                  <LineChart data={exploracion.reachability_plot.filter(p => p.valor_km !== null)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="indice" />
                    <YAxis />
                    <Tooltip />
                    <Line dataKey="valor_km" stroke="#7c3aed" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {clustering && (
            <div style={{ background: 'white', padding: 12, borderRadius: 8, marginBottom: 12, border: '1px solid #e2e8f0' }}>
              <h4 style={{ marginTop: 0, fontSize: 14 }}>Resultado ST-DBSCAN</h4>
              <p style={{ fontSize: 13 }}><b>Clusters:</b> {clustering.n_clusters}</p>
              <p style={{ fontSize: 13 }}><b>Ruido:</b> {clustering.n_ruido} ({clustering.pct_ruido?.toFixed(1)}%)</p>
              <p style={{ fontSize: 13 }}><b>Tiempo:</b> {clustering.tiempo_ms?.toFixed(0)} ms</p>
            </div>
          )}

          {clustersInfo.length > 0 && (
            <div style={{ background: 'white', padding: 12, borderRadius: 8, marginBottom: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ marginTop: 0, fontSize: 14 }}>Clusters ({clustersInfo.length})</h4>
                <div style={{ fontSize: 11 }}>
                  <button onClick={() => toggleTodos(true)} style={{ background: '#e2e8f0', border: 'none', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', marginRight: 4 }}>Todos</button>
                  <button onClick={() => toggleTodos(false)} style={{ background: '#e2e8f0', border: 'none', padding: '2px 6px', borderRadius: 3, cursor: 'pointer' }}>Ninguno</button>
                </div>
              </div>
              <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                {clustersInfo.map((c) => (
                  <div key={c.cluster_id} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: 6,
                    borderBottom: '1px solid #f1f5f9',
                    background: clusterSeleccionado?.cluster_id === c.cluster_id ? '#e0e7ff' : 'transparent'
                  }}>
                    <input
                      type="checkbox"
                      checked={clustersVisibles.has(c.cluster_id)}
                      onChange={() => toggleCluster(c.cluster_id)}
                    />
                    <div
                      onClick={() => seleccionarCluster(c)}
                      style={{
                        flex: 1, cursor: 'pointer', paddingLeft: 4,
                        borderLeft: `4px solid ${colorCluster(c.cluster_id)}`,
                        fontSize: 12
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <b>Cluster {c.cluster_id}</b>
                        <span>{c.n_casos} casos</span>
                      </div>
                      <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                        {c.localidades} · {c.anio_min}-{c.anio_max}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {clusterSeleccionado && (
            <div style={{ background: '#eef2ff', padding: 12, borderRadius: 8, marginBottom: 12, border: '2px solid #6366f1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ marginTop: 0, fontSize: 14 }}>Detalle Cluster {clusterSeleccionado.cluster_id}</h4>
                <button
                  onClick={() => { setClusterSeleccionado(null); setCasosDelCluster([]); setRadiosDelCluster([]); setCentroMapa(null); }}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem' }}
                >×</button>
              </div>
              <p style={{ fontSize: 12 }}>
                <b>{clusterSeleccionado.n_casos} casos</b> en {clusterSeleccionado.n_radios} radios ·{' '}
                {clusterSeleccionado.n_localidades} localidad(es) · {clusterSeleccionado.n_eventos} evento(s)
              </p>
              <p style={{ fontSize: 11 }}>
                <b>Período:</b> {clusterSeleccionado.anio_min}-{clusterSeleccionado.anio_max}, sem {clusterSeleccionado.sem_min}-{clusterSeleccionado.sem_max}
              </p>
              <p style={{ fontSize: 11 }}>
                <b>Eventos:</b> {clusterSeleccionado.eventos}
              </p>

              {/* Radios del cluster */}
              {radiosDelCluster.length > 0 && (
                <>
                  <h5 style={{ marginTop: 10, marginBottom: 4, fontSize: 12 }}>Radios del cluster</h5>
                  <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 10, background: 'white', borderCollapse: 'collapse' }}>
                      <thead style={{ background: '#1e293b', color: 'white' }}>
                        <tr>
                          <th style={{ padding: 3, textAlign: 'left' }}>Radio</th>
                          <th style={{ padding: 3, textAlign: 'right' }}>Casos</th>
                          <th style={{ padding: 3, textAlign: 'right' }}>Carencias</th>
                        </tr>
                      </thead>
                      <tbody>
                        {radiosDelCluster.map((r) => (
                          <tr key={r.link} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: 3, fontFamily: 'monospace' }}>{r.link}</td>
                            <td style={{ padding: 3, textAlign: 'right', fontWeight: 'bold' }}>{r.casos}</td>
                            <td style={{ padding: 3, textAlign: 'right' }}>{r.carencias_sanitarias ? `${(r.carencias_sanitarias * 100).toFixed(1)}%` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* Casos del cluster */}
              <h5 style={{ marginTop: 10, marginBottom: 4, fontSize: 12 }}>Casos ({casosDelCluster.length})</h5>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: 10, background: 'white', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#1e293b', color: 'white', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: 3, textAlign: 'left' }}>ID</th>
                      <th style={{ padding: 3, textAlign: 'left' }}>Evento</th>
                      <th style={{ padding: 3, textAlign: 'left' }}>Radio</th>
                      <th style={{ padding: 3, textAlign: 'left' }}>Sem</th>
                      <th style={{ padding: 3, textAlign: 'left' }}>Año</th>
                    </tr>
                  </thead>
                  <tbody>
                    {casosDelCluster.map((c, i) => (
                      <tr key={c.id_caso} style={{ background: i % 2 ? '#f8fafc' : 'white', borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: 3 }}>{c.id_caso}</td>
                        <td style={{ padding: 3 }}>{c.evento}</td>
                        <td style={{ padding: 3, fontFamily: 'monospace' }}>{c.radio_censal_id}</td>
                        <td style={{ padding: 3 }}>{c.semana_epidemiologica}</td>
                        <td style={{ padding: 3 }}>{c.anio_epidemiologico}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
