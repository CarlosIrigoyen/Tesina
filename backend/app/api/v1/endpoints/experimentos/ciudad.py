"""Endpoints por ciudad / localidad (sin SaTScan — vive en satscan.py)."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
import pandas as pd

from database import get_db
from app.service import clustering_service

router = APIRouter()


@router.get("/localidades")
async def listar_localidades(db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT localidad, departamento, COUNT(*) AS casos
        FROM temp_exp_ets
        WHERE localidad IS NOT NULL AND localidad <> ''
        GROUP BY localidad, departamento
        ORDER BY casos DESC;
    """)).fetchall()
    return [dict(r._mapping) for r in rows]


@router.get("/ciudad/desagregado")
async def desagregado_ciudad(
    localidad: str = Query(...),
    db: Session = Depends(get_db),
):
    rows = db.execute(text("""
        WITH casos_ciudad AS (
            SELECT radio_censal_id,
                   COUNT(*) AS casos,
                   MIN(localidad) AS localidad,
                   MIN(departamento) AS departamento
            FROM temp_exp_ets
            WHERE localidad ILIKE :loc
              AND radio_censal_id IS NOT NULL
            GROUP BY radio_censal_id
        ),
        total_ciudad AS (
            SELECT SUM(casos)::numeric AS total FROM casos_ciudad
        ),
        total_prov AS (
            SELECT COUNT(*)::numeric AS total FROM temp_exp_ets
        )
        SELECT c.radio_censal_id AS link,
               c.localidad,
               c.departamento,
               c.casos,
               ROUND((c.casos * 100.0 / NULLIF(tc.total, 0))::numeric, 2) AS pct_ciudad,
               ROUND((c.casos * 100.0 / NULLIF(tp.total, 0))::numeric, 2) AS pct_provincia,
               i.actividad, i.carencias_sanitarias, i.demografia,
               i.educacion, i.fuente_agua, i.infraestructuta,
               i.salud, i.indice_compuesto
        FROM casos_ciudad c
        LEFT JOIN indices_radios i ON c.radio_censal_id = i.link
        CROSS JOIN total_ciudad tc
        CROSS JOIN total_prov tp
        ORDER BY c.casos DESC;
    """), {"loc": f"%{localidad}%"}).fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail=f"No hay casos para '{localidad}'")
    return [dict(r._mapping) for r in rows]


@router.get("/ciudad/casos-geojson")
async def casos_ciudad_geojson(
    localidad: str = Query(...),
    db: Session = Depends(get_db),
):
    rows = db.execute(text("""
        SELECT id_caso, evento, semana_epidemiologica, anio_epidemiologico,
               departamento, localidad, latitud, longitud, radio_censal_id,
               cluster_stdbscan,
               ST_X(geom) AS lon, ST_Y(geom) AS lat
        FROM temp_exp_ets
        WHERE localidad ILIKE :loc
    """), {"loc": f"%{localidad}%"}).fetchall()

    features = []
    for row in rows:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [row.lon, row.lat]},
            "properties": {
                "id_caso": row.id_caso,
                "evento": row.evento,
                "semana": row.semana_epidemiologica,
                "anio": row.anio_epidemiologico,
                "departamento": row.departamento,
                "localidad": row.localidad,
                "radio_censal_id": row.radio_censal_id,
                "cluster_stdbscan": row.cluster_stdbscan,
            },
        })
    return {"type": "FeatureCollection", "features": features}


@router.get("/ciudad/radios-geojson")
async def radios_ciudad_geojson(
    localidad: str = Query(...),
    db: Session = Depends(get_db),
):
    import json as _json

    rows = db.execute(text("""
        SELECT DISTINCT r.link, ST_AsGeoJSON(r.geom) AS geojson
        FROM radios_censales r
        WHERE r.link IN (
            SELECT DISTINCT radio_censal_id
            FROM temp_exp_ets
            WHERE localidad ILIKE :loc AND radio_censal_id IS NOT NULL
        )
    """), {"loc": f"%{localidad}%"}).fetchall()

    features = []
    for row in rows:
        if row.geojson:
            features.append({
                "type": "Feature",
                "geometry": _json.loads(row.geojson),
                "properties": {"link": row.link},
            })
    return {"type": "FeatureCollection", "features": features}


@router.get("/ciudad/clustering")
async def clustering_ciudad(
    localidad: str = Query(...),
    min_samples: int = Query(4),
    max_eps_optics: float = Query(10.0),
    eps_temporal_semanas: int = Query(2),
    db: Session = Depends(get_db),
):
    rows = db.execute(text("""
        SELECT id_caso, evento, latitud, longitud,
               anio_epidemiologico, semana_epidemiologica,
               departamento, localidad, radio_censal_id
        FROM temp_exp_ets
        WHERE localidad ILIKE :loc
          AND radio_censal_id IS NOT NULL
    """), {"loc": f"%{localidad}%"}).fetchall()

    if not rows:
        raise HTTPException(status_code=404, detail=f"No hay casos para '{localidad}'")

    df = pd.DataFrame([dict(r._mapping) for r in rows])
    exploracion = clustering_service.explorar_optics_para_parametros(
        df, min_samples, max_eps_optics
    )
    res_stdbscan = clustering_service.ejecutar_st_dbscan(
        df,
        eps_espacial_km=exploracion["eps_espacial_sugerido_km"],
        eps_temporal_semanas=eps_temporal_semanas,
        min_samples=exploracion["min_samples_sugerido"],
    )

    labels_por_id = {
        str(k): int(v) for k, v in zip(df["id_caso"], res_stdbscan["labels"])
    }

    return {
        "exploracion_optics": exploracion,
        "clustering_final": res_stdbscan,
        "labels_por_id": labels_por_id,
    }