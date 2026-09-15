import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, useMap } from 'react-leaflet';
import axios from 'axios';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const { BaseLayer, Overlay } = LayersControl;

function MapController({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length === 2) {
      map.fitBounds(bounds, { padding: [20, 20], duration: 1.5 });
    }
  }, [bounds, map]);
  return null;
}

export default function VistaMapa({ casosGeoJson, onCasosCargados }) {
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [loadingCasos, setLoadingCasos] = useState(false);
  const [searchLink, setSearchLink] = useState('');

  useEffect(() => { cargarRadios(''); }, []);

  const cargarRadios = async (filtro) => {
    try {
      const urlG = filtro
        ? `http://localhost:8000/api/radios-censales/geojson?link=${filtro}`
        : 'http://localhost:8000/api/radios-censales/geojson';
      const urlB = filtro
        ? `http://localhost:8000/api/radios-censales/bounds?link=${filtro}`
        : 'http://localhost:8000/api/radios-censales/bounds';
      const [g, b] = await Promise.all([axios.get(urlG), axios.get(urlB)]);
      setGeoJsonData(g.data);
      if (b.data?.bounds) setMapBounds(b.data.bounds);
    } catch (e) {
      console.error(e);
    }
  };

  const cargarCasos = async () => {
    setLoadingCasos(true);
    try {
      await axios.post('http://localhost:8000/api/v1/experimentos/cargar-casos?csv_path=casos_grupo_ets_completo.csv&years_back=5');
      await onCasosCargados();
      alert('Casos cargados correctamente');
    } catch (e) {
      alert('Error al cargar casos');
    } finally {
      setLoadingCasos(false);
    }
  };

  const cargarResumen = async () => {
    const r = await axios.get('http://localhost:8000/api/v1/experimentos/resumen-por-ciudad');
    setResumen(r.data);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    cargarRadios(searchLink);
  };

  const radioStyle = { color: '#1d4ed8', weight: 1.2, fillColor: '#3b82f6', fillOpacity: 0.35 };
  const onEachRadio = (f, layer) => {
    layer.bindPopup(`<b>Radio:</b> ${f.properties.link}`);
  };

  const pointStyle = (f) => {
    const c = f.properties.cluster_stdbscan;
    let color = '#94a3b8';
    if (c !== null && c !== undefined && c !== -1) {
      color = `hsl(${(c * 60) % 360}, 70%, 50%)`;
    }
    return { radius: 5, fillColor: color, color: '#000', weight: 1, fillOpacity: 0.8 };
  };

  const onEachCaso = (f, layer) => {
    const p = f.properties;
    layer.bindPopup(`
      <b>${p.evento}</b><br/>
      ${p.localidad} - ${p.departamento}<br/>
      Año ${p.anio} / Semana ${p.semana}<br/>
      Radio: ${p.radio_censal_id || 'Sin asignar'}<br/>
      Cluster ST-DBSCAN: ${p.cluster_stdbscan ?? 'No calculado'}
    `);
  };

  return (
    <div className="w-full h-full relative">
      <div className="absolute top-2 left-2 z-[1000] flex gap-2 flex-wrap">
        <form onSubmit={handleSearch} className="flex gap-1">
          <input
            type="text"
            placeholder="Filtrar link..."
            value={searchLink}
            onChange={e => setSearchLink(e.target.value)}
            className="px-2 py-1 rounded text-sm border border-slate-400"
          />
          <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded text-sm">
            Buscar
          </button>
        </form>
        <button onClick={cargarCasos} disabled={loadingCasos} className="bg-rose-600 text-white px-3 py-1 rounded text-sm">
          {loadingCasos ? 'Cargando...' : 'Cargar Casos ETS'}
        </button>
        <button onClick={cargarResumen} className="bg-emerald-600 text-white px-3 py-1 rounded text-sm">
          Ver Resumen
        </button>
        <a href="http://localhost:8000/api/v1/experimentos/reporte-pdf" className="bg-slate-700 text-white px-3 py-1 rounded text-sm">
          Exportar PDF
        </a>
      </div>

      <MapContainer center={[-43.6, -69.0]} zoom={7} className="w-full h-full">
        <MapController bounds={mapBounds} />
        <LayersControl position="topright">
          <BaseLayer checked name="OpenStreetMap">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          </BaseLayer>
          <BaseLayer name="Fondo neutro">
            <TileLayer url="" />
          </BaseLayer>
          <Overlay checked name="Radios Censales">
            {geoJsonData && <GeoJSON data={geoJsonData} style={radioStyle} onEachFeature={onEachRadio} />}
          </Overlay>
          <Overlay checked name="Casos ETS">
            {casosGeoJson && (
              <GeoJSON
                data={casosGeoJson}
                pointToLayer={(f, latlng) => L.circleMarker(latlng, pointStyle(f))}
                onEachFeature={onEachCaso}
              />
            )}
          </Overlay>
        </LayersControl>
      </MapContainer>

      {resumen && (
        <div className="absolute bottom-4 left-4 bg-white p-3 rounded shadow max-h-72 overflow-y-auto z-[1000] text-sm">
          <h4 className="font-semibold mb-2">Resumen por Localidad</h4>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left">Localidad</th>
                <th>Casos</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((r, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td>{r.localidad}</td>
                  <td className="text-right">{r.total_casos}</td>
                  <td className="text-right">{r.porcentaje}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
