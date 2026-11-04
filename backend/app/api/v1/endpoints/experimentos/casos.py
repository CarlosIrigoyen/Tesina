"""Endpoints de carga y geo-renderizado de casos ETS."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from app.service import experimento_service

router = APIRouter()


@router.post("/cargar-casos")
async def cargar_casos_ets(
    csv_path: str = Query("casos_grupo_ets_completo.csv"),
    years_back: int = 5,
    db: Session = Depends(get_db),
):
    try:
        return experimento_service.preparar_tabla_experimento_ets(db, csv_path, years_back)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/casos-geojson")
async def get_casos_geojson(year: int = None, db: Session = Depends(get_db)):
    query = """
        SELECT id_caso, evento, semana_epidemiologica, anio_epidemiologico,
               departamento, localidad, latitud, longitud, radio_censal_id,
               cluster_stdbscan,
               ST_X(geom) AS lon, ST_Y(geom) AS lat
        FROM temp_exp_ets
    """
    params = {}
    if year:
        query += " WHERE anio_epidemiologico = :year"
        params["year"] = year

    result = db.execute(text(query), params).fetchall()
    features = []
    for row in result:
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