"""Endpoints de clustering (OPTICS→ST-DBSCAN) y parámetros."""
from typing import Optional
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

import numpy as np
import pandas as pd

from database import get_db
from app.service import clustering_service, experimento_service
from ._common import filtrar_por_localidad

router = APIRouter()
logger = logging.getLogger(__name__)

MIN_CASOS_ABSOLUTO = 3

def _json_safe(obj):
    if isinstance(obj, dict):
        return {str(k): _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, np.integer):
        return int(obj)
    if isinstance(obj, np.floating):
        v = float(obj)
        return v if np.isfinite(v) else None
    if isinstance(obj, np.ndarray):
        return _json_safe(obj.tolist())
    return obj

def _construir_casos(df: pd.DataFrame, labels) -> dict:
    labels = list(labels)
    feats = []
    for i, row in df.reset_index(drop=True).iterrows():
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(row["longitud"]), float(row["latitud"])]},
            "properties": {
                "id_caso": str(row.get("id_caso", "")),
                "evento": row.get("evento"),
                "semana": int(row["semana_epidemiologica"]) if pd.notna(row.get("semana_epidemiologica")) else None,
                "anio": int(row["anio_epidemiologico"]) if pd.notna(row.get("anio_epidemiologico")) else None,
                "departamento": row.get("departamento"),
                "localidad": row.get("localidad"),
                "radio_censal_id": row.get("radio_censal_id"),
                "cluster": int(labels[i]) if i < len(labels) else None,
            },
        })
    return {"type": "FeatureCollection", "features": feats}

def _construir_poligonos(df: pd.DataFrame, labels) -> dict:
    try:
        from shapely.geometry import MultiPoint, mapping
    except ImportError:
        return {"type": "FeatureCollection", "features": []}

    labels = np.asarray(labels)
    feats = []
    for c in sorted(set(labels)):
        if c == -1: continue
        idx = np.where(labels == c)[0]
        if len(idx) < 3: continue
        pts = [(float(df.iloc[i]["longitud"]), float(df.iloc[i]["latitud"])) for i in idx]
        feats.append({
            "type": "Feature",
            "geometry": mapping(MultiPoint(pts).convex_hull),
            "properties": {"cluster": int(c), "n_puntos": int(len(idx))},
        })
    return {"type": "FeatureCollection", "features": feats}

def _construir_clusters(df: pd.DataFrame, labels, indices: dict) -> list:
    labels = np.asarray(labels)
    out = []
    for c in sorted(set(labels)):
        if c == -1: continue
        idx = np.where(labels == c)[0]
        sub = df.iloc[idx]
        radios_list = []
        for link, count in sub.groupby("radio_censal_id").size().items():
            link_str = str(link)
            item = {
                "link": link_str,
                "radio_censal_id": link_str,
                "casos": int(count),
                "localidad": sub.loc[sub["radio_censal_id"] == link, "localidad"].iloc[0] if "localidad" in sub else None,
            }
            item.update(indices.get(link_str, {}))
            radios_list.append(item)

        out.append({
            "cluster_id": int(c),
            "n_casos": int(len(idx)),
            "n_radios": int(sub["radio_censal_id"].nunique()),
            "n_localidades": int(sub["localidad"].nunique()) if "localidad" in sub else 0,
            "n_eventos": int(sub["evento"].nunique()) if "evento" in sub else 0,
            "localidades": ", ".join(sorted({str(x) for x in sub["localidad"].dropna().unique()})) if "localidad" in sub else "",
            "eventos": ", ".join(sorted({str(x) for x in sub["evento"].dropna().unique()})) if "evento" in sub else "",
            "anio_min": int(sub["anio_epidemiologico"].min()) if "anio_epidemiologico" in sub else None,
            "anio_max": int(sub["anio_epidemiologico"].max()) if "anio_epidemiologico" in sub else None,
            "sem_min": int(sub["semana_epidemiologica"].min()) if "semana_epidemiologica" in sub else None,
            "sem_max": int(sub["semana_epidemiologica"].max()) if "semana_epidemiologica" in sub else None,
            "centro_lat": float(sub["latitud"].mean()) if "latitud" in sub else None,
            "centro_lon": float(sub["longitud"].mean()) if "longitud" in sub else None,
            "radios": radios_list,
        })
    return out

def _leer_indices_radios(db: Session) -> dict:
    try:
        rows = db.execute(text("SELECT link, actividad, carencias_sanitarias, demografia, educacion, fuente_agua, infraestructuta, salud, indice_compuesto FROM indices_radios")).fetchall()
        return {
            str(r._mapping["link"]): {
                k: (float(r._mapping[k]) if r._mapping[k] is not None else None)
                for k in ("actividad", "carencias_sanitarias", "demografia", "educacion", "fuente_agua", "infraestructuta", "salud", "indice_compuesto")
            } for r in rows
        }
    except Exception:
        return {}

def _construir_configuracion(db, df, labels, algoritmo, params, localidad, exploracion=None, metricas=None, tiempo_ms=0.0) -> dict:
    labels = list(labels)
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_ruido = sum(1 for x in labels if x == -1)
    pct_ruido = (n_ruido / len(labels) * 100.0) if labels else 0.0
    indices = _leer_indices_radios(db)

    return {
        "id": f"{algoritmo.replace(' ', '_')}_{pd.Timestamp.now().strftime('%Y%m%d%H%M%S')}",
        "nombre": f"{algoritmo} · {localidad or 'Todas'}",
        "algoritmo": algoritmo,
        "localidad": localidad or "",
        "params": _json_safe(params),
        "resumen": {"n_clusters": n_clusters, "n_ruido": n_ruido, "pct_ruido": round(pct_ruido, 2), "tiempo_ms": round(float(tiempo_ms), 2)},
        "metricas": _json_safe(metricas or {}),
        "exploracion_optics": _json_safe(exploracion) if exploracion else None,
        "casos": _json_safe(_construir_casos(df, labels)),
        "poligonos": _json_safe(_construir_poligonos(df, labels)),
        "clusters": _json_safe(_construir_clusters(df, labels, indices)),
        "satscan_clusters": [],
    }

def _validar_localidad(localidad: Optional[str]) -> str:
    if not localidad or not str(localidad).strip():
        raise HTTPException(status_code=400, detail="Seleccioná una ciudad antes de ejecutar el clustering.")
    return str(localidad).strip()

def _validar_casos(df: pd.DataFrame, localidad: str) -> int:
    n = len(df)
    if n < MIN_CASOS_ABSOLUTO:
        raise HTTPException(status_code=400, detail=f"Se necesitan al menos {MIN_CASOS_ABSOLUTO} casos para clustering. {localidad} tiene {n}.")
    return n

@router.get("/flujo-clustering")
async def flujo_clustering(
    min_samples: int = Query(5),
    max_eps_optics: float = Query(20.0),
    eps_temporal_semanas: int = Query(2),
    localidad: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    localidad = _validar_localidad(localidad)
    df = experimento_service.obtener_datos_completos_ets(db)
    df = filtrar_por_localidad(df, localidad).reset_index(drop=True)
    if df.empty:
        raise HTTPException(404, detail=f"No hay casos para '{localidad}'.")

    n = _validar_casos(df, localidad)
    min_samples_efectivo = max(2, min(min_samples, n))

    exploracion = clustering_service.explorar_optics_para_parametros(df, min_samples_efectivo, max_eps_optics)
    res_stdbscan = clustering_service.ejecutar_st_dbscan(
        df,
        eps_espacial_km=exploracion["eps_espacial_sugerido_km"],
        eps_temporal_semanas=eps_temporal_semanas,
        min_samples=exploracion["min_samples_sugerido"],
    )

    db.execute(text("ALTER TABLE temp_exp_ets ADD COLUMN IF NOT EXISTS cluster_stdbscan INT;"))
    db.commit()

    row_max = db.execute(text("SELECT COALESCE(MAX(cluster_stdbscan) + 1, 0) FROM temp_exp_ets WHERE cluster_stdbscan IS NOT NULL AND cluster_stdbscan <> -1")).fetchone()
    offset = int(row_max[0] or 0)

    for idx, row in df.iterrows():
        label = res_stdbscan["labels"][idx]
        db.execute(text("UPDATE temp_exp_ets SET cluster_stdbscan = :cs WHERE id_caso = :id"), {"cs": int(label) + offset if label != -1 else -1, "id": row["id_caso"]})
    db.commit()

    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS clustering_metadata (
                id SERIAL PRIMARY KEY, ejecutado_en TIMESTAMP DEFAULT NOW(),
                eps_espacial_km FLOAT, eps_temporal_semanas INT, min_samples INT,
                n_clusters INT, n_ruido INT, pct_ruido FLOAT, tiempo_ms FLOAT
            );
        """))
        db.execute(text("""
            INSERT INTO clustering_metadata (eps_espacial_km, eps_temporal_semanas, min_samples, n_clusters, n_ruido, pct_ruido, tiempo_ms)
            VALUES (:e, :t, :m, :nc, :nr, :pr, :tm)
        """), {
            "e": res_stdbscan["params"]["eps_espacial_km"], "t": res_stdbscan["params"]["eps_temporal_semanas"], "m": res_stdbscan["params"]["min_samples"],
            "nc": res_stdbscan["n_clusters"], "nr": res_stdbscan["n_ruido"], "pr": res_stdbscan["pct_ruido"], "tm": res_stdbscan["tiempo_ms"],
        })
        db.commit()
    except Exception:
        db.rollback()

    configuracion = _construir_configuracion(
        db, df, res_stdbscan["labels"], "ST-DBSCAN", params=res_stdbscan["params"], localidad=localidad,
        exploracion=exploracion, metricas=None, tiempo_ms=res_stdbscan["tiempo_ms"],
    )

    return {"exploracion_optics": exploracion, "clustering_final": res_stdbscan, "configuracion": configuracion}

@router.get("/clustering-configuraciones")
async def listar_configuraciones_clustering():
    return []

@router.get("/clustering-parametros")
async def clustering_parametros(db: Session = Depends(get_db)):
    try:
        row = db.execute(text("SELECT eps_espacial_km, eps_temporal_semanas, min_samples, n_clusters, n_ruido, pct_ruido, tiempo_ms, ejecutado_en FROM clustering_metadata ORDER BY ejecutado_en DESC LIMIT 1")).fetchone()
        return dict(row._mapping) if row else {}
    except Exception:
        return {}