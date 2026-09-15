import React, { useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, Circle } from 'react-leaflet';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';

const { BaseLayer, Overlay } = LayersControl;

export default function VistaSaTScan({ radiosGeoJson }) {
  const [maxSpatialPct, setMaxSpatialPct] = useState(0.5);
  const [maxWeeks, setMaxWeeks] = useState(4);
  const [nSims, setNSims] = useState(99);
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);

  const ejecutar = async () => {
    setLoading(true);
    try {
      const res = await axios.get(
        `http://localhost:8000/api/v1/experimentos/flujo-satscan?max_spatial_pct=${maxSpatialPct}&max_temporal_weeks=${maxWeeks}&n_simulaciones=${nSims}`
      );
      setResultado(res.data);
    } catch (e) {
      console.error(e);
      alert('Error en SaTScan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        padding: 12, background: '#064e3b', color: 'white',
        display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap'
      }}>
        <label>max % espacial: <input type="number" step="0.1" value={maxSpatialPct} onChange={e => setMaxSpatialPct(+e.target.value)} style={{ width: 60 }} /></label>
        <label>max semanas: <input type="number" value={maxWeeks} onChange={e => setMaxWeeks(+e.target.value)} style={{ width: 60 }} /></label>
        <label>simulaciones MC: <input type="number" value={nSims} onChange={e => setNSims(+e.target.value)} style={{ width: 70 }} /></label>
        <button onClick={ejecutar} disabled={loading} style={{
          background: '#059669', color: 'white', border: 'none',
          padding: '8px 16px', borderRadius: 4, cursor: 'pointer'
        }}>
          {loading ? 'Ejecutando...' : '▶ Ejecutar SaTScan Poisson'}
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 2, position: 'relative' }}>
          <MapContainer center={[-43.6, -69.0]} zoom={7} style={{ height: '100%', width: '100%' }}>
            <LayersControl position="topright">
              <BaseLayer checked name="OpenStreetMap">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              </BaseLayer>
              <BaseLayer name="Sin Mapa Base"><TileLayer url="" /></BaseLayer>
              <Overlay checked name="Radios Censales">
                {radiosGeoJson && <GeoJSON data={radiosGeoJson} style={{ color: '#1d4ed8', weight: 1, fillOpacity: 0.1 }} />}
              </Overlay>
              <Overlay checked name="Cilindro SaTScan">
                {resultado && resultado.clusters && resultado.clusters.length > 0 && resultado.clusters.map((c, i) => (
                  c.significativo && (
                    <Circle
                      key={i}
                      center={[c.lat, c.lon]}
                      radius={c.radio_km * 1000}
                      pathOptions={{
                        color: c.significativo ? '#dc2626' : '#facc15',
                        fillOpacity: 0.2
                      }}
                    />
                  )
                ))}
              </Overlay>
            </LayersControl>
          </MapContainer>
        </div>

        <div style={{ flex: 1, background: '#f0fdf4', padding: 16, overflowY: 'auto', minWidth: 300 }}>
          {resultado ? (
            <>
              <h4>Resultado SaTScan</h4>
              <p><b>Tiempo:</b> {resultado.tiempo_ms?.toFixed(1)} ms</p>
              <p><b>Clusters significativos:</b> {resultado.n_clusters_significativos}</p>
              {resultado.clusters && resultado.clusters.map((c, i) => (
                <div key={i} style={{
                  background: 'white', padding: 10, marginTop: 8, borderRadius: 6,
                  borderLeft: `4px solid ${c.significativo ? '#dc2626' : '#facc15'}`
                }}>
                  <p><b>Centro:</b> radio {c.radio_id_centro}</p>
                  <p><b>Radio:</b> {c.radio_km} km</p>
                  <p><b>Periodo:</b> semana {c.semana_inicio} a {c.semana_fin}</p>
                  <p><b>Observados:</b> {c.casos_observados} | <b>Esperados:</b> {c.casos_esperados}</p>
                  <p><b>LLR:</b> {c.llr} | <b>p-value:</b> {c.p_value}</p>
                  <p>{c.significativo ? '✅ Significativo' : '❌ No significativo'}</p>
                </div>
              ))}
              {(!resultado.clusters || resultado.clusters.length === 0) && (
                <p>No se detectaron conglomerados significativos.</p>
              )}
            </>
          ) : (
            <p>Presione "Ejecutar" para correr SaTScan.</p>
          )}
        </div>
      </div>
    </div>
  );
}
