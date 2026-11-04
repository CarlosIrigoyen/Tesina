import { agruparConfiguraciones } from './helpers';

export default function PanelConfiguraciones({
  configuraciones, valor, onChange, onRefrescar,
  onEliminar, deshabilitado, cargando,
}) {
  const grupos = agruparConfiguraciones(configuraciones);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        Configuración:
        <select
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          disabled={cargando || deshabilitado}
          style={{ padding: '5px 6px', borderRadius: 4, minWidth: 240, maxWidth: 340 }}
        >
          <option value="">— Actual (sin guardar) —</option>
          {grupos.map(([algoritmo, items]) => (
            <optgroup key={algoritmo} label={algoritmo}>
              {items.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <button onClick={onRefrescar} title="Actualizar lista"
        style={{ background: '#475569', color: 'white', border: 'none',
                 padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}>
        ⟳
      </button>

      <button onClick={onEliminar} disabled={!valor}
        style={{ background: '#b91c1c', color: 'white', border: 'none',
                 padding: '6px 10px', borderRadius: 4,
                 cursor: valor ? 'pointer' : 'not-allowed',
                 opacity: valor ? 1 : 0.5 }}>
        Eliminar
      </button>
    </div>
  );
}