import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const POR_PAGINA = 20;

export default function PanelIndices() {
  const [datos, setDatos] = useState([]);
  const [correl, setCorrel] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtroCiudad, setFiltroCiudad] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);

  useEffect(() => {
    let activo = true;
    Promise.all([
      axios.get('http://localhost:8000/api/v1/experimentos/resumen-con-indices'),
      axios.get('http://localhost:8000/api/v1/experimentos/correlacion-indices')
    ])
      .then(([r1, r2]) => {
        if (!activo) return;
        setDatos(r1.data);
        setCorrel(r2.data);
      })
      .catch((e) => {
        console.error(e);
        alert('Error al cargar índices (¿cargaste indices_radios en la BD?)');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  const formatoPct = (v) => (v === null || v === undefined) ? '—' : `${(v * 100).toFixed(1)}%`;

  const ciudadesDisponibles = useMemo(() => {
    const set = new Set();
    datos.forEach(r => {
      if (r.localidad) set.add(r.localidad);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [datos]);

  const datosFiltrados = useMemo(() => {
    if (!filtroCiudad) return datos;
    return datos.filter(r => r.localidad === filtroCiudad);
  }, [datos, filtroCiudad]);

  const totalPaginas = Math.max(1, Math.ceil(datosFiltrados.length / POR_PAGINA));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const inicioPagina = (paginaSegura - 1) * POR_PAGINA;
  const datosPagina = datosFiltrados.slice(inicioPagina, inicioPagina + POR_PAGINA);

  const cambiarPagina = (nuevaPagina) => {
    setPaginaActual(Math.min(Math.max(1, nuevaPagina), totalPaginas));
  };

  const botonPaginacionStyle = (deshabilitado) => ({
    background: '#1e293b',
    color: 'white',
    border: 'none',
    padding: '5px 10px',
    borderRadius: 4,
    cursor: deshabilitado ? 'default' : 'pointer',
    fontSize: 12,
    opacity: deshabilitado ? 0.45 : 1
  });

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

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: 12,
        flexWrap: 'wrap',
        marginBottom: 10
      }}>
        <h4 style={{ margin: 0 }}>Detalle por Radio</h4>
        <label style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          fontSize: 11,
          color: '#475569',
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>
          Ciudad
          <select
            value={filtroCiudad}
            onChange={(e) => {
              setFiltroCiudad(e.target.value);
              setPaginaActual(1);
            }}
            style={{
              minWidth: 200,
              padding: '6px 9px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: 'white',
              color: '#0f172a',
              fontSize: 13
            }}
          >
            <option value="">Todas las ciudades</option>
            {ciudadesDisponibles.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, background: 'white' }}>
          <thead style={{ background: '#0f172a', color: 'white' }}>
            <tr>
              <th style={{ padding: 6 }}>Radio Censal</th>
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
            {datosPagina.length === 0 ? (
              <tr>
                <td colSpan={12} style={{ padding: 18, textAlign: 'center', color: '#64748b' }}>
                  No hay radios para la ciudad seleccionada.
                </td>
              </tr>
            ) : (
              datosPagina.map((r, i) => (
                <tr key={r.link ?? i} style={{ borderBottom: '1px solid #e5e7eb', background: i % 2 ? '#f9fafb' : 'white' }}>
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
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        marginTop: 12
      }}>
        <span style={{ fontSize: 12, color: '#475569' }}>
          Mostrando {datosFiltrados.length === 0 ? 0 : inicioPagina + 1}–
          {Math.min(inicioPagina + POR_PAGINA, datosFiltrados.length)} de {datosFiltrados.length} radios
          {' · '}20 por página
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => cambiarPagina(paginaSegura - 1)}
            disabled={paginaSegura <= 1}
            style={botonPaginacionStyle(paginaSegura <= 1)}
          >
            Anterior
          </button>
          <span style={{ fontSize: 12, color: '#475569' }}>
            Página {paginaSegura} de {totalPaginas}
          </span>
          <button
            onClick={() => cambiarPagina(paginaSegura + 1)}
            disabled={paginaSegura >= totalPaginas}
            style={botonPaginacionStyle(paginaSegura >= totalPaginas)}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
