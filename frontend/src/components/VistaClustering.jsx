import { Fragment, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, useMap } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import HeatmapLayer from './HeatmapLayer';
import HeatmapAnimation from './HeatmapAnimation';
import { colorPorEvento } from '../utils/eventos';

const { BaseLayer, Overlay } = LayersControl;
const STORAGE_KEY = 'clustering_resultados_v5';
const API = 'http://localhost:8000/api/v1/experimentos';

const ETIQUETAS_INDICES = [
  ['actividad', 'Actividad'],
  ['carencias_sanitarias', 'Carencias sanitarias'],
  ['demografia', 'Demografía'],
  ['educacion', 'Educación'],
  ['fuente_agua', 'Fuente de agua'],
  ['infraestructuta', 'Infraestructura'],
  ['salud', 'Salud'],
  ['indice_compuesto', 'Índice compuesto']
];

const formatoPct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`);

const leerGuardado = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
};

function CentrarEnCluster({ centro }) {
  const map = useMap();
  useEffect(() => {
    if (centro && centro[0] && centro[1]) {
      map.setView(centro, 13, { animate: true });
    }
  }, [centro, map]);
  return null;
}

function AjustarVista({ casos }) {
  const map = useMap();
  useEffect(() => {
    if (!casos?.features?.length) return;
    try {
      const bounds = L.geoJSON(casos).getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
    } catch (e) {
      console.error(e);
    }
  }, [casos, map]);
  return null;
}

function SeccionColapsable({
  titulo,
  children,
  defaultOpen = true,
  border = '1px solid #e2e8f0',
  background = 'white',
  extra = null
}) {
  const [abierta, setAbierta] = useState(defaultOpen);

  return (
    <div style={{ background, padding: 12, borderRadius: 8, marginBottom: 12, border }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={() => setAbierta(v => !v)}
          aria-expanded={abierta}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: 0,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            fontWeight: 'bold',
            fontSize: 14,
            color: '#0f172a'
          }}
        >
          <span style={{ fontSize: 12, color: '#64748b' }}>{abierta ? '▾' : '▸'}</span>
          <span>{titulo}</span>
        </button>
        {extra}
      </div>
      {abierta && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

export default function VistaClustering({ radiosGeoJson }) {
  const guardadoInicial = useMemo(() => leerGuardado(), []);
  const [minSamples, setMinSamples] = useState(guardadoInicial.minSamples ?? 5);
  const [maxEpsOptics, setMaxEpsOptics] = useState(guardadoInicial.maxEpsOptics ?? 20);
  const [epsTemporal, setEpsTemporal] = useState(guardadoInicial.epsTemporal ?? 2);
  const [exploracion, setExploracion] = useState(guardadoInicial.exploracion ?? null);
  const [clustering, setClustering] = useState(guardadoInicial.clustering ?? null);
  const [algoritmoActivo, setAlgoritmoActivo] = useState('stdbscan');
  const [resStknn, setResStknn] = useState(null);
  const [comparativa, setComparativa] = useState(null);
  const [loadingComp, setLoadingComp] = useState(false);
  const [casosGeoJson, setCasosGeoJson] = useState(null);
  const [clustersPoligonos, setClustersPoligonos] = useState(null);
  const [clustersInfo, setClustersInfo] = useState([]);
  const [clusterSeleccionado, setClusterSeleccionado] = useState(null);
  const [casosDelCluster, setCasosDelCluster] = useState([]);
  const [radiosDelCluster, setRadiosDelCluster] = useState([]);
  const [centroMapa, setCentroMapa] = useState(null);
  const [radioDetalle, setRadioDetalle] = useState(null);
  const [loading, setLoading] = useState(false);
  const indicesCache = useRef({});
  const [clustersVisibles, setClustersVisibles] = useState(new Set());
  const [mostrarHeatmap, setMostrarHeatmap] = useState(false);
  const [mostrarAnimacion, setMostrarAnimacion] = useState(false);
  const [filtroCiudad, setFiltroCiudad] = useState('');
  const [eventoSeleccionado, setEventoSeleccionado] = useState(null);

  const cargarTodo = useCallback(async (localidad = '') => {
    try {
      const cityQuery = localidad ? `?localidad=${encodeURIComponent(localidad)}` : '';
      const [resCasos, resPoligonos, resInfo] = await Promise.all([
        axios.get('http://localhost:8000/api/v1/experimentos/casos-geojson'),
        axios.get(`http://localhost:8000/api/v1/experimentos/clusters-poligonos${cityQuery}`).catch(() => ({ data: null })),
        axios.get(`http://localhost:8000/api/v1/experimentos/clusters-info${cityQuery}`).catch(() => ({ data: [] })),
      ]);
      setCasosGeoJson(resCasos.data);
      setClustersPoligonos(resPoligonos.data || null);
      const info = resInfo.data || [];
      setClustersInfo(info);
      // Inicializar todos visibles
      setClustersVisibles(new Set(info.map(c => c.cluster_id)));
    } catch (e) {
      console.error('Error cargando datos:', e);
    }
  }, []);

  useEffect(() => {
    void (async () => { await cargarTodo(); })();
  }, [cargarTodo]);

  const ejecutar = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        'http://localhost:8000/api/v1/experimentos/flujo-clustering',
        {
          params: {
            min_samples: minSamples,
            max_eps_optics: maxEpsOptics,
            eps_temporal_semanas: epsTemporal,
            ...(filtroCiudad ? { localidad: filtroCiudad } : {})
          }
        }
      );
      setExploracion(res.data.exploracion_optics);
      setClustering(res.data.clustering_final);
      setAlgoritmoActivo('stdbscan');
      await cargarTodo(filtroCiudad);
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

  const ejecutarStknn = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        'http://localhost:8000/api/v1/experimentos/flujo-clustering-stknn',
        {
          params: {
            k: minSamples + 1,
            radio_espacial_km: 10,
            radio_temporal_semanas: epsTemporal + 1,
            umbral_similaridad: 0.65,
            ...(filtroCiudad ? { localidad: filtroCiudad } : {})
          }
        }
      );
      setResStknn(res.data);
      setAlgoritmoActivo('stknn');
      setClustering(null);
      setExploracion(null);
    } catch (e) {
      console.error(e);
      alert('Error en ST-kNN');
    } finally {
      setLoading(false);
    }
  };

  const ejecutarComparativa = async () => {
    setLoadingComp(true);
    try {
      const res = await axios.get(
        'http://localhost:8000/api/v1/experimentos/comparativa-clustering',
        {
          params: {
            min_samples: minSamples,
            max_eps_optics: maxEpsOptics,
            eps_temporal_semanas: epsTemporal,
            ...(filtroCiudad ? { localidad: filtroCiudad } : {})
          }
        }
      );
      setComparativa(res.data);
    } catch (e) {
      console.error(e);
      alert('Error en comparativa');
    } finally {
      setLoadingComp(false);
    }
  };

  const limpiarDetalleCluster = () => {
    setClusterSeleccionado(null);
    setCasosDelCluster([]);
    setRadiosDelCluster([]);
    setRadioDetalle(null);
    setCentroMapa(null);
  };

  const seleccionarCluster = async (cluster) => {
    setClusterSeleccionado(cluster);
    setClustersVisibles(prev => new Set(prev).add(cluster.cluster_id));
    setRadioDetalle(null);
    if (cluster && cluster.centro_lat && cluster.centro_lon) {
      setCentroMapa([parseFloat(cluster.centro_lat), parseFloat(cluster.centro_lon)]);
    }
    try {
      const params = filtroCiudad ? { localidad: filtroCiudad } : {};
      const [resCasos, resRadios] = await Promise.all([
        axios.get(`http://localhost:8000/api/v1/experimentos/cluster-casos/${cluster.cluster_id}`, { params }),
        axios.get(`http://localhost:8000/api/v1/experimentos/cluster-radios/${cluster.cluster_id}`, { params }),
      ]);
      setCasosDelCluster(resCasos.data);
      setRadiosDelCluster(resRadios.data);
      setRadioDetalle(resRadios.data[0] ?? null);
    } catch (e) {
      console.error(e);
    }
  };

  const cerrarCluster = () => {
    limpiarDetalleCluster();
  };

  const toggleCluster = (id) => {
    if (clustersVisibles.has(id)) {
      const nuevo = new Set(clustersVisibles);
      nuevo.delete(id);
      setClustersVisibles(nuevo);
      if (clusterSeleccionado?.cluster_id === id) limpiarDetalleCluster();
      return;
    }
    const cluster = clustersInfo.find(c => c.cluster_id === id);
    if (cluster) seleccionarCluster(cluster);
  };

  const toggleTodos = (visible) => {
    if (visible) {
      setClustersVisibles(new Set(clustersInfo.map(c => c.cluster_id)));
    } else {
      setClustersVisibles(new Set());
      limpiarDetalleCluster();
    }
  };

  const limpiar = () => {
    localStorage.removeItem(STORAGE_KEY);
    setExploracion(null);
    setClustering(null);
    setResStknn(null);
    setComparativa(null);
    setAlgoritmoActivo('stdbscan');
    setClustersPoligonos(null);
    setClustersInfo([]);
    setClusterSeleccionado(null);
    setCasosDelCluster([]);
    setRadiosDelCluster([]);
    setRadioDetalle(null);
    setClustersVisibles(new Set());
    setFiltroCiudad('');
    setEventoSeleccionado(null);
    cargarTodo('');
  };

  const colorCluster = (c) => {
    if (c === null || c === undefined || c === -1) return '#94a3b8';
    return `hsl(${(c * 47) % 360}, 70%, 50%)`;
  };

  // Ciudades disponibles para el filtro
  const ciudadesDisponibles = useMemo(() => {
    const set = new Set();
    (casosGeoJson?.features || []).forEach(f => {
      const localidad = f.properties?.localidad;
      if (localidad) set.add(localidad);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [casosGeoJson]);

  // Casos de la ciudad seleccionada (o todos si no hay filtro)
  const casosCiudad = useMemo(() => {
    if (!casosGeoJson) return null;
    return {
      ...casosGeoJson,
      features: casosGeoJson.features.filter(f => {
        if (!filtroCiudad) return true;
        return f.properties?.localidad === filtroCiudad;
      })
    };
  }, [casosGeoJson, filtroCiudad]);

  const enfermedadesResumen = useMemo(() => {
    const mapa = new Map();
    (casosCiudad?.features || []).forEach(f => {
      const evento = f.properties?.evento || 'Sin tipo de enfermedad';
      mapa.set(evento, (mapa.get(evento) || 0) + 1);
    });
    return [...mapa.entries()]
      .map(([evento, casos]) => ({ evento, casos }))
      .sort((a, b) => b.casos - a.casos || a.evento.localeCompare(b.evento, 'es'));
  }, [casosCiudad]);

  // Casos y clusters que contienen el evento seleccionado
  const casosPorEvento = useMemo(() => {
    if (!casosCiudad) return null;
    if (!eventoSeleccionado) return casosCiudad;
    return {
      ...casosCiudad,
      features: casosCiudad.features.filter(f => f.properties?.evento === eventoSeleccionado)
    };
  }, [casosCiudad, eventoSeleccionado]);

  const clustersConEvento = useMemo(() => {
    const ids = new Set();
    (casosPorEvento?.features || []).forEach(f => {
      const c = f.properties?.cluster_stdbscan;
      if (c !== null && c !== undefined && c !== -1) ids.add(c);
    });
    return ids;
  }, [casosPorEvento]);

  const clustersInfoVisibles = useMemo(() => {
    if (!eventoSeleccionado) return clustersInfo;
    return clustersInfo.filter(c => clustersConEvento.has(c.cluster_id));
  }, [clustersInfo, clustersConEvento, eventoSeleccionado]);

  // Filtrar polígonos y puntos según evento y visibilidad (checks del panel)
  const poligonosFiltrados = useMemo(() => {
    if (!clustersPoligonos) return null;
    return {
      type: 'FeatureCollection',
      features: clustersPoligonos.features.filter(f => {
        const id = f.properties.cluster;
        if (eventoSeleccionado && !clustersConEvento.has(id)) return false;
        return clustersVisibles.has(id);
      })
    };
  }, [clustersPoligonos, clustersVisibles, eventoSeleccionado, clustersConEvento]);

  const casosFiltrados = useMemo(() => {
    if (!casosCiudad) return null;
    return {
      type: 'FeatureCollection',
      features: casosCiudad.features.filter(f => {
        if (eventoSeleccionado && f.properties?.evento !== eventoSeleccionado) return false;
        const c = f.properties.cluster_stdbscan;
        if ((clusterSeleccionado || clustersVisibles.size !== clustersInfo.length) && (c === null || c === -1)) return false;
        return c === null || c === -1 || clustersVisibles.has(c);
      })
    };
  }, [casosCiudad, clustersVisibles, clustersInfo.length, clusterSeleccionado, eventoSeleccionado]);

  // Radios censales visibles: de la ciudad o del cluster seleccionado
  const radiosMostrados = useMemo(() => {
    if (!radiosGeoJson) return null;
    const usarFiltrados = filtroCiudad || clusterSeleccionado || eventoSeleccionado
      || clustersVisibles.size !== clustersInfo.length;
    const fuente = usarFiltrados ? casosFiltrados : null;
    if (!fuente) return radiosGeoJson;
    const ids = new Set(
      (fuente.features || [])
        .map(f => f.properties?.radio_censal_id)
        .filter(Boolean)
        .map(String)
    );
    return {
      ...radiosGeoJson,
      features: radiosGeoJson.features.filter(f => ids.has(String(f.properties?.link ?? '')))
    };
  }, [radiosGeoJson, casosFiltrados, filtroCiudad, clusterSeleccionado, eventoSeleccionado, clustersVisibles, clustersInfo.length]);

  const puntosHeatmap = useMemo(() => {
    if (!casosFiltrados) return [];
    return casosFiltrados.features.map(f => [
      f.geometry.coordinates[1],
      f.geometry.coordinates[0],
      1
    ]);
  }, [casosFiltrados]);

  const enfermedadesCluster = useMemo(() => {
    if (!clusterSeleccionado || !casosCiudad) return [];
    const mapa = new Map();
    casosCiudad.features
      .filter(f => f.properties.cluster_stdbscan === clusterSeleccionado.cluster_id)
      .forEach(f => {
        const evento = f.properties?.evento || 'Sin tipo de enfermedad';
        mapa.set(evento, (mapa.get(evento) || 0) + 1);
      });
    return [...mapa.entries()]
      .map(([evento, casos]) => ({ evento, casos }))
      .sort((a, b) => b.casos - a.casos || a.evento.localeCompare(b.evento, 'es'));
  }, [clusterSeleccionado, casosCiudad]);

  const casosDelClusterFiltrados = useMemo(() => (
    eventoSeleccionado
      ? casosDelCluster.filter(c => c.evento === eventoSeleccionado)
      : casosDelCluster
  ), [casosDelCluster, eventoSeleccionado]);

  const pointToLayer = (feature, latlng) => {
    const c = feature.properties.cluster_stdbscan;
    const destacado = clusterSeleccionado && c === clusterSeleccionado.cluster_id;
    return L.circleMarker(latlng, {
      radius: destacado ? 8 : 5,
      fillColor: colorPorEvento(feature.properties.evento),
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

  const cargarIndicesRadio = async (link) => {
    if (indicesCache.current[link] !== undefined) return indicesCache.current[link];
    try {
      const res = await axios.get(`${API}/radio-indices/${encodeURIComponent(link)}`);
      indicesCache.current[link] = res.data;
      return res.data;
    } catch (e) {
      console.error('Error cargando índices del radio:', e);
      return null;
    }
  };

  const seleccionarRadio = async (link) => {
    const existente = radiosDelCluster.find(
      r => String(r.link ?? r.radio_censal_id) === link
    );
    if (existente) {
      setRadioDetalle(existente);
      return;
    }
    const data = await cargarIndicesRadio(link);
    if (data) setRadioDetalle({ ...data, ...(data.indices || {}), radio_censal_id: data.link });
  };

  const onEachRadio = (f, layer) => {
    const link = String(f.properties?.link ?? '');
    layer.on('click', () => { seleccionarRadio(link); });
  };

  const estiloRadio = () => {
    if (clusterSeleccionado) {
      return { color: '#7c3aed', weight: 1.6, fillColor: '#8b5cf6', fillOpacity: 0.22 };
    }
    return { color: '#1d4ed8', weight: 1, fillOpacity: 0.08 };
  };

  const contenidoIndicesRadio = (radio) => (
    <>
      <p style={{ fontSize: 11, margin: '4px 0' }}>
        <b>Localidad:</b> {radio.localidad || '—'} · <b>Casos:</b> {radio.casos ?? 0}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '3px 10px', fontSize: 10 }}>
        {ETIQUETAS_INDICES.map(([clave, etiqueta]) => (
          <Fragment key={clave}>
            <span style={{ color: '#475569' }}>{etiqueta}</span>
            <b style={{ textAlign: 'right' }}>{formatoPct(radio[clave])}</b>
          </Fragment>
        ))}
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Barra superior */}
      <div style={{
        padding: 12, background: '#1e293b', color: 'white',
        display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 13
      }}>
        <label>min_samples/k: <input type="number" value={minSamples} onChange={e => setMinSamples(+e.target.value)} style={{ width: 55 }} /></label>
        <label>max_eps: <input type="number" value={maxEpsOptics} onChange={e => setMaxEpsOptics(+e.target.value)} style={{ width: 55 }} /></label>
        <label>Δt (semanas): <input type="number" value={epsTemporal} onChange={e => setEpsTemporal(+e.target.value)} style={{ width: 50 }} /></label>
        <label>Ciudad:{' '}
          <select
            value={filtroCiudad}
            onChange={(e) => {
              const valor = e.target.value;
              setFiltroCiudad(valor);
              setClusterSeleccionado(null);
              setCasosDelCluster([]);
              setRadiosDelCluster([]);
              setRadioDetalle(null);
              setCentroMapa(null);
              setClustersPoligonos(null);
              setClustersInfo([]);
              setClustersVisibles(new Set());
              setEventoSeleccionado(null);
              cargarTodo(valor);
            }}
            style={{ padding: '5px 6px', borderRadius: 4, minWidth: 160 }}
          >
            <option value="">Todas las ciudades</option>
            {ciudadesDisponibles.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        {eventoSeleccionado && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: colorPorEvento(eventoSeleccionado), color: '#111827',
            padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 'bold'
          }}>
            {eventoSeleccionado}
            <button
              onClick={() => setEventoSeleccionado(null)}
              aria-label="Quitar filtro de evento"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 'bold' }}
            >×</button>
          </span>
        )}
        <button onClick={ejecutar} disabled={loading} style={{
          background: '#7c3aed', color: 'white', border: 'none',
          padding: '6px 12px', borderRadius: 4, cursor: 'pointer'
        }}>
          {loading && algoritmoActivo !== 'stknn' ? 'Ejecutando...' : '▶ OPTICS → ST-DBSCAN'}
        </button>
        <button onClick={ejecutarStknn} disabled={loading} style={{
          background: '#059669', color: 'white', border: 'none',
          padding: '6px 12px', borderRadius: 4, cursor: 'pointer'
        }}>
          {loading && algoritmoActivo === 'stknn' ? 'Ejecutando...' : '▶ ST-kNN (Vecinos Cercanos Espacio-Temporal)'}
        </button>
        <button onClick={ejecutarComparativa} disabled={loadingComp} style={{
          background: '#ea580c', color: 'white', border: 'none',
          padding: '6px 12px', borderRadius: 4, cursor: 'pointer'
        }}>
          {loadingComp ? 'Comparando...' : '📊 Comparativa de Métricas'}
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
            <AjustarVista casos={casosCiudad} />
            <LayersControl position="topright">
              <BaseLayer checked name="OpenStreetMap">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              </BaseLayer>
              <BaseLayer name="Satélite">
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              </BaseLayer>
              <BaseLayer name="Sin Mapa Base"><TileLayer url="" /></BaseLayer>

              <Overlay checked name={clusterSeleccionado ? 'Radios del cluster' : 'Radios Censales'}>
                {radiosMostrados && (
                  <GeoJSON
                    key={`radios-${filtroCiudad || 'todas'}-${clusterSeleccionado?.cluster_id || 'all'}-${eventoSeleccionado || 'todos'}`}
                    data={radiosMostrados}
                    style={estiloRadio}
                    onEachFeature={onEachRadio}
                  />
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
                    key={`${JSON.stringify(Array.from(clustersVisibles))}-${clusterSeleccionado?.cluster_id || 'all'}-${eventoSeleccionado || 'todos'}`}
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
                    }}
                  />
                )}
              </Overlay>

              <Overlay checked name="Puntos de Clusters">
                {casosFiltrados && (
                  <GeoJSON
                    key={`puntos-${filtroCiudad || 'todas'}-${clusterSeleccionado?.cluster_id || 'all'}-${eventoSeleccionado || 'todos'}-${clustersVisibles.size}-${casosFiltrados.features.length}`}
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
          <SeccionColapsable titulo="Capas">
            <label style={{ display: 'block', fontSize: 13, marginBottom: 6 }}>
              <input type="checkbox" checked={mostrarHeatmap} onChange={e => setMostrarHeatmap(e.target.checked)} /> Mapa de calor
            </label>
            <label style={{ display: 'block', fontSize: 13 }}>
              <input type="checkbox" checked={mostrarAnimacion} onChange={e => setMostrarAnimacion(e.target.checked)} /> Animación temporal
            </label>
          </SeccionColapsable>

          {enfermedadesResumen.length > 0 && (
            <SeccionColapsable
              titulo={`Enfermedades (${enfermedadesResumen.length})${filtroCiudad ? ` · ${filtroCiudad}` : ''}`}
              extra={eventoSeleccionado ? (
                <button
                  onClick={() => setEventoSeleccionado(null)}
                  style={{ background: '#e2e8f0', border: 'none', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', fontSize: 11 }}
                >Todas</button>
              ) : null}
            >
              <div style={{ maxHeight: 190, overflowY: 'auto' }}>
                {enfermedadesResumen.map(({ evento, casos }) => {
                  const activo = eventoSeleccionado === evento;
                  return (
                    <div
                      key={evento}
                      onClick={() => setEventoSeleccionado(activo ? null : evento)}
                      title={activo ? 'Quitar filtro de evento' : 'Filtrar el mapa por este evento'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 7, padding: '4px 4px',
                        borderBottom: '1px solid #f1f5f9', fontSize: 12,
                        cursor: 'pointer', background: activo ? '#e0e7ff' : 'transparent',
                        fontWeight: activo ? 'bold' : 'normal'
                      }}
                    >
                      <span style={{
                        width: 11, height: 11, borderRadius: '50%',
                        background: colorPorEvento(evento), border: '1px solid #111827', flexShrink: 0
                      }} />
                      <span style={{ flex: 1 }}>{evento}</span>
                      <b>{casos}</b>
                    </div>
                  );
                })}
              </div>
            </SeccionColapsable>
          )}

          {exploracion && (
            <SeccionColapsable titulo="Exploración OPTICS">
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
            </SeccionColapsable>
          )}

          {clustering && (
            <SeccionColapsable titulo="Resultado ST-DBSCAN (OPTICS → ST-DBSCAN)">
              <p style={{ fontSize: 13 }}><b>Clusters:</b> {clustering.n_clusters}</p>
              <p style={{ fontSize: 13 }}><b>Ruido:</b> {clustering.n_ruido} ({clustering.pct_ruido?.toFixed(1)}%)</p>
              <p style={{ fontSize: 13 }}><b>Tiempo:</b> {clustering.tiempo_ms?.toFixed(0)} ms</p>
              {clustering.params && (
                <p style={{ fontSize: 11, color: '#475569' }}>
                  eps_esp:{clustering.params.eps_espacial_km}km | Δt:{clustering.params.eps_temporal_semanas}sem | min:{clustering.params.min_samples}
                </p>
              )}
            </SeccionColapsable>
          )}

          {resStknn && (
            <SeccionColapsable titulo="Resultado ST-kNN (Vecinos Cercanos Espacio-Temporal)" border="2px solid #059669">
              <p style={{ fontSize: 13 }}><b>Clusters:</b> {resStknn.n_clusters}</p>
              <p style={{ fontSize: 13 }}><b>Ruido:</b> {resStknn.n_ruido} ({resStknn.pct_ruido?.toFixed(1)}%)</p>
              <p style={{ fontSize: 13 }}><b>Tiempo:</b> {resStknn.tiempo_ms?.toFixed(0)} ms</p>
              {resStknn.params && (
                <p style={{ fontSize: 11, color: '#475569' }}>
                  k:{resStknn.params.k} | radio_esp:{resStknn.params.radio_espacial_km}km | Δt:{resStknn.params.radio_temporal_semanas}sem | umbral:{resStknn.params.umbral_similaridad}
                </p>
              )}
              {resStknn.metricas && (
                <div style={{ marginTop: 8, padding: 8, background: '#f0fdf4', borderRadius: 6 }}>
                  <b style={{ fontSize: 12 }}>Métricas</b>
                  {resStknn.metricas.silhouette_score !== null && resStknn.metricas.silhouette_score !== undefined && (
                    <p style={{ fontSize: 11, margin: '2px 0' }}>Silhouette: {resStknn.metricas.silhouette_score}</p>
                  )}
                  {resStknn.metricas.calinski_harabasz_score && (
                    <p style={{ fontSize: 11, margin: '2px 0' }}>Calinski-Harabasz: {resStknn.metricas.calinski_harabasz_score}</p>
                  )}
                  {resStknn.metricas.davies_bouldin_score && (
                    <p style={{ fontSize: 11, margin: '2px 0' }}>Davies-Bouldin: {resStknn.metricas.davies_bouldin_score}</p>
                  )}
                  {resStknn.metricas.cohesion_espacial_promedio_km && (
                    <p style={{ fontSize: 11, margin: '2px 0' }}>Cohesión espacial prom.: {resStknn.metricas.cohesion_espacial_promedio_km} km</p>
                  )}
                  <p style={{ fontSize: 11, margin: '2px 0' }}>Ratio clusterizado: {(resStknn.metricas.ratio_clusterizado * 100).toFixed(1)}%</p>
                </div>
              )}
            </SeccionColapsable>
          )}

          {comparativa && (
            <SeccionColapsable titulo="Comparativa de Algoritmos" border="2px solid #ea580c">
              <p style={{ fontSize: 12, color: '#ea580c', fontWeight: 'bold' }}>{comparativa.recomendacion}</p>
              <div style={{ height: 180, marginTop: 8 }}>
                <ResponsiveContainer>
                  <BarChart data={Object.entries(comparativa.comparativa_metricas).map(([alg, m]) => ({
                    algoritmo: alg,
                    clusters: m.n_clusters || 0,
                    ruido_pct: m.pct_ruido || 0,
                    silhouette: m.silhouette_score || 0
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="algoritmo" tick={{ fontSize: 9 }} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="clusters" fill="#7c3aed" name="N° Clusters" />
                    <Bar dataKey="ruido_pct" fill="#dc2626" name="% Ruido" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ marginTop: 10 }}>
                {Object.entries(comparativa.comparativa_metricas).map(([alg, m]) => (
                  <div key={alg} style={{ padding: 6, marginBottom: 6, background: '#f8fafc', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                    <b style={{ fontSize: 12 }}>{alg}</b>
                    <div style={{ fontSize: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginTop: 2 }}>
                      <span>Clusters: {m.n_clusters}</span>
                      <span>Ruido: {m.pct_ruido}%</span>
                      <span>Tiempo: {m.tiempo_ms?.toFixed(0)}ms</span>
                      <span>Silhouette: {m.silhouette_score ?? 'N/A'}</span>
                      <span>CH: {m.calinski_harabasz_score ?? 'N/A'}</span>
                      <span>DB: {m.davies_bouldin_score ?? 'N/A'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </SeccionColapsable>
          )}

          {clustersInfo.length > 0 && (
            <SeccionColapsable
              titulo={`Clusters (${clustersInfoVisibles.length}${eventoSeleccionado ? ` de ${clustersInfo.length}` : ''})`}
              extra={(
                <div style={{ fontSize: 11 }}>
                  <button onClick={() => toggleTodos(true)} style={{ background: '#e2e8f0', border: 'none', padding: '2px 6px', borderRadius: 3, cursor: 'pointer', marginRight: 4 }}>Todos</button>
                  <button onClick={() => toggleTodos(false)} style={{ background: '#e2e8f0', border: 'none', padding: '2px 6px', borderRadius: 3, cursor: 'pointer' }}>Ninguno</button>
                </div>
              )}
            >
              <div style={{ maxHeight: 600, overflowY: 'auto' }}>
                {clustersInfoVisibles.map((c) => {
                  const seleccionado = clusterSeleccionado?.cluster_id === c.cluster_id;
                  return (
                    <Fragment key={c.cluster_id}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: 6,
                        borderBottom: '1px solid #f1f5f9',
                        background: seleccionado ? '#e0e7ff' : 'transparent'
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

                      {seleccionado && (
                        <div style={{
                          background: '#eef2ff', border: '1px solid #6366f1',
                          borderRadius: 6, padding: 10, margin: '2px 0 10px 20px'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <b style={{ fontSize: 12 }}>Detalle del cluster {c.cluster_id}</b>
                            <button
                              onClick={cerrarCluster}
                              aria-label="Cerrar detalle del cluster"
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.1rem' }}
                            >×</button>
                          </div>
                          <p style={{ fontSize: 11, margin: '4px 0' }}>
                            <b>{c.n_casos} casos</b> en {c.n_radios} radios ·{' '}
                            {c.n_localidades} localidad(es) · {c.n_eventos} evento(s)
                          </p>
                          <p style={{ fontSize: 10, margin: '2px 0' }}>
                            <b>Período:</b> {c.anio_min}-{c.anio_max}, sem {c.sem_min}-{c.sem_max}
                          </p>
                          <p style={{ fontSize: 10, margin: '2px 0' }}>
                            <b>Eventos:</b> {c.eventos}
                          </p>

                          {enfermedadesCluster.length > 0 && (
                            <>
                              <h5 style={{ margin: '8px 0 3px', fontSize: 11 }}>Enfermedades</h5>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                {enfermedadesCluster.map(({ evento, casos }) => {
                                  const activo = eventoSeleccionado === evento;
                                  return (
                                    <div
                                      key={evento}
                                      onClick={() => setEventoSeleccionado(activo ? null : evento)}
                                      title={activo ? 'Quitar filtro de evento' : 'Filtrar el mapa por este evento'}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 6, fontSize: 10,
                                        cursor: 'pointer', padding: '1px 3px', borderRadius: 4,
                                        background: activo ? '#c7d2fe' : 'transparent',
                                        fontWeight: activo ? 'bold' : 'normal'
                                      }}
                                    >
                                      <span style={{
                                        width: 9, height: 9, borderRadius: '50%',
                                        background: colorPorEvento(evento), border: '1px solid #111827', flexShrink: 0
                                      }} />
                                      <span style={{ flex: 1 }}>{evento}</span>
                                      <b>{casos}</b>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          )}

                          {radiosDelCluster.length > 0 && (
                            <>
                              <h5 style={{ margin: '8px 0 3px', fontSize: 11 }}>
                                Radios del cluster
                                <span style={{ fontWeight: 'normal', color: '#64748b' }}> · índices visibles abajo</span>
                              </h5>
                              <div style={{ maxHeight: 140, overflowY: 'auto' }}>
                                <table style={{ width: '100%', fontSize: 10, background: 'white', borderCollapse: 'collapse' }}>
                                  <thead style={{ background: '#1e293b', color: 'white', position: 'sticky', top: 0 }}>
                                    <tr>
                                      <th style={{ padding: 3, textAlign: 'left' }}>Radio</th>
                                      <th style={{ padding: 3, textAlign: 'right' }}>Casos</th>
                                      <th style={{ padding: 3, textAlign: 'right' }}>Carencias</th>
                                      <th style={{ padding: 3, textAlign: 'right' }}>Índice</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {radiosDelCluster.map((r) => {
                                      const link = r.link ?? r.radio_censal_id;
                                      const activo = (radioDetalle?.link ?? radioDetalle?.radio_censal_id) === link;
                                      return (
                                        <tr
                                          key={link}
                                          onClick={() => setRadioDetalle(r)}
                                          style={{
                                            borderBottom: '1px solid #f1f5f9',
                                            cursor: 'pointer',
                                            background: activo ? '#e0e7ff' : 'transparent'
                                          }}
                                        >
                                          <td style={{ padding: 3, fontFamily: 'monospace' }}>{link}</td>
                                          <td style={{ padding: 3, textAlign: 'right', fontWeight: 'bold' }}>{r.casos}</td>
                                          <td style={{ padding: 3, textAlign: 'right' }}>{formatoPct(r.carencias_sanitarias)}</td>
                                          <td style={{ padding: 3, textAlign: 'right' }}>{formatoPct(r.indice_compuesto)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {radioDetalle && (
                                <div style={{
                                  marginTop: 6, padding: 8, borderRadius: 6,
                                  background: 'white', border: '1px solid #0ea5e9'
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <b style={{ fontSize: 11 }}>Índices del radio {radioDetalle.link ?? radioDetalle.radio_censal_id}</b>
                                    <button
                                      onClick={() => setRadioDetalle(null)}
                                      aria-label="Cerrar índices del radio"
                                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13 }}
                                    >×</button>
                                  </div>
                                  {contenidoIndicesRadio(radioDetalle)}
                                </div>
                              )}
                            </>
                          )}

                          <h5 style={{ margin: '8px 0 3px', fontSize: 11 }}>Casos ({casosDelClusterFiltrados.length})</h5>
                          <div style={{ maxHeight: 180, overflowY: 'auto' }}>
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
                                {casosDelClusterFiltrados.map((caso, i) => (
                                  <tr key={caso.id_caso} style={{ background: i % 2 ? '#f8fafc' : 'white', borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: 3 }}>{caso.id_caso}</td>
                                    <td style={{ padding: 3 }}>{caso.evento}</td>
                                    <td style={{ padding: 3, fontFamily: 'monospace' }}>{caso.radio_censal_id}</td>
                                    <td style={{ padding: 3 }}>{caso.semana_epidemiologica}</td>
                                    <td style={{ padding: 3 }}>{caso.anio_epidemiologico}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </SeccionColapsable>
          )}

          {radioDetalle && !clusterSeleccionado && (
            <SeccionColapsable
              titulo={`Radio ${radioDetalle.link ?? radioDetalle.radio_censal_id}`}
              border="2px solid #0ea5e9"
              background="#f0f9ff"
              extra={(
                <button
                  onClick={() => setRadioDetalle(null)}
                  aria-label="Cerrar información del radio"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem' }}
                >×</button>
              )}
            >
              {contenidoIndicesRadio(radioDetalle)}
            </SeccionColapsable>
          )}
        </div>
      </div>
    </div>
  );
}
