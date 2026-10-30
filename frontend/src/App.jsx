import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, useMap } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import VistaClustering from './components/VistaClustering';
import VistaSaTScan from './components/VistaSaTScan';
import PanelIndices from './components/PanelIndices';
import VistaPorCiudad from './components/VistaPorCiudad';
import HeatmapLayer from './components/HeatmapLayer';
import HeatmapFrame from './components/HeatmapFrame';
import PanelTemporal from './components/PanelTemporal';
import LeyendaEnfermedades from './components/LeyendaEnfermedades';
import { colorPorEvento } from './utils/eventos';

const { BaseLayer, Overlay } = LayersControl;

const STORAGE_KEYS = {
  vista: 'app_vista_v1',
  radios: 'app_radios_v1',
  bounds: 'app_bounds_v1',
  casos: 'app_casos_v1',
  resumen: 'app_resumen_v1',
  metricas: 'app_metricas_v1',
};

function MapController({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length === 2) {
      map.fitBounds(bounds, { padding: [20, 20], duration: 1.5 });
    }
  }, [bounds, map]);
  return null;
}

const readStorage = (key) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
};

const writeStorage = (key, value) => {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (e) {
    console.warn('Error guardando en localStorage:', e);
  }
};

// Aplica jitter a puntos con coordenadas repetidas
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
    if (n === 1) {
      featuresResultado.push(grupo[0]);
      return;
    }
    const radioJitter = 0.00015 * Math.sqrt(n) / 2;
    grupo.forEach((f, i) => {
      const angulo = (2 * Math.PI * i) / n;
      const dLon = radioJitter * Math.cos(angulo);
      const dLat = radioJitter * Math.sin(angulo);
      const [lonOrig, latOrig] = f.geometry.coordinates;
      featuresResultado.push({
        ...f,
        geometry: {
          type: 'Point',
          coordinates: [lonOrig + dLon, latOrig + dLat]
        },
        properties: {
          ...f.properties,
          _jitter_aplicado: true
        }
      });
    });
  });

  return {
    type: 'FeatureCollection',
    features: featuresResultado
  };
}

// Detecta picos semanales usando media + 1.5 desvíos estándar y máximos locales.
function detectarPicos(serie) {
  if (!serie || serie.length < 3) return { picos: [], umbral: 0, media: 0 };

  const valores = serie.map(d => d.casos);
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  const varianza = valores.reduce((a, b) => a + (b - media) ** 2, 0) / valores.length;
  const desvio = Math.sqrt(varianza);
  const umbral = media + 1.5 * desvio;

  if (desvio === 0) return { picos: [], umbral, media };

  const esMaximoLocal = (i) => {
    const actual = valores[i];
    const anterior = i > 0 ? valores[i - 1] : -Infinity;
    const siguiente = i < valores.length - 1 ? valores[i + 1] : -Infinity;
    return actual >= anterior && actual >= siguiente;
  };

  const recolectar = (condicion) => serie.reduce((acc, d, i) => {
    if (condicion(d, i) && esMaximoLocal(i)) {
      acc.push({ ...d, zScore: (d.casos - media) / desvio });
    }
    return acc;
  }, []);

  let picos = recolectar(d => d.casos >= umbral);

  if (picos.length === 0) {
    picos = recolectar(d => d.casos > media);
  }

  return {
    picos: picos.sort((a, b) => b.casos - a.casos),
    umbral,
    media
  };
}

export default function App() {
  const [vista, setVista] = useState(() => readStorage(STORAGE_KEYS.vista) || 'principal');

  const [geoJsonData, setGeoJsonData] = useState(() => readStorage(STORAGE_KEYS.radios));
  const [mapBounds, setMapBounds] = useState(() => readStorage(STORAGE_KEYS.bounds));
  const [casosGeoJson, setCasosGeoJson] = useState(() => readStorage(STORAGE_KEYS.casos));
  const [resumen, setResumen] = useState(() => readStorage(STORAGE_KEYS.resumen));
  const [metricas, setMetricas] = useState(() => readStorage(STORAGE_KEYS.metricas));

  const [loading, setLoading] = useState(!geoJsonData);
  const [loadingCasos, setLoadingCasos] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [localidades, setLocalidades] = useState([]);
  const [filtroCiudad, setFiltroCiudad] = useState('');
  const [filtroRadio, setFiltroRadio] = useState('');
  const [filtroAnio, setFiltroAnio] = useState('');
  const [filtroSemana, setFiltroSemana] = useState('');
  const [mostrarCalor, setMostrarCalor] = useState(false);
  const [mostrarTemporal, setMostrarTemporal] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [frameActual, setFrameActual] = useState(0);
  const [velocidad, setVelocidad] = useState(700);
  const [resumenModalOpen, setResumenModalOpen] = useState(false);
  const [resumenFiltroAnio, setResumenFiltroAnio] = useState('');
  const [resumenFiltroCiudad, setResumenFiltroCiudad] = useState('');

  const filtrosActivos = Boolean(filtroCiudad || filtroRadio || filtroAnio || filtroSemana);

  // Casos filtrados por ciudad y radio (base para opciones de año/semana)
  const casosBaseFiltrados = useMemo(() => {
    if (!casosGeoJson) return null;
    return {
      ...casosGeoJson,
      features: casosGeoJson.features.filter(f => {
        const p = f.properties || {};
        if (filtroCiudad && p.localidad !== filtroCiudad) return false;
        if (filtroRadio && String(p.radio_censal_id ?? '') !== filtroRadio) return false;
        return true;
      })
    };
  }, [casosGeoJson, filtroCiudad, filtroRadio]);

  const aniosDisponibles = useMemo(() => {
    const set = new Set();
    (casosBaseFiltrados?.features || []).forEach(f => {
      const anio = f.properties?.anio;
      if (anio !== null && anio !== undefined) set.add(String(anio));
    });
    return [...set].sort((a, b) => Number(b) - Number(a));
  }, [casosBaseFiltrados]);

  const semanasDisponibles = useMemo(() => {
    const set = new Set();
    (casosBaseFiltrados?.features || []).forEach(f => {
      const p = f.properties || {};
      if (filtroAnio && String(p.anio) !== filtroAnio) return;
      if (p.semana !== null && p.semana !== undefined) set.add(String(p.semana));
    });
    return [...set].sort((a, b) => Number(a) - Number(b));
  }, [casosBaseFiltrados, filtroAnio]);

  // Casos finales (ciudad + radio + año + semana combinados)
  const casosFiltrados = useMemo(() => {
    if (!casosBaseFiltrados) return null;
    return {
      ...casosBaseFiltrados,
      features: casosBaseFiltrados.features.filter(f => {
        const p = f.properties || {};
        if (filtroAnio && String(p.anio) !== filtroAnio) return false;
        if (filtroSemana && String(p.semana) !== filtroSemana) return false;
        return true;
      })
    };
  }, [casosBaseFiltrados, filtroAnio, filtroSemana]);

  const casosConJitter = useMemo(() => aplicarJitter(casosFiltrados), [casosFiltrados]);

  // Serie temporal de casos por año + semana epidemiológica.
  const serieTemporal = useMemo(() => {
    const mapa = new Map();
    (casosFiltrados?.features || []).forEach(f => {
      const p = f.properties || {};
      const anio = Number(p.anio);
      const semana = Number(p.semana);
      if (!Number.isFinite(anio) || !Number.isFinite(semana)) return;

      const key = `${anio}-${String(semana).padStart(2, '0')}`;
      const existente = mapa.get(key);
      if (existente) {
        existente.casos += 1;
      } else {
        mapa.set(key, {
          key,
          anio,
          semana,
          label: `${anio}-S${String(semana).padStart(2, '0')}`,
          casos: 1
        });
      }
    });

    return [...mapa.values()].sort((a, b) => a.anio - b.anio || a.semana - b.semana);
  }, [casosFiltrados]);

  const { picos, umbral, media } = useMemo(() => detectarPicos(serieTemporal), [serieTemporal]);

  const frameActualSeguro = serieTemporal.length === 0
    ? 0
    : Math.min(frameActual, serieTemporal.length - 1);

  const frameActualKey = serieTemporal[frameActualSeguro]?.key;

  const puntosCalor = useMemo(() => {
    if (!casosFiltrados?.features) return [];
    return casosFiltrados.features.map(f => {
      const [lon, lat] = f.geometry?.coordinates || [];
      return [lat, lon, 1];
    }).filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  }, [casosFiltrados]);

  // Durante la animación solo se dibujan los casos del frame (año + semana) actual.
  const casosMapa = useMemo(() => {
    if (!mostrarTemporal || !frameActualKey || !casosConJitter?.features) {
      return casosConJitter;
    }
    const [anio, semana] = frameActualKey.split('-').map(Number);
    return {
      ...casosConJitter,
      features: casosConJitter.features.filter(f => {
        const p = f.properties || {};
        return Number(p.anio) === anio && Number(p.semana) === semana;
      })
    };
  }, [mostrarTemporal, frameActualKey, casosConJitter]);

  // Avance automático de la animación temporal.
  useEffect(() => {
    if (!playing || serieTemporal.length === 0) return undefined;
    const timer = setInterval(() => {
      setFrameActual(i => (i + 1) % serieTemporal.length);
    }, velocidad);
    return () => clearInterval(timer);
  }, [playing, serieTemporal.length, velocidad]);

  const reiniciarAnimacion = () => {
    setFrameActual(0);
    setPlaying(false);
  };

  const eventosDisponibles = useMemo(() => {
    const set = new Set();
    (casosFiltrados?.features || []).forEach(f => {
      const evento = f.properties?.evento;
      if (evento) set.add(evento);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [casosFiltrados]);

  const ciudadesDisponibles = useMemo(() => {
    const map = new Map();
    localidades.forEach(l => {
      map.set(l.localidad, { localidad: l.localidad, departamento: l.departamento, casos: l.casos });
    });
    (casosGeoJson?.features || []).forEach(f => {
      const p = f.properties || {};
      if (p.localidad && !map.has(p.localidad)) {
        map.set(p.localidad, { localidad: p.localidad, departamento: p.departamento, casos: 0 });
      }
    });
    return [...map.values()].sort((a, b) => (b.casos || 0) - (a.casos || 0));
  }, [localidades, casosGeoJson]);

  const radiosDisponibles = useMemo(() => {
    if (!filtroCiudad) return [];
    const map = new Map();
    (casosGeoJson?.features || []).forEach(f => {
      const p = f.properties || {};
      if (p.localidad !== filtroCiudad || !p.radio_censal_id) return;
      const id = String(p.radio_censal_id);
      map.set(id, (map.get(id) || 0) + 1);
    });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, casos]) => ({ id, casos }));
  }, [casosGeoJson, filtroCiudad]);

  const resumenAniosDisponibles = useMemo(() => {
    const set = new Set();
    (casosGeoJson?.features || []).forEach(f => {
      const anio = f.properties?.anio;
      if (anio !== null && anio !== undefined) set.add(String(anio));
    });
    return [...set].sort((a, b) => Number(b) - Number(a));
  }, [casosGeoJson]);

  const resumenCiudadesDisponibles = useMemo(() => {
    const set = new Set();
    (casosGeoJson?.features || []).forEach(f => {
      const localidad = f.properties?.localidad;
      if (localidad) set.add(localidad);
    });
    if (set.size === 0) {
      (resumen || []).forEach(r => {
        if (r.localidad) set.add(r.localidad);
      });
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [casosGeoJson, resumen]);

  const casosResumenFiltrados = useMemo(() => {
    return (casosGeoJson?.features || []).filter(f => {
      const p = f.properties || {};
      if (resumenFiltroAnio && String(p.anio) !== resumenFiltroAnio) return false;
      if (resumenFiltroCiudad && p.localidad !== resumenFiltroCiudad) return false;
      return true;
    });
  }, [casosGeoJson, resumenFiltroAnio, resumenFiltroCiudad]);

  const resumenFiltrado = useMemo(() => {
    if (casosResumenFiltrados.length > 0) {
      const total = casosResumenFiltrados.length;
      const mapa = new Map();
      casosResumenFiltrados.forEach(f => {
        const p = f.properties || {};
        const localidad = p.localidad || 'Sin localidad';
        const departamento = p.departamento || '';
        const key = `${localidad}|${departamento}`;
        const actual = mapa.get(key);
        if (actual) {
          actual.total_casos += 1;
        } else {
          mapa.set(key, { localidad, departamento, total_casos: 1 });
        }
      });

      return [...mapa.values()]
        .map(r => ({
          ...r,
          porcentaje: total ? Number(((r.total_casos * 100) / total).toFixed(2)) : 0
        }))
        .sort((a, b) => b.total_casos - a.total_casos || a.localidad.localeCompare(b.localidad, 'es'));
    }

    let base = resumen || [];
    if (resumenFiltroCiudad) {
      base = base.filter(r => r.localidad === resumenFiltroCiudad);
    }
    return base;
  }, [casosResumenFiltrados, resumen, resumenFiltroCiudad]);

  const resumenEnfermedades = useMemo(() => {
    if (casosResumenFiltrados.length === 0) return [];

    const total = casosResumenFiltrados.length;
    const mapa = new Map();
    casosResumenFiltrados.forEach(f => {
      const p = f.properties || {};
      const localidad = p.localidad || 'Sin localidad';
      const departamento = p.departamento || '';
      const evento = p.evento || 'Sin tipo de enfermedad';
      const key = `${localidad}|${departamento}|${evento}`;
      const actual = mapa.get(key);
      if (actual) {
        actual.total_casos += 1;
      } else {
        mapa.set(key, { localidad, departamento, evento, total_casos: 1 });
      }
    });

    return [...mapa.values()]
      .map(r => ({
        ...r,
        porcentaje: total ? Number(((r.total_casos * 100) / total).toFixed(2)) : 0
      }))
      .sort((a, b) => (
        a.localidad.localeCompare(b.localidad, 'es')
        || b.total_casos - a.total_casos
        || a.evento.localeCompare(b.evento, 'es')
      ));
  }, [casosResumenFiltrados]);

  const resumenTotalCasos = useMemo(
    () => resumenFiltrado.reduce((acc, r) => acc + Number(r.total_casos || 0), 0),
    [resumenFiltrado]
  );

  // Radios de la ciudad elegida, derivados de los datos ya cargados.
  // No depende del backend para que el filtro no vacíe la capa si falla una request.
  const radiosCiudad = useMemo(() => {
    if (!filtroCiudad || !geoJsonData?.features) return null;
    const ids = new Set();
    (casosGeoJson?.features || []).forEach(f => {
      const p = f.properties || {};
      if (p.localidad === filtroCiudad && p.radio_censal_id) {
        ids.add(String(p.radio_censal_id));
      }
    });
    return {
      ...geoJsonData,
      features: geoJsonData.features.filter(f => ids.has(String(f.properties?.link ?? '')))
    };
  }, [geoJsonData, casosGeoJson, filtroCiudad]);

  const boundsCiudad = useMemo(() => {
    if (!radiosCiudad?.features?.length) return null;
    const bounds = L.geoJSON(radiosCiudad).getBounds();
    if (!bounds.isValid()) return null;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return [[sw.lat, sw.lng], [ne.lat, ne.lng]];
  }, [radiosCiudad]);

  const radiosMostrados = filtroCiudad ? radiosCiudad : geoJsonData;
  const boundsMostrados = boundsCiudad || mapBounds;

  useEffect(() => { writeStorage(STORAGE_KEYS.vista, vista); }, [vista]);
  useEffect(() => { writeStorage(STORAGE_KEYS.radios, geoJsonData); }, [geoJsonData]);
  useEffect(() => { writeStorage(STORAGE_KEYS.bounds, mapBounds); }, [mapBounds]);
  useEffect(() => { writeStorage(STORAGE_KEYS.casos, casosGeoJson); }, [casosGeoJson]);
  useEffect(() => { writeStorage(STORAGE_KEYS.resumen, resumen); }, [resumen]);
  useEffect(() => { writeStorage(STORAGE_KEYS.metricas, metricas); }, [metricas]);

  useEffect(() => {
    if (!geoJsonData) {
      cargarDatosRadios();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    axios.get('http://localhost:8000/api/v1/experimentos/localidades')
      .then(res => setLocalidades(res.data || []))
      .catch(e => console.error('Error al cargar localidades:', e));
  }, []);

  useEffect(() => {
    if (!casosGeoJson) {
      axios.get('http://localhost:8000/api/v1/experimentos/casos-geojson')
        .then(res => {
          if (res.data?.features?.length) setCasosGeoJson(res.data);
        })
        .catch(e => console.error('Error al cargar casos existentes:', e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cargarDatosRadios() {
    setLoading(true);

    Promise.all([
      axios.get('http://localhost:8000/api/radios-censales/geojson'),
      axios.get('http://localhost:8000/api/radios-censales/bounds')
    ])
      .then(([resGeojson, resBounds]) => {
        setGeoJsonData(resGeojson.data);
        if (resBounds.data && resBounds.data.bounds) {
          setMapBounds(resBounds.data.bounds);
        }
        setLoading(false);
      })
      .catch(error => {
        console.error('Error al cargar datos:', error);
        setLoading(false);
      });
  }

  const cargarCasos = async () => {
    setLoadingCasos(true);
    try {
      await axios.post('http://localhost:8000/api/v1/experimentos/cargar-casos?csv_path=casos_grupo_ets_completo.csv&years_back=5');
      const res = await axios.get('http://localhost:8000/api/v1/experimentos/casos-geojson');
      setCasosGeoJson(res.data);
      alert('Casos cargados correctamente');
    } catch (error) {
      console.error('Error al cargar casos:', error);
      alert('Error al cargar casos');
    } finally {
      setLoadingCasos(false);
    }
  };

  const cargarResumen = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/v1/experimentos/resumen-por-ciudad');
      setResumen(res.data);
    } catch (error) {
      console.error('Error al obtener resumen:', error);
    }
  };

  const abrirResumen = () => {
    setResumenModalOpen(true);
    cargarResumen();
  };

  const limpiarTodo = () => {
    if (!window.confirm('¿Borrar todos los datos guardados (radios, casos, resumen, métricas)?')) return;
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    setGeoJsonData(null);
    setMapBounds(null);
    setCasosGeoJson(null);
    setResumen(null);
    setMetricas(null);
    setFiltroCiudad('');
    setFiltroRadio('');
    setFiltroAnio('');
    setFiltroSemana('');
    reiniciarAnimacion();
    cargarDatosRadios();
  };

  const limpiarFiltros = () => {
    setFiltroCiudad('');
    setFiltroRadio('');
    setFiltroAnio('');
    setFiltroSemana('');
    reiniciarAnimacion();
  };

  const radioStyle = {
    color: '#1d4ed8',
    weight: 1.2,
    fillColor: '#3b82f6',
    fillOpacity: 0.35
  };

  const onEachFeatureRadio = (feature, layer) => {
    if (feature.properties) {
      layer.bindPopup(`
        <div style="font-family: sans-serif; font-size: 13px;">
          <strong>Radio Censal (ID):</strong> ${feature.properties.link || 'Sin ID'}
        </div>
      `);
    }
  };

  const pointStyleCasos = (feature) => ({
    radius: 6,
    fillColor: colorPorEvento(feature.properties.evento),
    color: '#111827',
    weight: 1,
    fillOpacity: 0.85
  });

  const onEachFeatureCaso = (feature, layer) => {
    const p = feature.properties;
    layer.bindTooltip(`
      <div style="font-family: sans-serif; font-size: 12px; line-height: 1.35;">
        <strong>${p.evento}</strong><br/>
        ${p.localidad} · ${p.anio} S${p.semana}
      </div>
    `, { sticky: true, direction: 'top', opacity: 0.95 });
    layer.bindPopup(`
      <div style="font-family: sans-serif; font-size: 13px;">
        <strong>${p.evento}</strong><br/>
        Localidad: ${p.localidad}<br/>
        Departamento: ${p.departamento}<br/>
        Año: ${p.anio} - Semana: ${p.semana}
      </div>
    `);
  };

  const btnStyle = (activo, colorBase) => ({
    background: activo ? colorBase : '#475569',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.85rem'
  });

  const menuButtonStyle = (activo, colorBase) => ({
    ...btnStyle(activo, colorBase),
    width: '100%',
    textAlign: 'left',
    padding: '9px 12px'
  });

  const selectStyle = {
    width: '100%',
    marginTop: 5,
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #334155',
    background: '#1e293b',
    color: 'white',
    fontSize: '0.85rem'
  };

  const navLabelStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    fontSize: '0.68rem',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  };

  const navSelectStyle = {
    ...selectStyle,
    width: 'auto',
    marginTop: 0,
    padding: '6px 8px'
  };

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '10px 20px',
        background: '#0f172a',
        color: 'white',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menú"
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 4,
              width: 38,
              height: 38,
              padding: '8px',
              borderRadius: 6,
              border: '1px solid #334155',
              background: '#1e293b',
              cursor: 'pointer'
            }}
          >
            <span style={{ display: 'block', height: 2, background: 'white', borderRadius: 1 }} />
            <span style={{ display: 'block', height: 2, background: 'white', borderRadius: 1 }} />
            <span style={{ display: 'block', height: 2, background: 'white', borderRadius: 1 }} />
          </button>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Visor GIS - Análisis Epidemiológico</h3>
            <small style={{ color: '#94a3b8' }}>
              {loading ? 'Cargando radios...' : `Radios: ${radiosMostrados?.features?.length || 0}`}
              {casosFiltrados ? ` | Casos: ${casosFiltrados.features.length}${filtrosActivos ? ` de ${casosGeoJson?.features?.length || 0}` : ''}` : ''}
            </small>
          </div>
        </div>

        {vista === 'principal' && (
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 10,
            flexWrap: 'wrap',
            borderTop: '1px solid #1e293b',
            paddingTop: 10
          }}>
            <label style={navLabelStyle}>
              Ciudad
              <select
                value={filtroCiudad}
                onChange={(e) => {
                  setFiltroCiudad(e.target.value);
                  setFiltroRadio('');
                  setFiltroAnio('');
                  setFiltroSemana('');
                  reiniciarAnimacion();
                }}
                style={{ ...navSelectStyle, minWidth: 170 }}
              >
                <option value="">Todas las ciudades</option>
                {ciudadesDisponibles.map(c => (
                  <option key={c.localidad} value={c.localidad}>
                    {c.localidad}{c.casos ? ` (${c.casos})` : ''}
                  </option>
                ))}
              </select>
            </label>

            <label style={navLabelStyle}>
              Radio censal
              <select
                value={filtroRadio}
                onChange={(e) => {
                  setFiltroRadio(e.target.value);
                  setFiltroAnio('');
                  setFiltroSemana('');
                  reiniciarAnimacion();
                }}
                disabled={!filtroCiudad}
                style={{ ...navSelectStyle, minWidth: 170, opacity: filtroCiudad ? 1 : 0.55 }}
              >
                <option value="">{filtroCiudad ? 'Todos los radios' : 'Elegí una ciudad'}</option>
                {radiosDisponibles.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.id} ({r.casos} casos)
                  </option>
                ))}
              </select>
            </label>

            <label style={navLabelStyle}>
              Año
              <select
                value={filtroAnio}
                onChange={(e) => {
                  setFiltroAnio(e.target.value);
                  setFiltroSemana('');
                  reiniciarAnimacion();
                }}
                style={{ ...navSelectStyle, minWidth: 100 }}
              >
                <option value="">Todos</option>
                {aniosDisponibles.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>

            <label style={navLabelStyle}>
              Semana
              <select
                value={filtroSemana}
                onChange={(e) => {
                  setFiltroSemana(e.target.value);
                  reiniciarAnimacion();
                }}
                style={{ ...navSelectStyle, minWidth: 105 }}
              >
                <option value="">Todas</option>
                {semanasDisponibles.map(s => (
                  <option key={s} value={s}>Semana {s}</option>
                ))}
              </select>
            </label>

            <button
              onClick={limpiarFiltros}
              disabled={!filtrosActivos}
              style={{
                ...btnStyle(false, '#475569'),
                opacity: filtrosActivos ? 1 : 0.5,
                cursor: filtrosActivos ? 'pointer' : 'default'
              }}
            >
              Limpiar filtros
            </button>

            <span style={{ borderLeft: '1px solid #334155', height: 30, margin: '0 2px' }} />

            <button
              onClick={() => setMostrarCalor(v => !v)}
              style={btnStyle(mostrarCalor, '#0ea5e9')}
              title="Superponer mapa de calor con todos los casos filtrados"
            >
              Mapa de calor
            </button>
            <button
              onClick={() => {
                setMostrarTemporal(v => !v);
                setPlaying(false);
              }}
              style={btnStyle(mostrarTemporal, '#0891b2')}
              title="Animar casos por año y semana epidemiológica y detectar picos"
            >
              Picos / Animación
            </button>

            <button onClick={cargarCasos} disabled={loadingCasos} style={btnStyle(false, '#e11d48')}>
              {loadingCasos ? 'Cargando...' : 'Cargar casos'}
            </button>
            <button onClick={abrirResumen} style={btnStyle(false, '#059669')}>
              Ver resumen
            </button>
            <button onClick={limpiarTodo} style={btnStyle(false, '#dc2626')}>
              Limpiar todo
            </button>
          </div>
        )}
      </header>

      {menuOpen && (
        <>
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000 }}
          />
          <aside style={{
            position: 'fixed',
            top: 0,
            left: 0,
            height: '100vh',
            width: 340,
            maxWidth: '90vw',
            background: '#0f172a',
            color: 'white',
            zIndex: 2001,
            padding: '16px 18px 28px',
            overflowY: 'auto',
            boxShadow: '2px 0 16px rgba(0,0,0,0.4)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 8 }}>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
                style={{ border: 'none', background: 'transparent', color: 'white', fontSize: '1.7rem', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={() => { setVista('principal'); setMenuOpen(false); }} style={menuButtonStyle(vista === 'principal', '#2563eb')}>Principal</button>
              <button onClick={() => { setVista('clustering'); setMenuOpen(false); }} style={menuButtonStyle(vista === 'clustering', '#7c3aed')}>Clustering</button>
              <button onClick={() => { setVista('satscan'); setMenuOpen(false); }} style={menuButtonStyle(vista === 'satscan', '#059669')}>SaTScan</button>
              <button onClick={() => { setVista('indices'); setMenuOpen(false); }} style={menuButtonStyle(vista === 'indices', '#ea580c')}>Índices</button>
              <button onClick={() => { setVista('ciudad'); setMenuOpen(false); }} style={menuButtonStyle(vista === 'ciudad', '#0891b2')}>Índice por Ciudad</button>
            </div>

          </aside>
        </>
      )}

      <div style={{ flex: 1, position: 'relative' }}>
        {vista === 'principal' && (
          <>
            {loading && !geoJsonData ? (
              <div style={{
                height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#f8fafc', color: '#475569'
              }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>Cargando radios censales...</div>
                  <div style={{ fontSize: 13 }}>Si tarda más de 10 segundos, revisá que el backend esté corriendo en http://localhost:8000</div>
                </div>
              </div>
            ) : (
              <>
                <MapContainer
                  center={[-43.6, -69.0]}
                  zoom={7}
                  style={{ height: '100%', width: '100%', background: '#f8fafc' }}
                >
                  <MapController bounds={boundsMostrados} />

                  <LayersControl position="topright">
                    <BaseLayer checked name="OpenStreetMap">
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; OpenStreetMap contributors'
                      />
                    </BaseLayer>

                    <BaseLayer name="Sin Mapa Base">
                      <TileLayer url="" />
                    </BaseLayer>

                    <Overlay checked name="Radios Censales">
                      {radiosMostrados && (
                        <GeoJSON
                          key={JSON.stringify(radiosMostrados)}
                          data={radiosMostrados}
                          style={radioStyle}
                          onEachFeature={onEachFeatureRadio}
                        />
                      )}
                    </Overlay>

                    <Overlay checked name={mostrarTemporal ? `Casos ETS ${frameActualKey || ''}` : 'Casos ETS'}>
                      {casosMapa && (
                        <GeoJSON
                          key={`casos-${filtroCiudad}|${filtroRadio}|${filtroAnio}|${filtroSemana}|${frameActualKey || ''}|${casosMapa.features.length}`}
                          data={casosMapa}
                          pointToLayer={(feature, latlng) => L.circleMarker(latlng, pointStyleCasos(feature))}
                          onEachFeature={onEachFeatureCaso}
                        />
                      )}
                    </Overlay>
                  </LayersControl>

                  {mostrarTemporal && frameActualKey && (
                    <HeatmapFrame casosGeoJson={casosFiltrados} frame={frameActualKey} />
                  )}

                  {mostrarCalor && !mostrarTemporal && puntosCalor.length > 0 && (
                    <HeatmapLayer puntos={puntosCalor} radio={28} blur={18} />
                  )}
                </MapContainer>

                {mostrarTemporal && (
                  <PanelTemporal
                    serie={serieTemporal}
                    picos={picos}
                    umbral={umbral}
                    media={media}
                    frameActual={frameActualSeguro}
                    onFrameChange={setFrameActual}
                    playing={playing}
                    onTogglePlaying={() => setPlaying(p => !p)}
                    velocidad={velocidad}
                    onVelocidadChange={setVelocidad}
                    onClose={() => {
                      setMostrarTemporal(false);
                      setPlaying(false);
                    }}
                  />
                )}

                {metricas && (
                  <div style={{
                    position: 'absolute', top: 20, right: 20,
                    background: 'white', padding: 15, borderRadius: 8,
                    boxShadow: '0 0 10px rgba(0,0,0,0.3)',
                    zIndex: 1000, fontSize: '0.85rem', maxWidth: 320
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ marginTop: 0 }}>ST-DBSCAN</h4>
                      <button onClick={() => setMetricas(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
                    </div>
                    <p><b>Clusters:</b> {metricas.n_clusters}</p>
                    <p><b>Ruido:</b> {metricas.n_ruido} ({metricas.pct_ruido?.toFixed(1)}%)</p>
                    <p><b>Tiempo:</b> {metricas.tiempo_ms?.toFixed(1)} ms</p>
                  </div>
                )}

                <LeyendaEnfermedades eventos={eventosDisponibles} />
              </>
            )}
          </>
        )}

        {vista === 'clustering' && <VistaClustering radiosGeoJson={geoJsonData} />}
        {vista === 'satscan' && <VistaSaTScan radiosGeoJson={geoJsonData} />}
        {vista === 'indices' && <PanelIndices />}
        {vista === 'ciudad' && <VistaPorCiudad />}
      </div>

      {resumenModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          zIndex: 3000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="resumen-modal-title"
            style={{
              background: 'white',
              borderRadius: 10,
              width: '100%',
              maxWidth: 760,
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 50px rgba(0,0,0,0.35)'
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 18px',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <h3 id="resumen-modal-title" style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a' }}>
                Resumen por Localidad
              </h3>
              <button
                onClick={() => setResumenModalOpen(false)}
                aria-label="Cerrar resumen"
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#0f172a',
                  fontSize: '1.7rem',
                  lineHeight: 1,
                  cursor: 'pointer'
                }}
              >
                ×
              </button>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 10,
              flexWrap: 'wrap',
              padding: '12px 18px',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc'
            }}>
              <label style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: '0.72rem',
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                Año
                <select
                  value={resumenFiltroAnio}
                  onChange={(e) => setResumenFiltroAnio(e.target.value)}
                  style={{
                    minWidth: 110,
                    padding: '7px 9px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: 'white',
                    color: '#0f172a',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="">Todos</option>
                  {resumenAniosDisponibles.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </label>

              <label style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                fontSize: '0.72rem',
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                Ciudad
                <select
                  value={resumenFiltroCiudad}
                  onChange={(e) => setResumenFiltroCiudad(e.target.value)}
                  style={{
                    minWidth: 210,
                    padding: '7px 9px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    background: 'white',
                    color: '#0f172a',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="">Todas las ciudades</option>
                  {resumenCiudadesDisponibles.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ padding: '12px 18px 18px', overflowY: 'auto' }}>
              {resumenFiltrado.length === 0 ? (
                <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                  No hay datos para los filtros seleccionados.
                </p>
              ) : (
                <>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #cbd5e1', color: '#475569' }}>
                        <th style={{ textAlign: 'left', padding: 7 }}>Localidad</th>
                        <th style={{ textAlign: 'left', padding: 7 }}>Departamento</th>
                        <th style={{ textAlign: 'right', padding: 7 }}>Casos</th>
                        <th style={{ textAlign: 'right', padding: 7 }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumenFiltrado.map((item, idx) => (
                        <tr key={`${item.localidad}-${item.departamento}-${idx}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: 7 }}>{item.localidad}</td>
                          <td style={{ padding: 7 }}>{item.departamento || '—'}</td>
                          <td style={{ textAlign: 'right', padding: 7 }}>{item.total_casos}</td>
                          <td style={{ textAlign: 'right', padding: 7 }}>{item.porcentaje}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ marginTop: 24 }}>
                    <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', color: '#0f172a' }}>
                      Desagregado por tipo de enfermedad
                    </h4>
                    <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: '#64748b' }}>
                      El porcentaje se calcula sobre el total de casos del año y la ciudad seleccionados.
                    </p>
                    {resumenEnfermedades.length === 0 ? (
                      <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                        No hay datos de tipos de enfermedad para los filtros seleccionados.
                      </p>
                    ) : (
                      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #cbd5e1', color: '#475569' }}>
                            <th style={{ textAlign: 'left', padding: 7 }}>Localidad</th>
                            <th style={{ textAlign: 'left', padding: 7 }}>Departamento</th>
                            <th style={{ textAlign: 'left', padding: 7 }}>Tipo de enfermedad</th>
                            <th style={{ textAlign: 'right', padding: 7 }}>Casos</th>
                            <th style={{ textAlign: 'right', padding: 7 }}>%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resumenEnfermedades.map((item, idx) => (
                            <tr key={`${item.localidad}-${item.departamento}-${item.evento}-${idx}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: 7 }}>{item.localidad}</td>
                              <td style={{ padding: 7 }}>{item.departamento || '—'}</td>
                              <td style={{ padding: 7 }}>{item.evento}</td>
                              <td style={{ textAlign: 'right', padding: 7 }}>{item.total_casos}</td>
                              <td style={{ textAlign: 'right', padding: 7 }}>{item.porcentaje}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              padding: '10px 18px',
              borderTop: '1px solid #e2e8f0',
              fontSize: '0.8rem',
              color: '#475569'
            }}>
              <span>Total: {resumenTotalCasos} casos</span>
              <span>
                {resumenFiltroAnio ? `Año ${resumenFiltroAnio}` : 'Todos los años'}
                {' · '}
                {resumenFiltroCiudad || 'Todas las ciudades'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
