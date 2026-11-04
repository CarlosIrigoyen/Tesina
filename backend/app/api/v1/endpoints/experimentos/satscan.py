"""Endpoints de SaTScan Poisson."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session
import pandas as pd

from database import get_db
from app.service import clustering_service

router = APIRouter()


@router.get("/flujo-satscan")
async def flujo_satscan(
    max_spatial_pct: float = Query(0.1),
    max_temporal_weeks: int = Query(2),
    n_simulaciones: int = Query(19),
    db: Session = Depends(get_db),
):
    rows = db.execute(text("""
        SELECT id_caso, latitud, longitud,
               anio_epidemiologico, semana_epidemiologica, radio_censal_id
        FROM temp_exp_ets
        WHERE radio_censal_id IS NOT NULL
    """)).fetchall()
    if not rows:
        raise HTTPException(404, detail="No hay datos cargados.")
    df = pd.DataFrame([dict(r._mapping) for r in rows])
    return clustering_service.ejecutar_satscan_poisson(
        df, max_spatial_pct, max_temporal_weeks, n_simulaciones
    )