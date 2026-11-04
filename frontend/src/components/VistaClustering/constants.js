export const API = 'http://localhost:8000/api/v1/experimentos';
export const STORAGE_KEY = 'clustering_resultados_v6';

export const ETIQUETAS_INDICES = [
  ['actividad', 'Actividad'],
  ['carencias_sanitarias', 'Carencias sanitarias'],
  ['demografia', 'Demografía'],
  ['educacion', 'Educación'],
  ['fuente_agua', 'Fuente de agua'],
  ['infraestructuta', 'Infraestructura'],
  ['salud', 'Salud'],
  ['indice_compuesto', 'Índice compuesto'],
];

export const COLORES_ALGORITMO = {
  'ST-DBSCAN': '#7c3aed',
  'ST-kNN': '#059669',
  'SaTScan-Poisson': '#ea580c',
};

export const formatoPct = (v) =>
  v === null || v === undefined ? '—' : `${(v * 100).toFixed(1)}%`;

export const colorCluster = (c) => {
  if (c === null || c === undefined || c === -1) return '#94a3b8';
  return `hsl(${(c * 47) % 360}, 70%, 50%)`;
};