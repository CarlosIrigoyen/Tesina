import json
from database import get_db
from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from models import RadioCensal
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.api.v1.endpoints import experimentos  # nuevo import

app = FastAPI(title="API Radios Censales y Análisis ETS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir router de experimentos
app.include_router(experimentos.router, prefix="/api/v1/experimentos")

# Endpoints existentes de radios censales
@app.get("/api/radios-censales/geojson")
def get_radios_censales_geojson(
    link: str = Query(None, description="Filtrar por código de radio o prefijo de localidad"),
    db: Session = Depends(get_db),
):
    query = select(
        RadioCensal.link, func.ST_AsGeoJSON(RadioCensal.geom).label("geojson")
    )
    if link:
        query = query.where(RadioCensal.link.like(f"{link}%"))
    results = db.execute(query).all()

    features = []
    for row in results:
        if row.geojson:
            features.append({
                "type": "Feature",
                "geometry": json.loads(row.geojson),
                "properties": {"link": row.link},
            })
    return {"type": "FeatureCollection", "features": features}

@app.get("/api/radios-censales/bounds")
def get_radios_bounds(link: str = Query(None), db: Session = Depends(get_db)):
    query = select(
        func.ST_YMin(func.ST_Extent(RadioCensal.geom)).label("ymin"),
        func.ST_XMin(func.ST_Extent(RadioCensal.geom)).label("xmin"),
        func.ST_YMax(func.ST_Extent(RadioCensal.geom)).label("ymax"),
        func.ST_XMax(func.ST_Extent(RadioCensal.geom)).label("xmax"),
        func.ST_Y(func.ST_Centroid(func.ST_Union(RadioCensal.geom))).label("cy"),
        func.ST_X(func.ST_Centroid(func.ST_Union(RadioCensal.geom))).label("cx"),
    )
    if link:
        query = query.where(RadioCensal.link.like(f"{link}%"))
    row = db.execute(query).first()

    if not row or row.ymin is None:
        return {"error": "Sin datos"}

    return {
        "center": [row.cy, row.cx],
        "bounds": [
            [row.ymin, row.xmin],
            [row.ymax, row.xmax],
        ],
    }
