import { useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, LayersControl, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import HeatmapLayer from '../HeatmapLayer';
import HeatmapAnimation from '../HeatmapAnimation';
import { colorPorEvento } from '../../utils/eventos';
import { colorCluster } from './constants';
import { leerCluster } from './helpers';

const { BaseLayer, Overlay } = LayersControl;

function CentrarEnCluster({ centro }) {
  const map = useMap();
  useEffect(() => {
    if (centro?.[0] && centro?.[1]) map.setView(centro, 13, { animate: true });
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
    } catch (e) { console.error(e); }
  }, [casos, map]);
  return null;
}

export default function MapaClusters({
  casosCiudad, casosFiltrados, radiosMostrados, poligonosFiltrados,
  clustersVisibles, clustersInfo, clusterSeleccionado, eventoSeleccionado,
  filtroCiudad, mostrarHeatmap, mostrarAnimacion, puntosHeatmap,
  centroMapa, modoMapa, satscanClusters, onSeleccionarRadio,
}) {
  const estiloRadio = () => clusterSeleccionado
    ? { color: '#7c3aed', weight: 1.6, fillColor: '#8b5cf6', fillOpacity: 0.22 }
    : { color: '#1d4ed8', weight: 1, fillOpacity: 0.08 };

  const pointToLayer = (feature, latlng) => {
    const c = leerCluster(feature);
    const destacado = clusterSeleccionado && c === clusterSeleccionado.cluster_id;
    return L.circleMarker(latlng, {
      radius: destacado ? 8 : 5,
      fillColor: colorPorEvento(feature.properties.evento),
      color: destacado ? '#000' : '#333',
      weight: destacado ? 2 : 1,
      fillOpacity: destacado ? 1 : 0.85,
    });
  };

  const onEachFeatureCaso = (f, l) => {
    const p = f.properties;
    const c = leerCluster(f);
    l.bindPopup(`
      <div style="font-family:sans-serif;font-size:13px">
        <strong>${p.evento}</strong><br/>
        Radio: ${p.radio_censal_id || 'sin asignar'}<br/>
        Semana: ${p.semana ?? p.semana_epidemiologica}/${p.anio ?? p.anio_epidemiologico}<br/>
        <b>Cluster: ${c === -1 ? 'Ruido' : c}</b>
      </div>
    `);
  };

  return (
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
              key={`rad-${filtroCiudad || 'all'}-${clusterSeleccionado?.cluster_id || 'all'}-${eventoSeleccionado || 'all'}`}
              data={radiosMostrados}
              style={estiloRadio}
              onEachFeature={(f, layer) => {
                const link = String(f.properties?.link ?? '');
                layer.on('click', () => onSeleccionarRadio?.(link));
              }}
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
              key={`pol-${clustersVisibles.size}-${clusterSeleccionado?.cluster_id || 'all'}-${eventoSeleccionado || 'all'}`}
              data={poligonosFiltrados}
              style={(feature) => {
                const c = feature.properties.cluster;
                const activo = clusterSeleccionado?.cluster_id === c;
                return {
                  color: colorCluster(c), weight: activo ? 4 : 2,
                  fillColor: colorCluster(c), fillOpacity: activo ? 0.5 : 0.25,
                };
              }}
              onEachFeature={(f, l) => {
                const c = f.properties.cluster;
                const info = clustersInfo.find((x) => x.cluster_id === c);
                l.bindPopup(`<b>Cluster ${c}</b><br/>${f.properties.n_puntos} casos<br/>
                  ${info ? `${info.localidades}<br/>Años: ${info.anio_min}-${info.anio_max}<br/>Radios: ${info.n_radios}` : ''}`);
              }}
            />
          )}
        </Overlay>

        <Overlay checked name="Puntos de Clusters">
          {casosFiltrados && (
            <GeoJSON
              key={`pts-${filtroCiudad || 'all'}-${clusterSeleccionado?.cluster_id || 'all'}-${eventoSeleccionado || 'all'}-${clustersVisibles.size}-${casosFiltrados.features.length}`}
              data={casosFiltrados}
              pointToLayer={pointToLayer}
              onEachFeature={onEachFeatureCaso}
            />
          )}
        </Overlay>

        <Overlay checked name="Cilindros SaTScan">
          {modoMapa === 'satscan' && satscanClusters.map((c, i) =>
            c.lat !== undefined && c.lon !== undefined ? (
              <Circle key={`cyl-${i}`}
                center={[c.lat, c.lon]}
                radius={c.radio_km * 1000}
                pathOptions={{
                  color: c.significativo ? '#dc2626' : '#facc15',
                  fillOpacity: 0.2,
                }} />
            ) : null
          )}
        </Overlay>
      </LayersControl>
    </MapContainer>
  );
}