import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function PanelIndices() {
  const [datos, setDatos] = useState([]);
  const [correl, setCorrel] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      const [r1, r2] = await Promise.all([
        axios.get('http://localhost:8000/api/v1/experimentos/resumen-con-indices'),
        axios.get('http://localhost:8000/api/v1/experimentos/correlacion-indices')
      ]);
      setDatos(r1.data);
      setCorrel(r2.data);
    } catch (e) {
      console.error(e);
      alert('Error al cargar índices (¿cargaste indices_radios en la BD?)');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const formatoPct = (v) => (v === null || v === undefined) ? '—' : `${(v * 100).toFixed(1)}%`;

  const correlData = correl?.correlaciones_pearson_casos_vs_indice
    ? Object.entries(correl.correlaciones_pearson_casos_vs_indice).map(([k, v]) => ({ indice: k, valor: v }))
    : [];

  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%', background: '#f8fafc' }}>
      <h3>Índices Socio-Demográficos por Radio Censal</h3>
      <p style={{ fontSize: 13, color: '#475569' }}>
        Valores reales (0 a 1) que representan porcentajes por radio. Cruzados con los casos de cada radio.
      </p>

      {cargando && <p>Cargando...</p>}

      {correl && correl.correlaciones_pearson_casos_vs_indice && (
        <div style={{ marginBottom: 20 }}>
          <h4>Correlación (Pearson) entre Casos y cada Índice</h4>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={correlData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="indice" angle={-30} textAnchor="end" height={80} />
                <YAxis domain={[-1, 1]} />
                <Tooltip formatter={(v) => v.toFixed(4)} />
                <Bar dataKey="valor">
                  {correlData.map((d, i) => (
                    <Cell key={i} fill={d.valor >= 0 ? '#059669' : '#dc2626'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <small>Radios analizados: {correl.n_radios_analizados}</small>
        </div>
      )}

      <h4>Detalle por Radio</h4>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, background: 'white' }}>
          <thead style={{ background: '#0f172a', color: 'white' }}>
            <tr>
              <th style={{ padding: 6 }}>Link</th>
              <th style={{ padding: 6 }}>Localidad</th>
              <th style={{ padding: 6 }}>Casos</th>
              <th style={{ padding: 6 }}>% Total</th>
              <th style={{ padding: 6 }}>Actividad</th>
              <th style={{ padding: 6 }}>Carencias Sanit.</th>
              <th style={{ padding: 6 }}>Demografía</th>
              <th style={{ padding: 6 }}>Educación</th>
              <th style={{ padding: 6 }}>Fuente Agua</th>
              <th style={{ padding: 6 }}>Infraestructura</th>
              <th style={{ padding: 6 }}>Salud</th>
              <th style={{ padding: 6 }}>Índice Compuesto</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 ? '#f9fafb' : 'white' }}>
                <td style={{ padding: 6 }}>{r.link}</td>
                <td style={{ padding: 6 }}>{r.localidad}</td>
                <td style={{ padding: 6, fontWeight: 'bold' }}>{r.casos}</td>
                <td style={{ padding: 6 }}>{r.pct_del_total}%</td>
                <td style={{ padding: 6 }}>{formatoPct(r.actividad)}</td>
                <td style={{ padding: 6 }}>{formatoPct(r.carencias_sanitarias)}</td>
                <td style={{ padding: 6 }}>{formatoPct(r.demografia)}</td>
                <td style={{ padding: 6 }}>{formatoPct(r.educacion)}</td>
                <td style={{ padding: 6 }}>{formatoPct(r.fuente_agua)}</td>
                <td style={{ padding: 6 }}>{formatoPct(r.infraestructuta)}</td>
                <td style={{ padding: 6 }}>{formatoPct(r.salud)}</td>
                <td style={{ padding: 6, background: '#fef3c7', fontWeight: 'bold' }}>{formatoPct(r.indice_compuesto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
