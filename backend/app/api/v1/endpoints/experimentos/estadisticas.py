"""Endpoints de resumen, evolución y estadísticas."""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
import numpy as np
import pandas as pd

from database import get_db

router = APIRouter()


# ============================================================
# RESUMEN Y EVOLUCIÓN
# ============================================================
@router.get("/resumen-por-ciudad")
async def resumen_por_ciudad(db: Session = Depends(get_db)):
    query = text("""
        WITH total AS (
            SELECT COUNT(*)::numeric AS n FROM temp_exp_ets
        )
        SELECT localidad, departamento, COUNT(*) as total_casos,
               ROUND((COUNT(*) * 100.0 / t.n)::numeric, 2) as porcentaje
        FROM temp_exp_ets
        CROSS JOIN total t
        GROUP BY localidad, departamento, t.n
        ORDER BY total_casos DESC;
    """)
    return [dict(r._mapping) for r in db.execute(query).fetchall()]


@router.get("/evolucion-temporal")
async def evolucion_temporal(db: Session = Depends(get_db)):
    query = text("""
        SELECT semana_epidemiologica, anio_epidemiologico, COUNT(*) as casos
        FROM temp_exp_ets
        GROUP BY semana_epidemiologica, anio_epidemiologico
        ORDER BY anio_epidemiologico, semana_epidemiologica;
    """)
    return [dict(r._mapping) for r in db.execute(query).fetchall()]


# ============================================================
# ESTADÍSTICAS: RESUMEN, INDICADORES, COMPARATIVA Y ESTACIONALIDAD
# ============================================================
@router.get("/estadisticas/opciones")
async def estadisticas_opciones(db: Session = Depends(get_db)):
    """Opciones disponibles para los filtros de la vista de estadísticas."""
    localidades = db.execute(text("""
        SELECT localidad, departamento, COUNT(*) AS casos
        FROM temp_exp_ets
        WHERE localidad IS NOT NULL AND localidad <> ''
        GROUP BY localidad, departamento
        ORDER BY casos DESC, localidad;
    """)).fetchall()
    eventos = db.execute(text("""
        SELECT evento, COUNT(*) AS casos
        FROM temp_exp_ets
        WHERE evento IS NOT NULL AND evento <> ''
        GROUP BY evento
        ORDER BY casos DESC, evento;
    """)).fetchall()
    anios = db.execute(text("""
        SELECT anio_epidemiologico AS anio,
               COUNT(*) AS casos,
               MAX(semana_epidemiologica) AS max_semana
        FROM temp_exp_ets
        WHERE anio_epidemiologico IS NOT NULL
        GROUP BY anio_epidemiologico
        ORDER BY anio_epidemiologico;
    """)).fetchall()
    return {
        "localidades": [dict(r._mapping) for r in localidades],
        "eventos": [dict(r._mapping) for r in eventos],
        "anios": [dict(r._mapping) for r in anios],
    }


@router.get("/estadisticas")
async def estadisticas(
    localidad: Optional[str] = Query(None),
    evento: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Resumen, indicadores y métricas de la serie epidemiológica semanal.

    Incluye:
    - KPIs generales y por año (variación interanual).
    - Serie semanal por año para gráficos comparativos interanuales.
    - Detección de momentos de alto contagio (media + 1.5 desvíos).
    - Índice de estacionalidad por semana epidemiológica y su varianza explicada
      (la semana 53 se une con la semana 52 para evitar artefactos).
    """
    query = """
        SELECT anio_epidemiologico AS anio, semana_epidemiologica AS semana,
               evento, localidad, departamento, radio_censal_id
        FROM temp_exp_ets
        WHERE anio_epidemiologico IS NOT NULL
          AND semana_epidemiologica IS NOT NULL
    """
    params = {}
    if localidad:
        query += " AND localidad ILIKE :loc"
        params["loc"] = f"%{localidad.strip()}%"
    if evento:
        query += " AND evento = :evento"
        params["evento"] = evento

    rows = db.execute(text(query), params).fetchall()
    df = pd.DataFrame([dict(r._mapping) for r in rows])

    def _r(value, digits=2):
        if value is None:
            return None
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        if not np.isfinite(number):
            return None
        return round(number, digits)

    filtros = {"localidad": localidad or None, "evento": evento or None}

    if df.empty:
        return {
            "vacio": True,
            "filtros": filtros,
            "resumen": {
                "total_casos": 0,
                "n_anios": 0,
                "n_eventos": 0,
                "n_localidades": 0,
                "n_radios": 0,
                "promedio_semanal": 0,
                "mediana_semanal": 0,
                "desvio_semanal": 0,
                "coef_variacion_pct": 0,
                "umbral_alto_contagio": 0,
                "semanas_alto_contagio": 0,
                "varianza_estacional_explicada_pct": 0,
                "rango_relativo_pico_valle_pct": 0,
                "tendencia_anual_pendiente": 0,
                "tendencia_direccion": "sin datos",
            },
            "por_anio": [],
            "por_evento": [],
            "por_localidad": [],
            "serie_anual": [],
            "estacionalidad": [],
            "picos": [],
            "semanas_pico_estacional": [],
        }

    df["anio"] = df["anio"].astype(int)
    df["semana"] = df["semana"].astype(int)
    total_casos = int(len(df))

    # Serie semanal observada (solo semanas con al menos un caso).
    semanal = (
        df.groupby(["anio", "semana"])
        .size()
        .reset_index(name="casos")
        .sort_values(["anio", "semana"])
        .reset_index(drop=True)
    )

    # ---------- Resumen por año ----------
    totales_anio = semanal.groupby("anio")["casos"].sum().to_dict()
    max_semana_anio = df.groupby("anio")["semana"].max().to_dict()
    anios_ordenados = sorted(totales_anio.keys())

    por_anio = []
    for anio in anios_ordenados:
        grupo = semanal[semanal["anio"] == anio]
        casos_anio = int(grupo["casos"].sum())
        semanas_con_casos = int(len(grupo))
        semana_pico_row = grupo.loc[grupo["casos"].idxmax()] if not grupo.empty else None
        anio_previo = totales_anio.get(anio - 1)
        variacion = None
        if anio_previo:
            variacion = _r((casos_anio - anio_previo) * 100.0 / anio_previo, 1)
        por_anio.append({
            "anio": int(anio),
            "casos": casos_anio,
            "semanas_con_casos": semanas_con_casos,
            "promedio_semanal": _r(casos_anio / semanas_con_casos if semanas_con_casos else 0),
            "max_casos_semana": int(semana_pico_row["casos"]) if semana_pico_row is not None else 0,
            "semana_pico": int(semana_pico_row["semana"]) if semana_pico_row is not None else None,
            "variacion_vs_anio_previo_pct": variacion,
            "es_completo": bool(max_semana_anio.get(anio, 0) >= 45),
        })

    # ---------- Métricas de la serie semanal ----------
    valores = semanal["casos"].to_numpy(dtype=float)
    media = float(np.mean(valores))
    mediana = float(np.median(valores))
    desvio = float(np.std(valores))
    coef_variacion = (desvio / media * 100.0) if media > 0 else 0.0
    umbral = media + 1.5 * desvio

    # ---------- Momentos de alto contagio ----------
    picos_df = semanal[semanal["casos"] >= umbral].copy()
    if picos_df.empty:
        picos_df = semanal[semanal["casos"] > media].copy()

    def _nivel(z):
        if z >= 2.5:
            return "Crítico"
        if z >= 1.5:
            return "Alto"
        return "Moderado"

    n_picos = int(len(picos_df))
    picos = []
    if not picos_df.empty:
        picos_df = picos_df.sort_values("casos", ascending=False)
        for _, row in picos_df.head(50).iterrows():
            z = ((row["casos"] - media) / desvio) if desvio > 0 else 0.0
            picos.append({
                "anio": int(row["anio"]),
                "semana": int(row["semana"]),
                "label": f"{int(row['anio'])}-S{int(row['semana']):02d}",
                "casos": int(row["casos"]),
                "zscore": _r(z, 2),
                "nivel": _nivel(z),
            })

    pico_global_row = semanal.loc[semanal["casos"].idxmax()]

    # ---------- Estacionalidad ----------
    anios_completos = [int(a) for a in anios_ordenados if max_semana_anio.get(a, 0) >= 45]
    anios_base = anios_completos if len(anios_completos) >= 2 else anios_ordenados

    # La semana 53 se une con la 52: no todos los años tienen 53 semanas y
    # rellenar la 53 con ceros generaba un valle estacional artificial.
    base_semanal = semanal[semanal["anio"].isin(anios_base)].copy()
    base_semanal["semana"] = base_semanal["semana"].clip(upper=52)
    base_semanal = (
        base_semanal.groupby(["anio", "semana"], as_index=False)["casos"]
        .sum()
    )

    grid = pd.MultiIndex.from_product(
        [anios_base, range(1, 53)], names=["anio", "semana"]
    ).to_frame(index=False)
    grid = grid.merge(base_semanal, on=["anio", "semana"], how="left")
    grid["casos"] = grid["casos"].fillna(0)

    estacionalidad = []
    semanas_pico_estacional = []
    varianza_explicada = 0.0
    rango_relativo = 0.0
    semana_est_max = None
    semana_est_min = None
    if not grid.empty:
        por_semana = (
            grid.groupby("semana")["casos"]
            .agg(casos_total="sum", casos_promedio="mean")
            .reset_index()
            .sort_values("semana")
        )
        media_global = float(grid["casos"].mean())
        if media_global > 0:
            por_semana["indice"] = por_semana["casos_promedio"] / media_global * 100.0
        else:
            por_semana["indice"] = 0.0

        varianza_entre = float(np.var(por_semana["casos_promedio"].to_numpy(dtype=float)))
        varianza_total = float(np.var(grid["casos"].to_numpy(dtype=float)))
        varianza_explicada = (varianza_entre / varianza_total * 100.0) if varianza_total > 0 else 0.0

        promedio_max = float(por_semana["casos_promedio"].max())
        promedio_min = float(por_semana["casos_promedio"].min())
        if media_global > 0:
            rango_relativo = (promedio_max - promedio_min) / media_global * 100.0

        semana_est_max = int(por_semana.loc[por_semana["casos_promedio"].idxmax(), "semana"])
        semana_est_min = int(por_semana.loc[por_semana["casos_promedio"].idxmin(), "semana"])

        for _, row in por_semana.iterrows():
            estacionalidad.append({
                "semana": int(row["semana"]),
                "casos_total": int(row["casos_total"]),
                "casos_promedio": _r(row["casos_promedio"]),
                "indice": _r(row["indice"], 1),
                "n_anios": len(anios_base),
                "alta_temporada": bool(row["indice"] >= 120),
            })

        top_estacional = por_semana.sort_values("casos_promedio", ascending=False).head(5)
        for _, row in top_estacional.iterrows():
            semanas_pico_estacional.append({
                "semana": int(row["semana"]),
                "casos_promedio": _r(row["casos_promedio"]),
                "indice": _r(row["indice"], 1),
            })

    # ---------- Tendencia anual (años completos) ----------
    anios_tendencia = anios_completos if len(anios_completos) >= 2 else anios_ordenados
    pendiente = 0.0
    direccion = "sin datos"
    if len(anios_tendencia) >= 2:
        xs = np.array(anios_tendencia, dtype=float)
        ys = np.array([totales_anio.get(a, 0) for a in anios_tendencia], dtype=float)
        pendiente = float(np.polyfit(xs, ys, 1)[0])
        referencia = float(np.mean(ys)) if len(ys) else 0.0
        if referencia > 0:
            if pendiente > 0.05 * referencia:
                direccion = "creciente"
            elif pendiente < -0.05 * referencia:
                direccion = "decreciente"
            else:
                direccion = "estable"

    # ---------- Distribuciones ----------
    por_evento = []
    eventos_totales = df.groupby("evento").size().sort_values(ascending=False)
    for nombre, casos in eventos_totales.items():
        por_evento.append({
            "evento": nombre if isinstance(nombre, str) else "Sin dato",
            "casos": int(casos),
            "porcentaje": _r(casos * 100.0 / total_casos, 2),
        })

    por_localidad = []
    loc_totales = (
        df.groupby(["localidad", "departamento"]).size()
        .reset_index(name="casos")
        .sort_values("casos", ascending=False)
    )
    for _, row in loc_totales.head(20).iterrows():
        por_localidad.append({
            "localidad": row["localidad"] if isinstance(row["localidad"], str) else "Sin dato",
            "departamento": row["departamento"] if isinstance(row["departamento"], str) else "",
            "casos": int(row["casos"]),
            "porcentaje": _r(row["casos"] * 100.0 / total_casos, 2),
        })

    # ---------- Último año y último año completo ----------
    anio_ultimo = int(anios_ordenados[-1])
    ultimo_completo = anios_completos[-1] if anios_completos else anio_ultimo
    previo_completo = totales_anio.get(ultimo_completo - 1)
    variacion_ultimo_completo = None
    if previo_completo:
        variacion_ultimo_completo = _r(
            (totales_anio.get(ultimo_completo, 0) - previo_completo) * 100.0 / previo_completo,
            1,
        )

    evento_top = por_evento[0] if por_evento else None
    localidad_top = por_localidad[0] if por_localidad else None

    resumen = {
        "total_casos": total_casos,
        "n_anios": len(anios_ordenados),
        "anio_min": int(anios_ordenados[0]),
        "anio_max": anio_ultimo,
        "n_eventos": int(df["evento"].nunique()) if "evento" in df else 0,
        "n_localidades": int(df["localidad"].nunique()) if "localidad" in df else 0,
        "n_radios": int(df["radio_censal_id"].nunique()) if "radio_censal_id" in df else 0,
        "promedio_semanal": _r(media),
        "mediana_semanal": _r(mediana),
        "desvio_semanal": _r(desvio),
        "coef_variacion_pct": _r(coef_variacion, 1),
        "umbral_alto_contagio": _r(umbral),
        "semanas_alto_contagio": n_picos,
        "semana_pico_global": {
            "anio": int(pico_global_row["anio"]),
            "semana": int(pico_global_row["semana"]),
            "casos": int(pico_global_row["casos"]),
            "label": f"{int(pico_global_row['anio'])}-S{int(pico_global_row['semana']):02d}",
        },
        "ultimo_anio": {
            "anio": anio_ultimo,
            "casos": int(totales_anio.get(anio_ultimo, 0)),
            "es_completo": bool(max_semana_anio.get(anio_ultimo, 0) >= 45),
        },
        "ultimo_anio_completo": {
            "anio": int(ultimo_completo),
            "casos": int(totales_anio.get(ultimo_completo, 0)),
            "variacion_vs_anio_previo_pct": variacion_ultimo_completo,
        },
        "tendencia_anual_pendiente": _r(pendiente, 1),
        "tendencia_direccion": direccion,
        "varianza_estacional_explicada_pct": _r(varianza_explicada, 1),
        "rango_relativo_pico_valle_pct": _r(rango_relativo, 1),
        "semana_estacional_max": semana_est_max,
        "semana_estacional_min": semana_est_min,
        "evento_predominante": evento_top,
        "localidad_predominante": localidad_top,
    }

    serie_anual = [
        {"anio": int(row["anio"]), "semana": int(row["semana"]), "casos": int(row["casos"])}
        for _, row in semanal.iterrows()
    ]

    return {
        "vacio": False,
        "filtros": filtros,
        "resumen": resumen,
        "por_anio": por_anio,
        "por_evento": por_evento,
        "por_localidad": por_localidad,
        "serie_anual": serie_anual,
        "estacionalidad": estacionalidad,
        "picos": picos,
        "semanas_pico_estacional": semanas_pico_estacional,
    }