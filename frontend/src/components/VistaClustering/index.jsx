import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';

import { API, STORAGE_KEY } from './constants';
import { leerCluster, leerGuardado, construirEstadoDesdeConfiguracion } from './helpers';
import BarraControles from './BarraControles';
import MapaClusters from './MapaClusters';
import PanelLateral from './PanelLateral';
import ModalRadiosCluster from './ModalRadiosCluster';

function aplicarJitter(geojson) {
  if (!geojson || !geojson.features) return null;
  const grupos = {};
  geojson.features.forEach(f => {
    const [lon, lat] = f.geometry.coordinates;
    const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(f);
  });
  const featuresResultado = [];
  Object.values(grupos).forEach(grupo => {
    const n = grupo.length;
    if (n === 1) { featuresResultado.push(grupo[0]); return; }
    const radioJitter = 0.00015 * Math.sqrt(n) / 2;
    grupo.forEach((f, i) => {
      const angulo = (2 * Math.PI * i) / n;
      const dLon = radioJitter * Math.cos(angulo);
      const dLat = radioJitter * Math.sin(angulo);
      const [lonOrig, latOrig] = f.geometry.coordinates;
      featuresResultado.push({
        ...f,
        geometry: { type: 'Point', coordinates: [lonOrig + dLon, latOrig + dLat] },
        properties: { ...f.properties, _jitter_aplicado: true }
      });
    });
  });
  return { type: 'FeatureCollection', features: featuresResultado };
}

// Leer estado guardado en sessionStorage al iniciar
const getSessionState = () => {
  try {
    const saved = sessionStorage.getItem('clustering_session_state');
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
};

export default function VistaClustering({ radiosGeoJson }) {
  const savedState = useMemo(() => getSessionState(), []);
  const guardadoInicial = useMemo(() => leerGuardado(STORAGE_KEY), []);

  const [minSamples, setMinSamples] = useState(savedState.minSamples ?? 5);
  const [maxEpsOptics, setMaxEpsOptics] = useState(savedState.maxEpsOptics ?? 20);
  const [epsTemporal, setEpsTemporal] = useState(savedState.epsTemporal ?? 2);

  const [exploracion, setExploracion] = useState(null);
  const [clustering, setClustering] = useState(null);
  const [loadingDbscan, setLoadingDbscan] = useState(false);

  const [casosGeoJson, setCasosGeoJson] = useState(null);
  const [clustersPoligonos, setClustersPoligonos] = useState(null);
  const [clustersInfo, setClustersInfo] = useState([]);
  const [modoMapa, setModoMapa] = useState('clusters');
  
  const [clusterSeleccionado, setClusterSeleccionado] = useState(savedState.clusterSeleccionado ?? null);
  const [casosDelCluster, setCasosDelCluster] = useState([]);
  const [radiosDelCluster, setRadiosDelCluster] = useState([]);
  const [modalRadiosAbierto, setModalRadiosAbierto] = useState(false);
  
  const [radioDetalle, setRadioDetalle] = useState(null);
  const [centroMapa, setCentroMapa] = useState(null);
  const [clustersVisibles, setClustersVisibles] = useState(new Set());

  const [filtroCiudad, setFiltroCiudad] = useState(savedState.filtroCiudad ?? '');
  const [eventoSeleccionado, setEventoSeleccionado] = useState(savedState.eventoSeleccionado ?? null);
  const [mostrarHeatmap, setMostrarHeatmap] = useState(savedState.mostrarHeatmap ?? false);
  const [mostrarAnimacion, setMostrarAnimacion] = useState(savedState.mostrarAnimacion ?? false);

  const [configActiva, setConfigActiva] = useState(null);
  const indicesCache = useRef({});

  // GUARDAR ESTADO EN sessionStorage
  useEffect(() => {
    const stateToSave = {
      filtroCiudad,
      eventoSeleccionado,
      mostrarHeatmap,
      mostrarAnimacion,
      minSamples,
      maxEpsOptics,
      epsTemporal,
      clusterSeleccionado
    };
    sessionStorage.setItem('clustering_session_state', JSON.stringify(stateToSave));
  }, [filtroCiudad, eventoSeleccionado, mostrarHeatmap, mostrarAnimacion, minSamples, maxEpsOptics, epsTemporal, clusterSeleccionado]);

  const cargarTodo = useCallback(async (localidad = '') => {
    try {
      const q = localidad ? `?localidad=${encodeURIComponent(localidad)}` : '';
      const [resCasos, resPol, resInfo] = await Promise.all([
        axios.get(`${API}/casos-geojson`),
        axios.get(`${API}/clusters-poligonos${q}`).catch(() => ({ data: null })),
        axios.get(`${API}/clusters-info${q}`).catch(() => ({ data: [] })),
      ]);
      setCasosGeoJson(resCasos.data);
      setClustersPoligonos(resPol.data || null);
      const info = resInfo.data || [];
      setClustersInfo(info);
      
      if (!clusterSeleccionado) {
        setClustersVisibles(new Set(info.map((c) => c.cluster_id)));
      }
      
      setModoMapa('clusters');
    } catch (e) { console.error('Error cargando datos:', e); }
  }, [clusterSeleccionado]);

  useEffect(() => { void cargarTodo(filtroCiudad); }, [cargarTodo, filtroCiudad]);

  useEffect(() => {
    if (clusterSeleccionado && !radiosDelCluster.length) {
      seleccionarCluster(clusterSeleccionado);
    }
  }, [clusterSeleccionado, radiosDelCluster.length]);

  const aplicarConfiguracion = useCallback((cfg) => {
    const estado = construirEstadoDesdeConfiguracion(cfg);
    setConfigActiva(cfg);
    setCasosGeoJson(estado.casos);
    setClustersPoligonos(estado.poligonos);
    setClustersInfo(estado.clusters);
    setClustersVisibles(new Set(estado.clusters.map((c) => c.cluster_id)));
    setModoMapa(estado.modoMapa);
    setFiltroCiudad(estado.localidad);
    setEventoSeleccionado(null);
    setClusterSeleccionado(null);
    setCasosDelCluster([]);
    setRadiosDelCluster([]);
    setRadioDetalle(null);
    setCentroMapa(null);
    setClustering({ ...estado.resumen, params: estado.params });
    setExploracion(estado.exploracion);
  }, []);

  const ejecutar = async () => {
    if (!filtroCiudad) { alert('Seleccioná una ciudad antes de ejecutar el clustering.'); return; }
    setLoadingDbscan(true);
    try {
      const res = await axios.get(`${API}/flujo-clustering`, {
        params: { min_samples: minSamples, max_eps_optics: maxEpsOptics, eps_temporal_semanas: epsTemporal, localidad: filtroCiudad },
      });
      setExploracion(res.data.exploracion_optics);
      setClustering(res.data.clustering_final);
      if (res.data.configuracion) aplicarConfiguracion(res.data.configuracion);
      else await cargarTodo(filtroCiudad);
    } catch (err) {
      alert(err?.response?.data?.detail || err?.message || 'Error en clustering');
    } finally { setLoadingDbscan(false); }
  };

  const cambiarCiudad = async (valor) => {
    setFiltroCiudad(valor); setConfigActiva(null); setClusterSeleccionado(null);
    setCasosDelCluster([]); setRadiosDelCluster([]); setRadioDetalle(null); setCentroMapa(null);
    setClustersPoligonos(null); setClustersInfo([]); setClustersVisibles(new Set()); setEventoSeleccionado(null);
    setClustering(null); setExploracion(null);
    await cargarTodo(valor);
  };

  const limpiar = () => {
    sessionStorage.removeItem('clustering_session_state');
    localStorage.removeItem(STORAGE_KEY); 
    setConfigActiva(null); setExploracion(null); setClustering(null);
    setClustersPoligonos(null); setClustersInfo([]); setClusterSeleccionado(null); setCasosDelCluster([]);
    setRadiosDelCluster([]); setRadioDetalle(null); setClustersVisibles(new Set()); setFiltroCiudad('');
    setEventoSeleccionado(null); setModoMapa('clusters'); 
    cargarTodo('');
  };

  const seleccionarCluster = async (cluster) => {
    setClusterSeleccionado(cluster);
    setClustersVisibles((prev) => new Set(prev).add(cluster.cluster_id));
    setRadioDetalle(null);
    if (cluster?.centro_lat && cluster?.centro_lon) setCentroMapa([parseFloat(cluster.centro_lat), parseFloat(cluster.centro_lon)]);
    
    if (configActiva) {
      const features = (configActiva.casos?.features || []).filter((f) => leerCluster(f) === cluster.cluster_id);
      setCasosDelCluster(features.map((f) => f.properties));
      setRadiosDelCluster(cluster.radios || []);
      return;
    }
    try {
      const params = filtroCiudad ? { localidad: filtroCiudad } : {};
      const [resCasos, resRadios] = await Promise.all([
        axios.get(`${API}/cluster-casos/${cluster.cluster_id}`, { params }),
        axios.get(`${API}/cluster-radios/${cluster.cluster_id}`, { params }),
      ]);
      setCasosDelCluster(resCasos.data);
      setRadiosDelCluster(resRadios.data);
    } catch (e) { console.error(e); }
  };

  const seleccionarRadio = async (link) => {
    if (indicesCache.current[link] !== undefined) return setRadioDetalle(indicesCache.current[link]);
    try {
      const res = await axios.get(`${API}/radio-indices/${encodeURIComponent(link)}`);
      indicesCache.current[link] = { ...res.data, ...(res.data.indices || {}) };
      setRadioDetalle(indicesCache.current[link]);
    } catch (e) { console.error(e); }
  };

  const casosUniverso = useMemo(() => {
    if (!casosGeoJson?.features || !filtroCiudad) return 0;
    return casosGeoJson.features.filter((f) => f.properties?.localidad === filtroCiudad).length;
  }, [casosGeoJson, filtroCiudad]);

  const casosCiudad = useMemo(() => {
    if (!casosGeoJson) return null;
    return { ...casosGeoJson, features: casosGeoJson.features.filter((f) => !filtroCiudad || f.properties?.localidad === filtroCiudad) };
  }, [casosGeoJson, filtroCiudad]);

  // ARREGLO DEL FILTRO DE ENFERMEDAD
  const clustersInfoVisibles = useMemo(() => {
    if (!eventoSeleccionado) return clustersInfo;
    const ids = new Set();
    (casosCiudad?.features || []).forEach((f) => {
      if (f.properties?.evento === eventoSeleccionado) {
        const c = leerCluster(f);
        if (c !== null && c !== -1) ids.add(c);
      }
    });
    return clustersInfo.filter((c) => ids.has(c.cluster_id));
  }, [clustersInfo, casosCiudad, eventoSeleccionado]);

  useEffect(() => {
    if (eventoSeleccionado && clusterSeleccionado) {
      const estaVisible = clustersInfoVisibles.some(c => c.cluster_id === clusterSeleccionado.cluster_id);
      if (!estaVisible) {
        setClusterSeleccionado(null);
        setCasosDelCluster([]);
        setRadiosDelCluster([]);
      }
    }
  }, [clustersInfoVisibles, eventoSeleccionado, clusterSeleccionado]);

  const casosFiltrados = useMemo(() => {
    if (!casosCiudad) return null;
    return {
      ...casosCiudad,
      features: casosCiudad.features.filter((f) => {
        if (eventoSeleccionado && f.properties?.evento !== eventoSeleccionado) return false;
        const c = leerCluster(f);
        if (clusterSeleccionado && c === clusterSeleccionado.cluster_id) return true;
        if ((clusterSeleccionado || clustersVisibles.size !== clustersInfo.length) && (c === null || c === -1)) return false;
        return c === null || c === -1 || clustersVisibles.has(c);
      }),
    };
  }, [casosCiudad, clustersVisibles, clustersInfo.length, clusterSeleccionado, eventoSeleccionado]);

  const casosConJitter = useMemo(() => aplicarJitter(casosFiltrados), [casosFiltrados]);

  const poligonosFiltrados = useMemo(() => {
    if (!clustersPoligonos) return null;
    const clustersConEvento = new Set();
    (casosFiltrados?.features || []).forEach((f) => {
      const c = leerCluster(f);
      if (c !== null && c !== -1) clustersConEvento.add(c);
    });
    return {
      type: 'FeatureCollection',
      features: clustersPoligonos.features.filter((f) => {
        const id = f.properties.cluster;
        if (eventoSeleccionado && !clustersConEvento.has(id)) return false;
        return clustersVisibles.has(id) || (clusterSeleccionado && clusterSeleccionado.cluster_id === id);
      }),
    };
  }, [clustersPoligonos, clustersVisibles, eventoSeleccionado, casosFiltrados, clusterSeleccionado]);

  const puntosHeatmap = useMemo(() => (casosFiltrados?.features || []).map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0], 1]), [casosFiltrados]);

  const radiosMostrados = useMemo(() => {
    if (!radiosGeoJson) return null;
    const usarFiltrados = filtroCiudad || clusterSeleccionado || eventoSeleccionado || clustersVisibles.size !== clustersInfo.length;
    if (!usarFiltrados) return radiosGeoJson;
    const ids = new Set((casosFiltrados?.features || []).map((f) => f.properties?.radio_censal_id).filter(Boolean).map(String));
    return { ...radiosGeoJson, features: radiosGeoJson.features.filter((f) => ids.has(String(f.properties?.link ?? ''))) };
  }, [radiosGeoJson, casosFiltrados, filtroCiudad, clusterSeleccionado, eventoSeleccionado, clustersVisibles, clustersInfo.length]);

  const ciudadesDisponibles = useMemo(() => {
    const set = new Set();
    (casosGeoJson?.features || []).forEach((f) => { if (f.properties?.localidad) set.add(f.properties.localidad); });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [casosGeoJson]);

  const enfermedadesCluster = useMemo(() => {
    if (!clusterSeleccionado || !casosCiudad) return [];
    const mapa = new Map();
    casosCiudad.features.filter((f) => leerCluster(f) === clusterSeleccionado.cluster_id).forEach((f) => {
      const e = f.properties?.evento || 'Sin tipo';
      mapa.set(e, (mapa.get(e) || 0) + 1);
    });
    return [...mapa.entries()].map(([evento, casos]) => ({ evento, casos })).sort((a, b) => b.casos - a.casos);
  }, [clusterSeleccionado, casosCiudad]);

  const enfermedadesResumen = useMemo(() => {
    const mapa = new Map();
    (casosCiudad?.features || []).forEach((f) => {
      const e = f.properties?.evento || 'Sin tipo';
      mapa.set(e, (mapa.get(e) || 0) + 1);
    });
    return [...mapa.entries()].map(([evento, casos]) => ({ evento, casos })).sort((a, b) => b.casos - a.casos);
  }, [casosCiudad]);

  // CLUSTERS NAVEGABLES PARA EL MODAL
  const clustersNavegables = useMemo(() => {
    return clustersInfo.filter(c => clustersVisibles.has(c.cluster_id));
  }, [clustersInfo, clustersVisibles]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <BarraControles
        minSamples={minSamples} setMinSamples={setMinSamples}
        maxEpsOptics={maxEpsOptics} setMaxEpsOptics={setMaxEpsOptics}
        epsTemporal={epsTemporal} setEpsTemporal={setEpsTemporal}
        filtroCiudad={filtroCiudad} ciudadesDisponibles={ciudadesDisponibles}
        cambiarCiudad={cambiarCiudad} eventoSeleccionado={eventoSeleccionado}
        setEventoSeleccionado={setEventoSeleccionado} ejecutar={ejecutar}
        limpiar={limpiar} loadingDbscan={loadingDbscan} nCasosDisponibles={casosUniverso}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 2, position: 'relative' }}>
          <MapaClusters
            casosCiudad={casosCiudad} casosFiltrados={casosConJitter}
            radiosMostrados={radiosMostrados} poligonosFiltrados={poligonosFiltrados}
            clustersVisibles={clustersVisibles} clustersInfo={clustersInfo}
            clusterSeleccionado={clusterSeleccionado} eventoSeleccionado={eventoSeleccionado}
            filtroCiudad={filtroCiudad} mostrarHeatmap={mostrarHeatmap}
            mostrarAnimacion={mostrarAnimacion} puntosHeatmap={puntosHeatmap}
            centroMapa={centroMapa} modoMapa={modoMapa} satscanClusters={[]}
            onSeleccionarRadio={seleccionarRadio}
          />
        </div>

        <PanelLateral
          configActiva={configActiva} exploracion={exploracion} clustering={clustering}
          mostrarHeatmap={mostrarHeatmap} setMostrarHeatmap={setMostrarHeatmap}
          mostrarAnimacion={mostrarAnimacion} setMostrarAnimacion={setMostrarAnimacion}
          enfermedadesResumen={enfermedadesResumen} filtroCiudad={filtroCiudad}
          eventoSeleccionado={eventoSeleccionado} setEventoSeleccionado={setEventoSeleccionado}
          clustersInfoVisibles={clustersInfoVisibles} clustersInfo={clustersInfo}
          clustersVisibles={clustersVisibles}
          toggleCluster={(id) => {
            if (clustersVisibles.has(id)) {
              const nuevo = new Set(clustersVisibles);
              nuevo.delete(id); setClustersVisibles(nuevo);
              if (clusterSeleccionado?.cluster_id === id) setClusterSeleccionado(null);
            } else {
              const c = clustersInfo.find((x) => x.cluster_id === id);
              if (c) seleccionarCluster(c);
            }
          }}
          toggleTodos={(visible) => {
            if (visible) setClustersVisibles(new Set(clustersInfo.map((c) => c.cluster_id)));
            else { setClustersVisibles(new Set()); setClusterSeleccionado(null); }
          }}
          clusterSeleccionado={clusterSeleccionado} seleccionarCluster={seleccionarCluster}
          cerrarCluster={() => setClusterSeleccionado(null)}
          radioDetalle={radioDetalle} enfermedadesCluster={enfermedadesCluster}
          onCerrarRadio={() => setRadioDetalle(null)}
          onAbrirModalRadios={() => setModalRadiosAbierto(true)}
        />
      </div>

      {/* MODAL DE RADIOS */}
      {modalRadiosAbierto && clusterSeleccionado && (
        <ModalRadiosCluster
          cluster={clusterSeleccionado}
          radios={radiosDelCluster}
          casos={casosDelCluster}
          clustersNavegables={clustersNavegables}
          onCambiarCluster={seleccionarCluster}
          onCerrar={() => setModalRadiosAbierto(false)}
        />
      )}
    </div>
  );
}