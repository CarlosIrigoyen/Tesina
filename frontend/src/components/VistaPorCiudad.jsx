import { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, Circle, useMap } from 'react-leaflet';
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

  const [clustering, setClustering] = useState(null);
  const [exploracion, setExploracion] = useState(null);
  const [minSamples, setMinSamples] = useState(4);
  const [maxEpsOptics, setMaxEpsOptics] = useState(10);
  const [epsTemporal, setEpsTemporal] = useState(2);
  const [loadingClustering, setLoadingClustering] = useState(false);

  const [satscan, setSatscan] = useState(null);
  const [satscanMulti, setSatscanMulti] = useState(null);
  const [maxSpatialPct, setMaxSpatialPct] = useState(0.3);
  const [maxWeeks, setMaxWeeks] = useState(4);
  const [nSims, setNSims] = useState(19);
  const [maxIter, setMaxIter] = useState(5);
  const [loadingSatscan, setLoadingSatscan] = useState(false);

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
    setClustering(null);
    setExploracion(null);
    setSatscan(null);
    setSatscanMulti(null);
    setError('');
    setLoading(true);
    setCiudadSel(nuevaCiudad);
  };

  const ejecutarClustering = async () => {
    if (!ciudadSel) return;
    setLoadingClustering(true);
    try {
      const locEnc = encodeURIComponent(ciudadSel);
      const res = await axios.get(
        `http://localhost:8000/api/v1/experimentos/ciudad/clustering?localidad=${locEnc}&min_samples=${minSamples}&max_eps_optics=${maxEpsOptics}&eps_temporal_semanas=${epsTemporal}`
      );
      setExploracion(res.data.exploracion_optics);
      setClustering(res.data.clustering_final);
    } catch (e) {
      console.error(e);
      alert('Error en clustering local');
    } finally {
      setLoadingClustering(false);
    }
  };

  const ejecutarSatscan = async () => {
    if (!ciudadSel) return;
    setLoadingSatscan(true);
    try {
      const locEnc = encodeURIComponent(ciudadSel);
      const res = await axios.get(
        `http://localhost:8000/api/v1/experimentos/ciudad/satscan?localidad=${locEnc}&max_spatial_pct=${maxSpatialPct}&max_temporal_weeks=${maxWeeks}&n_simulaciones=${nSims}`
      );
      setSatscan(res.data);
      setSatscanMulti(null);
    } catch (e) {
      console.error(e);
      alert('Error en SaTScan local');
    } finally {
      setLoadingSatscan(false);
    }
  };

  const ejecutarSatscanIterativo = async () => {
    if (!ciudadSel) return;
    setLoadingSatscan(true);
    try {
      const locEnc = encodeURIComponent(ciudadSel);
      const res = await axios.get(
        `http://localhost:8000/api/v1/experimentos/ciudad/satscan-iterativo?localidad=${locEnc}&max_spatial_pct=${maxSpatialPct}&max_temporal_weeks=${maxWeeks}&n_simulaciones=${nSims}&max_iteraciones=${maxIter}`
      );
      setSatscanMulti(res.data);
      setSatscan(null);
    } catch (e) {
      console.error(e);
      alert('Error en SaTScan iterativo');
    } finally {
      setLoadingSatscan(false);
    }
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

  const semanaLegible = (semAbs) => {
    const anio = 2000 + Math.floor((semAbs - 1) / 52);
    const semana = ((semAbs - 1) % 52) + 1;
    return `${anio} S${String(semana).padStart(2, '0')}`;
  };

  const coloresIter = ['#dc2626', '#ea580c', '#d97706', '#65a30d', '#0891b2'];

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

        <span style={{ borderLeft: '1px solid #475569', height: 20 }} />

        <label>
          minPts:{' '}
          <input
            type="number"
            value={minSamples}
            onChange={(e) => setMinSamples(+e.target.value)}
            style={{ width: 45 }}
          />
        </label>
        <label>
          max_eps:{' '}
          <input
            type="number"
            value={maxEpsOptics}
            onChange={(e) => setMaxEpsOptics(+e.target.value)}
            style={{ width: 50 }}
          />
        </label>
        <label>
          Δt:{' '}
          <input
            type="number"
            value={epsTemporal}
            onChange={(e) => setEpsTemporal(+e.target.value)}
            style={{ width: 45 }}
          />
        </label>
        <button
          onClick={ejecutarClustering}
          disabled={loadingClustering || !ciudadSel}
          style={{
            background: '#7c3aed',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          {loadingClustering ? '...' : '▶ Clustering'}
        </button>

        <span style={{ borderLeft: '1px solid #475569', height: 20 }} />

        <label>
          %:{' '}
          <input
            type="number"
            step="0.05"
            value={maxSpatialPct}
            onChange={(e) => setMaxSpatialPct(+e.target.value)}
            style={{ width: 50 }}
          />
        </label>
        <label>
          sem:{' '}
          <input
            type="number"
            value={maxWeeks}
            onChange={(e) => setMaxWeeks(+e.target.value)}
            style={{ width: 45 }}
          />
        </label>
        <label>
          sims:{' '}
          <input
            type="number"
            value={nSims}
            onChange={(e) => setNSims(+e.target.value)}
            style={{ width: 45 }}
          />
        </label>
        <label>
          iter:{' '}
          <input
            type="number"
            value={maxIter}
            onChange={(e) => setMaxIter(+e.target.value)}
            style={{ width: 45 }}
          />
        </label>

        <button
          onClick={ejecutarSatscan}
          disabled={loadingSatscan || !ciudadSel}
          style={{
            background: '#059669',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          {loadingSatscan ? '...' : '▶ SaTScan (1)'}
        </button>
        <button
          onClick={ejecutarSatscanIterativo}
          disabled={loadingSatscan || !ciudadSel}
          style={{
            background: '#b45309',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          {loadingSatscan ? '...' : '▶ SaTScan (múltiple)'}
        </button>
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

              <Overlay checked name="Cilindro SaTScan (único)">
                {satscan &&
                  satscan.clusters &&
                  satscan.clusters.map(
                    (c, i) =>
                      c.lat !== undefined &&
                      c.lon !== undefined && (
                        <Circle
                          key={i}
                          center={[c.lat, c.lon]}
                          radius={c.radio_km * 1000}
                          pathOptions={{
                            color: c.significativo ? '#dc2626' : '#facc15',
                            fillOpacity: 0.25
                          }}
                        />
                      )
                  )}
              </Overlay>

              <Overlay checked name="Cilindros SaTScan (múltiples)">
                {satscanMulti &&
                  satscanMulti.clusters &&
                  satscanMulti.clusters.map(
                    (c, i) =>
                      c.lat !== undefined &&
                      c.lon !== undefined && (
                        <Circle
                          key={i}
                          center={[c.lat, c.lon]}
                          radius={c.radio_km * 1000}
                          pathOptions={{
                            color: coloresIter[i % coloresIter.length],
                            fillOpacity: 0.15
                          }}
                        />
                      )
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
          {exploracion && clustering && (
            <div
              style={{
                background: 'white',
                padding: 12,
                borderRadius: 8,
                marginBottom: 12,
                border: '1px solid #e2e8f0'
              }}
            >
              <h4 style={{ marginTop: 0 }}>Clustering local — {ciudadSel}</h4>
              <p>
                <b>Clusters:</b> {clustering.n_clusters} | <b>Ruido:</b> {clustering.n_ruido} (
                {clustering.pct_ruido?.toFixed(1)}%) | <b>Tiempo:</b> {clustering.tiempo_ms?.toFixed(0)} ms
              </p>
              <p style={{ fontSize: 12, color: '#475569' }}>
                ε={clustering.params.eps_espacial_km} km, Δt={clustering.params.eps_temporal_semanas} sem, minPts=
                {clustering.params.min_samples}
              </p>
            </div>
          )}

          {satscan && (
            <div
              style={{
                background: '#f0fdf4',
                padding: 12,
                borderRadius: 8,
                marginBottom: 12,
                border: '1px solid #86efac'
              }}
            >
              <h4 style={{ marginTop: 0 }}>SaTScan único — {ciudadSel}</h4>
              <p>
                <b>Tiempo:</b> {satscan.tiempo_ms?.toFixed(0)} ms
              </p>
              {satscan.clusters &&
                satscan.clusters.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'white',
                      padding: 10,
                      marginTop: 8,
                      borderRadius: 6,
                      borderLeft: `4px solid ${c.significativo ? '#dc2626' : '#facc15'}`
                    }}
                  >
                    <p>
                      <b>Centro:</b> radio {c.radio_id_centro}
                    </p>
                    <p>
                      <b>Radio:</b> {c.radio_km} km
                    </p>
                    <p>
                      <b>Periodo:</b> {semanaLegible(c.semana_inicio)} → {semanaLegible(c.semana_fin)}
                    </p>
                    <p>
                      <b>Obs:</b> {c.casos_observados} | <b>Esp:</b> {c.casos_esperados}
                    </p>
                    <p>
                      <b>LLR:</b> {c.llr} | <b>p-value:</b> {c.p_value}
                    </p>
                    <p style={{ fontWeight: 'bold', color: c.significativo ? '#059669' : '#dc2626' }}>
                      {c.significativo ? '✅ Significativo' : '❌ No significativo'}
                    </p>
                  </div>
                ))}
            </div>
          )}

          {satscanMulti && (
            <div
              style={{
                background: '#fef3c7',
                padding: 12,
                borderRadius: 8,
                marginBottom: 12,
                border: '1px solid #fbbf24'
              }}
            >
              <h4 style={{ marginTop: 0 }}>SaTScan iterativo — {ciudadSel}</h4>
              <p>
                <b>Clusters detectados:</b> {satscanMulti.n_clusters}
              </p>
              <p>
                <b>Casos sin cluster:</b> {satscanMulti.casos_sin_cluster}
              </p>
              {satscanMulti.clusters &&
                satscanMulti.clusters.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'white',
                      padding: 10,
                      marginTop: 8,
                      borderRadius: 6,
                      borderLeft: `4px solid ${coloresIter[i % coloresIter.length]}`
                    }}
                  >
                    <p>
                      <b>Iteración {c.iteracion}:</b> radio {c.radio_id_centro}
                    </p>
                    <p>
                      <b>Radio:</b> {c.radio_km} km | <b>Periodo:</b> {semanaLegible(c.semana_inicio)} →{' '}
                      {semanaLegible(c.semana_fin)}
                    </p>
                    <p>
                      <b>Obs:</b> {c.casos_observados} | <b>Esp:</b> {c.casos_esperados}
                    </p>
                    <p>
                      <b>LLR:</b> {c.llr} | <b>p-value:</b> {c.p_value}
                    </p>
                  </div>
                ))}
            </div>
          )}

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
