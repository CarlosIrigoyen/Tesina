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
  const [searchLink, setSearchLink] = useState('');

  // Aplicar jitter a los casos
  const casosConJitter = useMemo(() => aplicarJitter(casosGeoJson), [casosGeoJson]);

  useEffect(() => { writeStorage(STORAGE_KEYS.vista, vista); }, [vista]);
  useEffect(() => { if (!searchLink) writeStorage(STORAGE_KEYS.radios, geoJsonData); }, [geoJsonData, searchLink]);
  useEffect(() => { if (!searchLink) writeStorage(STORAGE_KEYS.bounds, mapBounds); }, [mapBounds, searchLink]);
  useEffect(() => { writeStorage(STORAGE_KEYS.casos, casosGeoJson); }, [casosGeoJson]);
  useEffect(() => { writeStorage(STORAGE_KEYS.resumen, resumen); }, [resumen]);
  useEffect(() => { writeStorage(STORAGE_KEYS.metricas, metricas); }, [metricas]);

  useEffect(() => {
    if (!geoJsonData) {
      cargarDatosRadios();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarDatosRadios = (filtro = '') => {
    setLoading(true);
    const urlGeojson = filtro
      ? `http://localhost:8000/api/radios-censales/geojson?link=${filtro}`
      : 'http://localhost:8000/api/radios-censales/geojson';
    const urlBounds = filtro
      ? `http://localhost:8000/api/radios-censales/bounds?link=${filtro}`
      : 'http://localhost:8000/api/radios-censales/bounds';

    Promise.all([axios.get(urlGeojson), axios.get(urlBounds)])
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
    setSearchLink('');
    cargarDatosRadios();
  };

  const handleSearch = (e) => {
    e.preventDefault();
    cargarDatosRadios(searchLink);
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

  const pointStyleCasos = (feature) => {
    const cluster = feature.properties.cluster_stdbscan;
    let color = '#94a3b8';
    if (cluster !== null && cluster !== undefined && cluster !== -1) {
      color = `hsl(${(cluster * 60) % 360}, 70%, 50%)`;
    }
    return {
      radius: 5,
      fillColor: color,
      color: '#000',
      weight: 1,
      fillOpacity: 0.8
    };
  };

  const onEachFeatureCaso = (feature, layer) => {
    const p = feature.properties;
    layer.bindPopup(`
      <div style="font-family: sans-serif; font-size: 13px;">
        <strong>${p.evento}</strong><br/>
        Localidad: ${p.localidad}<br/>
        Departamento: ${p.departamento}<br/>
        Año: ${p.anio} - Semana: ${p.semana}<br/>
        Radio censal: ${p.radio_censal_id || 'Sin asignar'}<br/>
        Cluster ST-DBSCAN: ${p.cluster_stdbscan !== null && p.cluster_stdbscan !== undefined ? p.cluster_stdbscan : 'No calculado'}
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

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '10px 20px',
        background: '#0f172a',
        color: 'white',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Visor GIS - Análisis Epidemiológico</h3>
            <small style={{ color: '#94a3b8' }}>
              {loading ? 'Cargando radios...' : `Radios: ${geoJsonData?.features?.length || 0}`}
              {casosGeoJson ? ` | Casos: ${casosGeoJson.features.length}` : ''}
            </small>
          </div>

          <nav style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button onClick={() => setVista('principal')} style={btnStyle(vista === 'principal', '#2563eb')}>Principal</button>
            <button onClick={() => setVista('clustering')} style={btnStyle(vista === 'clustering', '#7c3aed')}>Clustering</button>
            <button onClick={() => setVista('satscan')} style={btnStyle(vista === 'satscan', '#059669')}>SaTScan</button>
            <button onClick={() => setVista('indices')} style={btnStyle(vista === 'indices', '#ea580c')}>Índices</button>
            <button onClick={() => setVista('ciudad')} style={btnStyle(vista === 'ciudad', '#0891b2')}>Por Ciudad</button>
          </nav>
        </div>

        {vista === 'principal' && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="Filtrar link..."
                value={searchLink}
                onChange={(e) => setSearchLink(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: '1px solid #475569',
                  background: '#1e293b',
                  color: 'white',
                  fontSize: '0.85rem'
                }}
              />
              <button type="submit" style={btnStyle(false, '#2563eb')}>Buscar</button>
              {searchLink && (
                <button
                  type="button"
                  onClick={() => { setSearchLink(''); cargarDatosRadios(''); }}
                  style={btnStyle(false, '#475569')}
                >
                  Ver Todo
                </button>
              )}
            </form>

            <button onClick={cargarCasos} disabled={loadingCasos} style={btnStyle(false, '#e11d48')}>
              {loadingCasos ? 'Cargando...' : 'Cargar Casos'}
            </button>

            <button onClick={ejecutarClustering} style={btnStyle(false, '#7c3aed')}>
              Ejecutar Clustering
            </button>

            <button onClick={cargarResumen} style={btnStyle(false, '#059669')}>
              Ver Resumen
            </button>

            <button onClick={limpiarTodo} style={btnStyle(false, '#dc2626')}>
              Limpiar
            </button>
          </div>
        )}
      </header>

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
                  <MapController bounds={mapBounds} />

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
                      {geoJsonData && (
                        <GeoJSON
                          key={JSON.stringify(geoJsonData)}
                          data={geoJsonData}
                          style={radioStyle}
                          onEachFeature={onEachFeatureRadio}
                        />
                      )}
                    </Overlay>

                    <Overlay checked name="Casos ETS">
                      {casosConJitter && (
                        <GeoJSON
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
