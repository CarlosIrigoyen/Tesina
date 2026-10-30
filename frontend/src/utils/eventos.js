export const COLORES_EVENTO = {
  'Sífilis': '#e11d48',
  'VIH': '#2563eb',
  'Sífilis en Personas Gestantes': '#f59e0b',
  'Sífilis - RN Expuesto en Investigación': '#7c3aed',
  'Hepatitis C': '#059669',
  'Hepatitis B': '#0891b2',
  'Gonorrea': '#db2777',
  'VIH - Expuesto Perinatal': '#65a30d',
  'VIH en Embarazo': '#0f766e',
  'Infecciones Genitales (Otras)': '#9333ea',
  'Sífilis Congénita': '#dc2626',
  'Htlv': '#475569',
};

export const PALETA_EVENTOS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

export const colorPorEvento = (evento = '') => {
  if (COLORES_EVENTO[evento]) return COLORES_EVENTO[evento];
  let hash = 0;
  for (let i = 0; i < evento.length; i++) {
    hash = (hash * 31 + evento.charCodeAt(i)) >>> 0;
  }
  return PALETA_EVENTOS[hash % PALETA_EVENTOS.length];
};
