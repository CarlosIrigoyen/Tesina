"""Endpoints de consulta de clusters."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db

router = APIRouter()


@router.get("/clusters-poligonos")
async def clusters_poligonos(localidad: Optional[str] = Query(None), db: Session = Depends(get_db)):
    from shapely.geometry import MultiPoint, mapping
    query = """
        SELECT cluster_stdbscan,
               ARRAY_AGG(latitud) AS lats,
               ARRAY_AGG(longitud) AS lons
        FROM temp_exp_ets
        WHERE cluster_stdbscan IS NOT NULL AND cluster_stdbscan <> -1
    """
    params = {}
    if localidad:
        query += " AND localidad ILIKE :loc"
        params["loc"] = f"%{localidad.strip()}%"
    query += " GROUP BY cluster_stdbscan"

    features = []
    for row in db.execute(text(query), params).fetchall():
        lats = row.lats or []
        lons = row.lons or []
        if len(lats) < 3:
            continue
        mp = MultiPoint(list(zip(lons, lats)))
        features.append({
            "type": "Feature",
            "geometry": mapping(mp.convex_hull),
            "properties": {"cluster": int(row.cluster_stdbscan), "n_puntos": len(lats)},
        })
    return {"type": "FeatureCollection", "features": features}


@router.get("/clusters-info")
async def clusters_info(localidad: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = """
        SELECT cluster_stdbscan AS cluster_id,
               COUNT(*) AS n_casos,
               COUNT(DISTINCT radio_censal_id) AS n_radios,
               COUNT(DISTINCT localidad) AS n_localidades,
               COUNT(DISTINCT evento) AS n_eventos,
               STRING_AGG(DISTINCT localidad, ', ' ORDER BY localidad) AS localidades,
               STRING_AGG(DISTINCT evento, ', ' ORDER BY evento) AS eventos,
               MIN(anio_epidemiologico) AS anio_min,
               MAX(anio_epidemiologico) AS anio_max,
               MIN(semana_epidemiologica) AS sem_min,
               MAX(semana_epidemiologica) AS sem_max,
               AVG(latitud) AS centro_lat,
               AVG(longitud) AS centro_lon
        FROM temp_exp_ets
        WHERE cluster_stdbscan IS NOT NULL AND cluster_stdbscan <> -1
    """
    params = {}
    if localidad:
        query += " AND localidad ILIKE :loc"
        params["loc"] = f"%{localidad.strip()}%"
    query += " GROUP BY cluster_stdbscan ORDER BY cluster_stdbscan"
    return [dict(r._mapping) for r in db.execute(text(query), params).fetchall()]


@router.get("/cluster-casos/{cluster_id}")
async def cluster_casos(cluster_id: int, localidad: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = """
        SELECT id_caso, evento, radio_censal_id,
               semana_epidemiologica, anio_epidemiologico,
               localidad, departamento, latitud, longitud
        FROM temp_exp_ets
        WHERE cluster_stdbscan = :cid
    """
    params = {"cid": cluster_id}
    if localidad:
        query += " AND localidad ILIKE :loc"
        params["loc"] = f"%{localidad.strip()}%"
    query += " ORDER BY anio_epidemiologico, semana_epidemiologica, id_caso"
    return [dict(r._mapping) for r in db.execute(text(query), params).fetchall()]


@router.get("/cluster-radios/{cluster_id}")
async def cluster_radios(cluster_id: int, localidad: Optional[str] = Query(None), db: Session = Depends(get_db)):
    query = """
        WITH agregados AS (
            SELECT radio_censal_id, MIN(localidad) AS localidad, COUNT(*) AS casos
            FROM temp_exp_ets
            WHERE cluster_stdbscan = :cid AND radio_censal_id IS NOT NULL
    """
    params = {"cid": cluster_id}
    if localidad:
        query += " AND localidad ILIKE :loc"
        params["loc"] = f"%{localidad.strip()}%"
    query += """
            GROUP BY radio_censal_id
        )
        SELECT a.radio_censal_id AS link, a.radio_censal_id, a.localidad, a.casos,
               i.actividad, i.carencias_sanitarias, i.demografia, i.educacion,
               i.fuente_agua, i.infraestructuta, i.salud, i.indice_compuesto
        FROM agregados a
        LEFT JOIN indices_radios i ON a.radio_censal_id = i.link
        ORDER BY a.casos DESC
    """
    return [dict(r._mapping) for r in db.execute(text(query), params).fetchall()]


@router.get("/radio-indices/{link}")
async def radio_indices(link: str, db: Session = Depends(get_db)):
    query = text("""
        SELECT :link AS link,
               (SELECT MIN(localidad) FROM temp_exp_ets WHERE radio_censal_id = :link) AS localidad,
               (SELECT COUNT(*) FROM temp_exp_ets WHERE radio_censal_id = :link) AS casos,
               i.actividad, i.carencias_sanitarias, i.demografia, i.educacion,
               i.fuente_agua, i.infraestructuta, i.salud, i.indice_compuesto
        FROM (SELECT 1) dummy
        LEFT JOIN indices_radios i ON i.link = :link
    """)
    row = db.execute(query, {"link": link}).fetchone()
    if not row:
        raise HTTPException(404, detail=f"No se encontró el radio '{link}'")
    data = dict(row._mapping)
    indices = {
        k: data.pop(k) for k in [
            "actividad", "carencias_sanitarias", "demografia", "educacion",
            "fuente_agua", "infraestructuta", "salud", "indice_compuesto",
        ]
    }
    return {**data, "indices": indices}