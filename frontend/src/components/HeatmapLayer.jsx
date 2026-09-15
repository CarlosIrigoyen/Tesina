import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

/**
 * Capa de mapa de calor (heatmap) usando leaflet.heat.
 * puntos: array de [lat, lon, intensidad]
 */
export default function HeatmapLayer({ puntos, radio = 25, blur = 15, maxZoom = 15 }) {
  const map = useMap();

  useEffect(() => {
    if (!puntos || puntos.length === 0) return;

    const layer = L.heatLayer(puntos, {
      radius: radio,
      blur: blur,
      maxZoom: maxZoom,
      gradient: {
        0.2: '#3b82f6',
        0.4: '#22c55e',
        0.6: '#eab308',
        0.8: '#f97316',
        1.0: '#dc2626'
      }
    }).addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [puntos, map, radio, blur, maxZoom]);

  return null;
}
