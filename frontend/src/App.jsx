import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, useMap } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import VistaClustering from './components/VistaClustering';
import VistaSaTScan from './components/VistaSaTScan';
import PanelIndices from './components/PanelIndices';
import VistaPorCiudad from './components/VistaPorCiudad';

const { BaseLayer, Overlay } = LayersControl;

const STORAGE_KEYS = {
  vista: 'app_vista_v1',
  radios: 'app_radios_v1',
  bounds: 'app_bounds_v1',
  casos: 'app_casos_v1',
  resumen: 'app_resumen_v1',
  metricas: 'app_metricas_v1',
};

const COLORES_EVENTO = {
  'Sífilis': '#e11d48',
  'VIH': '#2563eb',
  'Sífilis en Personas Gestantes': '#f59e0b',
  'Sífilis - RN Expuesto en Investigación': '#7c3aed',
  'Hepatitis C': '#059669',
  'Hepatitis B': '#0891b2',
  'Gonorrea': '#db2777',
  'VIH - Expuesto Perinatal': '#65a30d',
  'VIH en Embarazo': '#0f766e',
  'Infecciones Genitales (Otras)': '#9333ea',
  'Sífilis Congénita': '#dc2626',
  'Htlv': '#475569',
};

const PALETA_EVENTOS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

const colorPorEvento = (evento = '') => {
  if (COLORES_EVENTO[evento]) return COLORES_EVENTO[evento];
  let hash = 0;
  for (let i = 0; i < evento.length; i++) {
    hash = (hash * 31 + evento.charCodeAt(i)) >>> 0;
  }
  return PALETA_EVENTOS[hash % PALETA_EVENTOS.length];
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
  const [leyendaAbierta, setLeyendaAbierta] = useState(true);
  const [localidades, setLocalidades] = useState([]);
  const [radiosCiudad, setRadiosCiudad] = useState(null);
  const [filtroCiudad, setFiltroCiudad] = useState('');
  const [filtroRadio, setFiltroRadio] = useState('');
  const [filtroAnio, setFiltroAnio] = useState('');
  const [filtroSemana, setFiltroSemana] = useState('');

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

  const boundsCiudad = useMemo(() => {
    if (!filtroCiudad || !radiosCiudad?.features?.length) return null;
    const bounds = L.geoJSON(radiosCiudad).getBounds();
    if (!bounds.isValid()) return null;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return [[sw.lat, sw.lng], [ne.lat, ne.lng]];
  }, [filtroCiudad, radiosCiudad]);

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

  useEffect(() => {
    if (!filtroCiudad) return;
    const loc = encodeURIComponent(filtroCiudad);
    axios.get(`http://localhost:8000/api/v1/experimentos/ciudad/radios-geojson?localidad=${loc}`)
      .then(res => setRadiosCiudad(res.data))
      .catch(e => {
        console.error('Error al cargar radios de la ciudad:', e);
        setRadiosCiudad(null);
      });
  }, [filtroCiudad]);

  const cargarDatosRadios = () => {
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
  };

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

  const ejecutarClustering = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/v1/experimentos/flujo-clustering');
      setMetricas(res.data.clustering_final);
      const resCasos = await axios.get('http://localhost:8000/api/v1/experimentos/casos-geojson');
      setCasosGeoJson(resCasos.data);
      alert('Clustering ejecutado.');
    } catch (error) {
      console.error('Error en clustering:', error);
      alert('Error al ejecutar clustering');
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
    setRadiosCiudad(null);
    cargarDatosRadios();
  };

  const limpiarFiltros = () => {
    setFiltroCiudad('');
    setFiltroRadio('');
    setFiltroAnio('');
    setFiltroSemana('');
    setRadiosCiudad(null);
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
              {filtrosActivos ? ' | Filtros activos' : ''}
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
                  setRadiosCiudad(null);
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
                onChange={(e) => setFiltroSemana(e.target.value)}
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

            <button onClick={cargarCasos} disabled={loadingCasos} style={btnStyle(false, '#e11d48')}>
              {loadingCasos ? 'Cargando...' : 'Cargar casos'}
            </button>
            <button onClick={ejecutarClustering} style={btnStyle(false, '#7c3aed')}>
              Ejecutar clustering
            </button>
            <button onClick={cargarResumen} style={btnStyle(false, '#059669')}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Menú</h3>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Cerrar menú"
                style={{ border: 'none', background: 'transparent', color: 'white', fontSize: '1.7rem', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ margin: '8px 0 10px', fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Vistas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button onClick={() => { setVista('principal'); setMenuOpen(false); }} style={menuButtonStyle(vista === 'principal', '#2563eb')}>Principal</button>
              <button onClick={() => { setVista('clustering'); setMenuOpen(false); }} style={menuButtonStyle(vista === 'clustering', '#7c3aed')}>Clustering</button>
              <button onClick={() => { setVista('satscan'); setMenuOpen(false); }} style={menuButtonStyle(vista === 'satscan', '#059669')}>SaTScan</button>
              <button onClick={() => { setVista('indices'); setMenuOpen(false); }} style={menuButtonStyle(vista === 'indices', '#ea580c')}>Índices</button>
              <button onClick={() => { setVista('ciudad'); setMenuOpen(false); }} style={menuButtonStyle(vista === 'ciudad', '#0891b2')}>Por Ciudad</button>
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

                    <Overlay checked name="Casos ETS">
                      {casosConJitter && (
                        <GeoJSON
                          key={`casos-${filtroCiudad}|${filtroRadio}|${filtroAnio}|${filtroSemana}|${casosConJitter.features.length}`}
                          data={casosConJitter}
                          pointToLayer={(feature, latlng) => L.circleMarker(latlng, pointStyleCasos(feature))}
                          onEachFeature={onEachFeatureCaso}
                        />
                      )}
                    </Overlay>
                  </LayersControl>
                </MapContainer>

                {resumen && (
                  <div style={{
                    position: 'absolute', bottom: 20, left: 20,
                    background: 'white', padding: 15, borderRadius: 8,
                    boxShadow: '0 0 10px rgba(0,0,0,0.3)',
                    maxHeight: 300, overflowY: 'auto', zIndex: 1000, fontSize: '0.9rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ marginTop: 0 }}>Resumen por Localidad</h4>
                      <button onClick={() => setResumen(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
                    </div>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #ccc' }}>
                          <th style={{ textAlign: 'left', padding: 4 }}>Localidad</th>
                          <th style={{ textAlign: 'right', padding: 4 }}>Casos</th>
                          <th style={{ textAlign: 'right', padding: 4 }}>%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumen.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: 4 }}>{item.localidad}</td>
                            <td style={{ textAlign: 'right', padding: 4 }}>{item.total_casos}</td>
                            <td style={{ textAlign: 'right', padding: 4 }}>{item.porcentaje}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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

                {eventosDisponibles.length > 0 && (
                  <div style={{
                    position: 'absolute', bottom: 24, right: 20,
                    background: 'white', padding: '10px 12px', borderRadius: 8,
                    boxShadow: '0 0 10px rgba(0,0,0,0.3)',
                    zIndex: 1000, fontSize: '0.78rem', maxWidth: 260,
                    maxHeight: leyendaAbierta ? '40vh' : 'none',
                    overflowY: leyendaAbierta ? 'auto' : 'hidden'
                  }}>
                    <button
                      onClick={() => setLeyendaAbierta(v => !v)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        width: '100%',
                        padding: 0,
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '0.85rem',
                        color: '#0f172a',
                        textAlign: 'left'
                      }}
                    >
                      <span>Enfermedades ({eventosDisponibles.length})</span>
                      <span>{leyendaAbierta ? '▾' : '▸'}</span>
                    </button>
                    {leyendaAbierta && (
                      <div style={{ marginTop: 8 }}>
                        {eventosDisponibles.map(evento => (
                          <div key={evento} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <span style={{
                              width: 11,
                              height: 11,
                              borderRadius: '50%',
                              background: colorPorEvento(evento),
                              border: '1px solid #111827',
                              flexShrink: 0
                            }} />
                            <span>{evento}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {vista === 'clustering' && <VistaClustering radiosGeoJson={geoJsonData} />}
        {vista === 'satscan' && <VistaSaTScan radiosGeoJson={geoJsonData} />}
        {vista === 'indices' && <PanelIndices />}
        {vista === 'ciudad' && <VistaPorCiudad />}
      </div>
    </div>
  );
}
