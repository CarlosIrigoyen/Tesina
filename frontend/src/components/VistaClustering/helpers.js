export const leerCluster = (feature) => {
  const props = feature?.properties || {};
  const valor = props.cluster ?? props.cluster_stdbscan;
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isNaN(numero) ? null : numero;
};

export const leerGuardado = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
};

export const agruparConfiguraciones = (configuraciones) => {
  const grupos = new Map();
  configuraciones.forEach((c) => {
    const algoritmo = c.algoritmo || 'Otro';
    if (!grupos.has(algoritmo)) grupos.set(algoritmo, []);
    grupos.get(algoritmo).push(c);
  });
  return [...grupos.entries()];
};

/**
 * Dado un payload de configuración (ST-DBSCAN, ST-kNN o SaTScan),
 * devuelve el estado de mapa completo listo para pintar.
 */
export const construirEstadoDesdeConfiguracion = (cfg) => {
  const algoritmo = cfg.algoritmo;
  const esSatscan = algoritmo === 'SaTScan-Poisson';
  return {
    algoritmo,
    casos: cfg.casos || null,
    poligonos: cfg.poligonos || null,
    clusters: cfg.clusters || [],
    satscanClusters: cfg.satscan_clusters || [],
    resumen: cfg.resumen || {},
    params: cfg.params || {},
    metricas: cfg.metricas || {},
    exploracion: cfg.exploracion_optics || null,
    localidad: cfg.localidad || '',
    modoMapa: esSatscan ? 'satscan' : 'clusters',
  };
};