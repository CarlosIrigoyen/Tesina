import { useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

/**
 * Capa de calor para un frame temporal (año + semana epidemiológica).
 * frame: string con formato "AAAA-SS".
 */
export default function HeatmapFrame({ casosGeoJson, frame }) {
  const map = useMap();

  const puntos = useMemo(() => {
    if (!casosGeoJson?.features || !frame) return [];
    const [anioStr, semanaStr] = frame.split('-');
    const anio = Number(anioStr);
    const semana = Number(semanaStr);

    return casosGeoJson.features
      .filter(f => {
        const p = f.properties || {};
        return Number(p.anio) === anio && Number(p.semana) === semana;
      })
      .map(f => {
        const [lon, lat] = f.geometry?.coordinates || [];
        return [lat, lon, 1];
      })
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
  }, [casosGeoJson, frame]);

  useEffect(() => {
    if (puntos.length === 0) return undefined;

    const layer = L.heatLayer(puntos, {
      radius: 32,
      blur: 22,
      maxZoom: 15,
      minOpacity: 0.35,
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
  }, [puntos, map]);

  return null;
}
