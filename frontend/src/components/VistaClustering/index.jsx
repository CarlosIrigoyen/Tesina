import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';

import { API, STORAGE_KEY } from './constants';
import { leerCluster, leerGuardado, construirEstadoDesdeConfiguracion } from './helpers';
import BarraControles from './BarraControles';
import MapaClusters from './MapaClusters';
import PanelLateral from './PanelLateral';

export default function VistaClustering({ radiosGeoJson }) {
  const guardadoInicial = useMemo(() => leerGuardado(STORAGE_KEY), []);

  const [minSamples, setMinSamples] = useState(guardadoInicial.minSamples ?? 5);
  const [maxEpsOptics, setMaxEpsOptics] = useState(guardadoInicial.maxEpsOptics ?? 20);
  const [epsTemporal, setEpsTemporal] = useState(guardadoInicial.epsTemporal ?? 2);

  const [exploracion, setExploracion] = useState(null);
  const [clustering, setClustering] = useState(null);
  const [resStknn, setResStknn] = useState(null);
  const [satscanRes, setSatscanRes] = useState(null);
  const [comparativa, setComparativa] = useState(null);
  const [algoritmoActivo, setAlgoritmoActivo] = useState('stdbscan');
  const [loading, setLoading] = useState(false);
  const [loadingComp, setLoadingComp] = useState(false);

  const [casosGeoJson, setCasosGeoJson] = useState(null);
  const [clustersPoligonos, setClustersPoligonos] = useState(null);
  const [clustersInfo, setClustersInfo] = useState([]);
  const [satscanClusters, setSatscanClusters] = useState([]);
  const [modoMapa, setModoMapa] = useState('clusters');
  const [clusterSeleccionado, setClusterSeleccionado] = useState(null);
  const [casosDelCluster, setCasosDelCluster] = useState([]);
  const [radiosDelCluster, setRadiosDelCluster] = useState([]);
  const [radioDetalle, setRadioDetalle] = useState(null);
  const [centroMapa, setCentroMapa] = useState(null);
  const [clustersVisibles, setClustersVisibles] = useState(new Set());

  const [filtroCiudad, setFiltroCiudad] = useState('');
  const [eventoSeleccionado, setEventoSeleccionado] = useState(null);
  const [mostrarHeatmap, setMostrarHeatmap] = useState(false);
  const [mostrarAnimacion, setMostrarAnimacion] = useState(false);

  const [configuraciones, setConfiguraciones] = useState([]);
  const [configActivaId, setConfigActivaId] = useState('');
  const [configActiva, setConfigActiva] = useState(null);
  const [cargandoConfig, setCargandoConfig] = useState(false);

  const indicesCache = useRef({});

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
      setClustersVisibles(new Set(info.map((c) => c.cluster_id)));
      setModoMapa('clusters');
      setSatscanClusters([]);
    } catch (e) { console.error('Error cargando datos:', e); }
  }, []);

  useEffect(() => { void cargarTodo(); }, [cargarTodo]);

  const cargarListaConfiguraciones = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/clustering-configuraciones`);
      setConfiguraciones(res.data || []);
      return res.data || [];
    } catch { return []; }
  }, []);

  useEffect(() => { void cargarListaConfiguraciones(); }, [cargarListaConfiguraciones]);

  const aplicarConfiguracion = useCallback((cfg) => {
    const estado = construirEstadoDesdeConfiguracion(cfg);
    setConfigActiva(cfg);
    setConfigActivaId(cfg.id);
    setCasosGeoJson(estado.casos);
    setClustersPoligonos(estado.poligonos);
    setClustersInfo(estado.clusters);
    setClustersVisibles(new Set(estado.clusters.map((c) => c.cluster_id)));
    setSatscanClusters(estado.satscanClusters);
    setModoMapa(estado.modoMapa);
    setFiltroCiudad(estado.localidad);
    setEventoSeleccionado(null);
    setClusterSeleccionado(null);
    setCasosDelCluster([]);
    setRadiosDelCluster([]);
    setRadioDetalle(null);
    setCentroMapa(null);

    if (estado.algoritmo === 'ST-DBSCAN') {
      setClustering({ ...estado.resumen, params: estado.params });
      setExploracion(estado.exploracion);
      setResStknn(null); setSatscanRes(null);
    } else if (estado.algoritmo === 'ST-kNN') {
      setResStknn({ ...estado.resumen, params: estado.params, metricas: estado.metricas });
      setClustering(null); setExploracion(null); setSatscanRes(null);
    } else if (estado.algoritmo === 'SaTScan-Poisson') {
      setSatscanRes({
        n_clusters_significativos: estado.resumen.n_clusters,
        clusters: estado.satscanClusters,
        tiempo_ms: estado.resumen.tiempo_ms,
      });
      setClustering(null); setResStknn(null); setExploracion(null);
    }
  }, []);

  const cargarConfiguracion = async (id) => {
    if (!id) {
      setConfigActiva(null); setConfigActivaId('');
      setClustering(null); setExploracion(null);
      setResStknn(null); setSatscanRes(null);
      setFiltroCiudad('');
      await cargarTodo('');
      return;
    }
    setCargandoConfig(true);
    try {
      const res = await axios.get(`${API}/clustering-configuraciones/${id}`);
      aplicarConfiguracion(res.data);
    } catch { alert('No se pudo cargar la configuración.'); }
    finally { setCargandoConfig(false); }
  };

  const eliminarConfiguracion = async () => {
    if (!configActivaId) return;
    if (!window.confirm('¿Eliminar esta configuración guardada?')) return;
    try {
      await axios.delete(`${API}/clustering-configuraciones/${configActivaId}`);
      setConfigActiva(null); setConfigActivaId('');
      await cargarListaConfiguraciones();
      await cargarConfiguracion('');
    } catch { alert('No se pudo eliminar.'); }
  };

  const ejecutar = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/flujo-clustering`, {
        params: { min_samples: minSamples, max_eps_optics: maxEpsOptics,
                  eps_temporal_semanas: epsTemporal,
                  ...(filtroCiudad ? { localidad: filtroCiudad } : {}) },
      });
      setExploracion(res.data.exploracion_optics);
      setClustering(res.data.clustering_final);
      setAlgoritmoActivo('stdbscan');
      await cargarListaConfiguraciones();
      if (res.data.configuracion?.id) await cargarConfiguracion(res.data.configuracion.id);
      else await cargarTodo(filtroCiudad);
    } catch { alert('Error en clustering'); }
    finally { setLoading(false); }
  };

  const ejecutarStknn = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/flujo-clustering-stknn`, {
        params: { k: minSamples + 1, radio_espacial_km: 10,
                  radio_temporal_semanas: epsTemporal + 1,
                  umbral_similaridad: 0.65,
                  ...(filtroCiudad ? { localidad: filtroCiudad } : {}) },
      });
      setResStknn(res.data);
      setAlgoritmoActivo('stknn');
      setClustering(null); setExploracion(null);
      await cargarListaConfiguraciones();
      if (res.data.configuracion?.id) await cargarConfiguracion(res.data.configuracion.id);
    } catch { alert('Error en ST-kNN'); }
    finally { setLoading(false); }
  };

  const ejecutarComparativa = async () => {
    setLoadingComp(true);
    try {
      const res = await axios.get(`${API}/comparativa-clustering`, {
        params: { min_samples: minSamples, max_eps_optics: maxEpsOptics,
                  eps_temporal_semanas: epsTemporal,
                  ...(filtroCiudad ? { localidad: filtroCiudad } : {}) },
      });
      setComparativa(res.data);
    } catch { alert('Error en comparativa'); }
    finally { setLoadingComp(false); }
  };

  const cambiarCiudad = async (valor) => {
    setFiltroCiudad(valor);
    setConfigActiva(null); setConfigActivaId('');
    setClusterSeleccionado(null);
    setCasosDelCluster([]); setRadiosDelCluster([]);
    setRadioDetalle(null); setCentroMapa(null);
    setClustersPoligonos(null); setClustersInfo([]);
    setClustersVisibles(new Set()); setEventoSeleccionado(null);
    await cargarTodo(valor);
  };

  const limpiar = () => {
    localStorage.removeItem(STORAGE_KEY);
    setConfigActiva(null); setConfigActivaId('');
    setExploracion(null); setClustering(null);
    setResStknn(null); setSatscanRes(null);
    setComparativa(null); setAlgoritmoActivo('stdbscan');
    setClustersPoligonos(null); setClustersInfo([]);
    setClusterSeleccionado(null); setCasosDelCluster([]);
    setRadiosDelCluster([]); setRadioDetalle(null);
    setClustersVisibles(new Set()); setFiltroCiudad('');
    setEventoSeleccionado(null); setModoMapa('clusters');
    setSatscanClusters([]);
    cargarTodo('');
  };

  const seleccionarCluster = async (cluster) => {
    setClusterSeleccionado(cluster);
    setClustersVisibles((prev) => new Set(prev).add(cluster.cluster_id));
    setRadioDetalle(null);
    if (cluster?.centro_lat && cluster?.centro_lon) {
      setCentroMapa([parseFloat(cluster.centro_lat), parseFloat(cluster.centro_lon)]);
    }
    if (configActiva) {
      const features = (configActiva.casos?.features || [])
        .filter((f) => leerCluster(f) === cluster.cluster_id);
      setCasosDelCluster(features.map((f) => f.properties));
      const radios = cluster.radios || [];
      setRadiosDelCluster(radios);
      setRadioDetalle(radios[0] ?? null);
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
      setRadioDetalle(resRadios.data[0] ?? null);
    } catch (e) { console.error(e); }
  };

  const seleccionarRadio = async (link) => {
    const existente = radiosDelCluster.find(
      (r) => String(r.link ?? r.radio_censal_id) === link
    );
    if (existente) return setRadioDetalle(existente);
    if (indicesCache.current[link] !== undefined) return setRadioDetalle(indicesCache.current[link]);
    try {
      const res = await axios.get(`${API}/radio-indices/${encodeURIComponent(link)}`);
      indicesCache.current[link] = { ...res.data, ...(res.data.indices || {}) };
      setRadioDetalle(indicesCache.current[link]);
    } catch (e) { console.error(e); }
  };

  // -------- derivados --------
  const casosCiudad = useMemo(() => {
    if (!casosGeoJson) return null;
    return {
      ...casosGeoJson,
      features: casosGeoJson.features.filter(
        (f) => !filtroCiudad || f.properties?.localidad === filtroCiudad
      ),
    };
  }, [casosGeoJson, filtroCiudad]);

  const casosFiltrados = useMemo(() => {
    if (!casosCiudad) return null;
    return {
      ...casosCiudad,
      features: casosCiudad.features.filter((f) => {
        if (eventoSeleccionado && f.properties?.evento !== eventoSeleccionado) return false;
        const c = leerCluster(f);
        if ((clusterSeleccionado || clustersVisibles.size !== clustersInfo.length)
            && (c === null || c === -1)) return false;
        return c === null || c === -1 || clustersVisibles.has(c);
      }),
    };
  }, [casosCiudad, clustersVisibles, clustersInfo.length, clusterSeleccionado, eventoSeleccionado]);

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
        return clustersVisibles.has(id);
      }),
    };
  }, [clustersPoligonos, clustersVisibles, eventoSeleccionado, casosFiltrados]);

  const puntosHeatmap = useMemo(() => (casosFiltrados?.features || []).map((f) => [
    f.geometry.coordinates[1], f.geometry.coordinates[0], 1,
  ]), [casosFiltrados]);

  const radiosMostrados = useMemo(() => {
    if (!radiosGeoJson) return null;
    const usarFiltrados = filtroCiudad || clusterSeleccionado || eventoSeleccionado
      || clustersVisibles.size !== clustersInfo.length;
    if (!usarFiltrados) return radiosGeoJson;
    const ids = new Set(
      (casosFiltrados?.features || [])
        .map((f) => f.properties?.radio_censal_id).filter(Boolean).map(String)
    );
    return {
      ...radiosGeoJson,
      features: radiosGeoJson.features.filter(
        (f) => ids.has(String(f.properties?.link ?? ''))
      ),
    };
  }, [radiosGeoJson, casosFiltrados, filtroCiudad, clusterSeleccionado, eventoSeleccionado, clustersVisibles, clustersInfo.length]);

  const ciudadesDisponibles = useMemo(() => {
    const set = new Set();
    (casosGeoJson?.features || []).forEach((f) => {
      if (f.properties?.localidad) set.add(f.properties.localidad);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [casosGeoJson]);

  const enfermedadesCluster = useMemo(() => {
    if (!clusterSeleccionado || !casosCiudad) return [];
    const mapa = new Map();
    casosCiudad.features
      .filter((f) => leerCluster(f) === clusterSeleccionado.cluster_id)
      .forEach((f) => {
        const e = f.properties?.evento || 'Sin tipo';
        mapa.set(e, (mapa.get(e) || 0) + 1);
      });
    return [...mapa.entries()]
      .map(([evento, casos]) => ({ evento, casos }))
      .sort((a, b) => b.casos - a.casos);
  }, [clusterSeleccionado, casosCiudad]);

  const enfermedadesResumen = useMemo(() => {
    const mapa = new Map();
    (casosCiudad?.features || []).forEach((f) => {
      const e = f.properties?.evento || 'Sin tipo';
      mapa.set(e, (mapa.get(e) || 0) + 1);
    });
    return [...mapa.entries()]
      .map(([evento, casos]) => ({ evento, casos }))
      .sort((a, b) => b.casos - a.casos);
  }, [casosCiudad]);

  const clustersInfoVisibles = useMemo(() => {
    if (!eventoSeleccionado) return clustersInfo;
    const ids = new Set();
    (casosFiltrados?.features || []).forEach((f) => {
      const c = leerCluster(f);
      if (c !== null && c !== -1) ids.add(c);
    });
    return clustersInfo.filter((c) => ids.has(c.cluster_id));
  }, [clustersInfo, casosFiltrados, eventoSeleccionado]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <BarraControles
        minSamples={minSamples} setMinSamples={setMinSamples}
        maxEpsOptics={maxEpsOptics} setMaxEpsOptics={setMaxEpsOptics}
        epsTemporal={epsTemporal} setEpsTemporal={setEpsTemporal}
        filtroCiudad={filtroCiudad} ciudadesDisponibles={ciudadesDisponibles}
        cambiarCiudad={cambiarCiudad}
        configuraciones={configuraciones} configActivaId={configActivaId}
        cargarConfiguracion={cargarConfiguracion}
        cargarListaConfiguraciones={cargarListaConfiguraciones}
        eliminarConfiguracion={eliminarConfiguracion}
        cargandoConfig={cargandoConfig}
        eventoSeleccionado={eventoSeleccionado}
        setEventoSeleccionado={setEventoSeleccionado}
        loading={loading} algoritmoActivo={algoritmoActivo}
        ejecutar={ejecutar} ejecutarStknn={ejecutarStknn}
        ejecutarComparativa={ejecutarComparativa}
        loadingComp={loadingComp} limpiar={limpiar}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 2, position: 'relative' }}>
          <MapaClusters
            casosCiudad={casosCiudad}
            casosFiltrados={casosFiltrados}
            radiosMostrados={radiosMostrados}
            poligonosFiltrados={poligonosFiltrados}
            clustersVisibles={clustersVisibles}
            clustersInfo={clustersInfo}
            clusterSeleccionado={clusterSeleccionado}
            eventoSeleccionado={eventoSeleccionado}
            filtroCiudad={filtroCiudad}
            mostrarHeatmap={mostrarHeatmap}
            mostrarAnimacion={mostrarAnimacion}
            puntosHeatmap={puntosHeatmap}
            centroMapa={centroMapa}
            modoMapa={modoMapa}
            satscanClusters={satscanClusters}
            onSeleccionarRadio={seleccionarRadio}
          />
        </div>

        <PanelLateral
          configActiva={configActiva}
          exploracion={exploracion}
          clustering={clustering}
          resStknn={resStknn}
          satscanRes={satscanRes}
          comparativa={comparativa}
          mostrarHeatmap={mostrarHeatmap} setMostrarHeatmap={setMostrarHeatmap}
          mostrarAnimacion={mostrarAnimacion} setMostrarAnimacion={setMostrarAnimacion}
          enfermedadesResumen={enfermedadesResumen}
          filtroCiudad={filtroCiudad}
          eventoSeleccionado={eventoSeleccionado}
          setEventoSeleccionado={setEventoSeleccionado}
          clustersInfoVisibles={clustersInfoVisibles}
          clustersInfo={clustersInfo}
          clustersVisibles={clustersVisibles}
          toggleCluster={(id) => {
            if (clustersVisibles.has(id)) {
              const nuevo = new Set(clustersVisibles);
              nuevo.delete(id);
              setClustersVisibles(nuevo);
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
          clusterSeleccionado={clusterSeleccionado}
          seleccionarCluster={seleccionarCluster}
          cerrarCluster={() => setClusterSeleccionado(null)}
          casosDelCluster={casosDelCluster}
          radiosDelCluster={radiosDelCluster}
          radioDetalle={radioDetalle}
          enfermedadesCluster={enfermedadesCluster}
          onSeleccionarRadio={seleccionarRadio}
          onCerrarRadio={() => setRadioDetalle(null)}
        />
      </div>
    </div>
  );
}