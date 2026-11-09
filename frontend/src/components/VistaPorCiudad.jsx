import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, useMap } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import LeyendaEnfermedades from './LeyendaEnfermedades';
import { colorPorEvento } from '../utils/eventos';

const { BaseLayer, Overlay } = LayersControl;

function AjustarBounds({ geojson }) {
  const map = useMap();
  useEffect(() => {
    if (!geojson || !geojson.features || geojson.features.length === 0) return;
    const layer = L.geoJSON(geojson);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30], duration: 1 });
    }
  }, [geojson, map]);
  return null;
}

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

export default function VistaPorCiudad() {
  const [localidades, setLocalidades] = useState([]);
  const [ciudadSel, setCiudadSel] = useState('');
  const [loadingLocalidades, setLoadingLocalidades] = useState(true);

  const [radiosGeoJson, setRadiosGeoJson] = useState(null);
  const [casosGeoJson, setCasosGeoJson] = useState(null);
  const [desagregado, setDesagregado] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [paginaActual, setPaginaActual] = useState(1);
  const filasPorPagina = 10;

  const casosConJitter = useMemo(() => aplicarJitter(casosGeoJson), [casosGeoJson]);

  const eventosDisponibles = useMemo(() => {
    const set = new Set();
    (casosGeoJson?.features || []).forEach(f => {
      const evento = f.properties?.evento;
      if (evento) set.add(evento);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [casosGeoJson]);

  useEffect(() => {
    let activo = true;
    axios.get('http://localhost:8000/api/v1/experimentos/localidades')
      .then(res => {
        if (!activo) return;
        setLocalidades(res.data);
        if (res.data.length > 0) {
          setLoading(true);
          setCiudadSel(prev => prev || res.data[0].localidad);
        }
      })
      .catch(e => {
        if (!activo) return;
        console.error('Error cargando localidades:', e);
        setError('Error al cargar la lista de localidades');
      })
      .finally(() => {
        if (activo) setLoadingLocalidades(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  useEffect(() => {
    if (!ciudadSel) return;
    let activo = true;
    const base = 'http://localhost:8000/api/v1/experimentos/ciudad';
    const locEnc = encodeURIComponent(ciudadSel);

    Promise.all([
      axios.get(`${base}/radios-geojson?localidad=${locEnc}`),
      axios.get(`${base}/casos-geojson?localidad=${locEnc}`),
      axios.get(`${base}/desagregado?localidad=${locEnc}`),
    ])
      .then(([rRadios, rCasos, rDesag]) => {
        if (!activo) return;
        setRadiosGeoJson(rRadios.data);
        setCasosGeoJson(rCasos.data);
        setDesagregado(rDesag.data);
      })
      .catch(e => {
        if (!activo) return;
        console.error('Error cargando datos de la ciudad:', e);
        setError(`Error al cargar "${ciudadSel}".`);
      })
      .finally(() => {
        if (activo) setLoading(false);
      });
    return () => {
      activo = false;
    };
  }, [ciudadSel]);

  const cambiarCiudad = (nuevaCiudad) => {
    if (!nuevaCiudad) return;
    setPaginaActual(1);
    setRadiosGeoJson(null);
    setCasosGeoJson(null);
    setDesagregado([]);
    setError('');
    setLoading(true);
    setCiudadSel(nuevaCiudad);
  };

  const pointToLayer = (feature, latlng) => {
    return L.circleMarker(latlng, {
      radius: 6,
      fillColor: colorPorEvento(feature.properties.evento),
      color: '#111827',
      weight: 1,
      fillOpacity: 0.85
    });
  };

  const onEachFeatureCaso = (f, l) => {
    const p = f.properties;

    l.bindPopup(`
      <div style="font-family: sans-serif; font-size: 13px;">
        <strong>${p.evento}</strong><br/>
        Caso: ${p.id_caso}<br/>
        Radio: ${p.radio_censal_id}<br/>
        Localidad: ${p.localidad}<br/>
        Semana: ${p.semana}/${p.anio}
      </div>
    `);
  };

  const pct = (v) => (v === null || v === undefined) ? '—' : `${(v * 100).toFixed(1)}%`;

  const totalPaginas = Math.ceil(desagregado.length / filasPorPagina);
  const indiceInicio = (paginaActual - 1) * filasPorPagina;
  const indiceFin = indiceInicio + filasPorPagina;
  const desagregadoPaginado = desagregado.slice(indiceInicio, indiceFin);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Barra superior de controles */}
      <div
        style={{
          padding: 10,
          background: '#1e293b',
          color: 'white',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          fontSize: 13
        }}
      >
        <label>
          <b>Ciudad:</b>{' '}
          <select
            value={ciudadSel}
            onChange={(e) => cambiarCiudad(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 4,
              border: 'none',
              minWidth: 240,
              fontSize: 13
            }}
            disabled={loadingLocalidades}
          >
            {loadingLocalidades && <option>Cargando...</option>}
            {localidades.map((l) => (
              <option key={`${l.localidad}-${l.departamento}`} value={l.localidad}>
                {l.localidad} — {l.departamento} ({l.casos})
              </option>
            ))}
          </select>
        </label>

        <span style={{ color: '#94a3b8' }}>
          {loading
            ? '...'
            : `${desagregado.length} radios · ${desagregado.reduce((s, r) => s + r.casos, 0)} casos · ${casosGeoJson?.features.length || 0} puntos`}
        </span>
      </div>

      {error && (
        <div style={{ padding: 8, background: '#fee2e2', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Mapa */}
        <div style={{ flex: 2, position: 'relative' }}>
          <MapContainer center={[-43.6, -69.0]} zoom={11} style={{ height: '100%', width: '100%' }}>
            {radiosGeoJson && <AjustarBounds geojson={radiosGeoJson} />}
            <LayersControl position="topright">
              <BaseLayer checked name="OpenStreetMap">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              </BaseLayer>
              <BaseLayer name="Satélite">
                <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              </BaseLayer>
              <BaseLayer name="Sin Mapa Base">
                <TileLayer url="" />
              </BaseLayer>

              <Overlay checked name="Radios Censales">
                {radiosGeoJson && (
                  <GeoJSON
                    key={`radios-${ciudadSel}`}
                    data={radiosGeoJson}
                    style={{ color: '#1d4ed8', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.15 }}
                    onEachFeature={(f, l) => l.bindPopup(`<b>Radio:</b> ${f.properties.link}`)}
                  />
                )}
              </Overlay>

              <Overlay checked name="Casos">
                {casosConJitter && (
                  <GeoJSON
                    key={`casos-${ciudadSel}`}
                    data={casosConJitter}
                    pointToLayer={pointToLayer}
                    onEachFeature={onEachFeatureCaso}
                  />
                )}
              </Overlay>
            </LayersControl>
          </MapContainer>
          <LeyendaEnfermedades eventos={eventosDisponibles} />
        </div>

        {/* Panel lateral */}
        <div
          style={{
            flex: 1,
            background: '#f8fafc',
            padding: 12,
            overflowY: 'auto',
            minWidth: 400,
            maxWidth: 550
          }}
        >
          <h4 style={{ marginTop: 0 }}>Desagregado por radio — {ciudadSel}</h4>
          {desagregado.length === 0 && !loading && <p>Sin datos.</p>}
          {desagregado.length > 0 && (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    borderCollapse: 'collapse',
                    width: '100%',
                    fontSize: 12,
                    background: 'white'
                  }}
                >
                  <thead style={{ background: '#0f172a', color: 'white' }}>
                    <tr>
                      <th style={{ padding: 6, textAlign: 'left' }}>Radio</th>
                      <th style={{ padding: 6, textAlign: 'right' }}>Casos</th>
                      <th style={{ padding: 6, textAlign: 'right' }}>% ciudad</th>
                      <th style={{ padding: 6, textAlign: 'right' }}>% prov.</th>
                      <th style={{ padding: 6, textAlign: 'right' }}>Carencias</th>
                      <th style={{ padding: 6, textAlign: 'right' }}>Agua</th>
                      <th style={{ padding: 6, textAlign: 'right' }}>Índ. comp.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {desagregadoPaginado.map((r, i) => (
                      <tr
                        key={r.link || i}
                        style={{
                          borderBottom: '1px solid #e5e7eb',
                          background: i % 2 ? '#f9fafb' : 'white'
                        }}
                      >
                        <td style={{ padding: 6, fontFamily: 'monospace' }}>{r.link}</td>
                        <td style={{ padding: 6, textAlign: 'right', fontWeight: 'bold' }}>{r.casos}</td>
                        <td style={{ padding: 6, textAlign: 'right' }}>{r.pct_ciudad}%</td>
                        <td style={{ padding: 6, textAlign: 'right' }}>{r.pct_provincia}%</td>
                        <td style={{ padding: 6, textAlign: 'right' }}>{pct(r.carencias_sanitarias)}</td>
                        <td style={{ padding: 6, textAlign: 'right' }}>{pct(r.fuente_agua)}</td>
                        <td
                          style={{
                            padding: 6,
                            textAlign: 'right',
                            background: '#fef3c7',
                            fontWeight: 'bold'
                          }}
                        >
                          {pct(r.indice_compuesto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Controles de paginación */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 10,
                  fontSize: 12,
                  color: '#334155'
                }}
              >
                <span>
                  Mostrando {indiceInicio + 1}–{Math.min(indiceFin, desagregado.length)} de {desagregado.length} radios
                </span>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button
                    onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                    disabled={paginaActual === 1}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      background: paginaActual === 1 ? '#f1f5f9' : 'white',
                      cursor: paginaActual === 1 ? 'not-allowed' : 'pointer'
                    }}
                  >
                    ◀
                  </button>
                  <span>
                    Página {paginaActual} / {totalPaginas}
                  </span>
                  <button
                    onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                    disabled={paginaActual === totalPaginas}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      background: paginaActual === totalPaginas ? '#f1f5f9' : 'white',
                      cursor: paginaActual === totalPaginas ? 'not-allowed' : 'pointer'
                    }}
                  >
                    ▶
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}