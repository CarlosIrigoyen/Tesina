import { useEffect, useState, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

/**
 * Animación temporal del heatmap por semana epidemiológica.
 * Dibuja un heatmap por cada combinación (año, semana) y permite reproducir la animación.
 */
export default function HeatmapAnimation({ casosGeoJson }) {
  const map = useMap();
  const [frameActual, setFrameActual] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [velocidad, setVelocidad] = useState(600);

  // Lista ordenada de combinaciones (año, semana)
  const frames = useMemo(() => {
    if (!casosGeoJson) return [];
    const set = new Set();
    casosGeoJson.features.forEach(f => {
      const a = f.properties.anio;
      const s = f.properties.semana;
      set.add(`${a}-${String(s).padStart(2, '0')}`);
    });
    return Array.from(set).sort();
  }, [casosGeoJson]);

  // Reproducción automática
  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const timer = setInterval(() => {
      setFrameActual(i => (i + 1) % frames.length);
    }, velocidad);
    return () => clearInterval(timer);
  }, [playing, frames, velocidad]);

  // Dibujar heatmap del frame actual
  useEffect(() => {
    if (!casosGeoJson || frames.length === 0) return;
    const frame = frames[frameActual];
    const [anioStr, semStr] = frame.split('-');
    const anio = +anioStr;
    const semana = +semStr;

    const puntos = casosGeoJson.features
      .filter(f => f.properties.anio === anio && f.properties.semana === semana)
      .map(f => [f.geometry.coordinates[1], f.geometry.coordinates[0], 1]);

    if (puntos.length === 0) return;

    const layer = L.heatLayer(puntos, {
      radius: 30,
      blur: 20,
      maxZoom: 15,
      gradient: {
        0.2: '#3b82f6',
        0.5: '#eab308',
        1.0: '#dc2626'
      }
    }).addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [frameActual, frames, casosGeoJson, map]);

  // Controles flotantes
  if (frames.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(15, 23, 42, 0.95)',
        color: 'white',
        padding: 12,
        borderRadius: 8,
        zIndex: 1000,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        fontSize: 13,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
      }}
    >
      <button
        onClick={() => setPlaying(p => !p)}
        style={{
          background: '#2563eb',
          color: 'white',
          border: 'none',
          padding: '6px 12px',
          borderRadius: 4,
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        {playing ? '⏸ Pausar' : '▶ Reproducir'}
      </button>

      <input
        type="range"
        min={0}
        max={frames.length - 1}
        value={frameActual}
        onChange={e => setFrameActual(+e.target.value)}
        style={{ width: 250 }}
      />

      <span style={{ minWidth: 130, fontFamily: 'monospace' }}>
        {frames[frameActual]} ({frameActual + 1}/{frames.length})
      </span>

      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        Velocidad:
        <input
          type="range"
          min={100}
          max={2000}
          step={100}
          value={velocidad}
          onChange={e => setVelocidad(+e.target.value)}
          style={{ width: 80 }}
        />
      </label>
    </div>
  );
}
