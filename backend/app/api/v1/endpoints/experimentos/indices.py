"""Endpoints de índices sociodemográficos."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
import pandas as pd

from database import get_db
from ._common import asegurar_indices

router = APIRouter()

COLS_INDICES = [
    "actividad", "carencias_sanitarias", "demografia", "educacion",
    "fuente_agua", "infraestructuta", "salud", "indice_compuesto",
]


@router.get("/resumen-con-indices")
async def resumen_con_indices(db: Session = Depends(get_db)):
    asegurar_indices(db)
    query = text("""
        WITH agregados AS (
            SELECT radio_censal_id, COUNT(*) AS casos,
                   MIN(localidad) AS localidad, MIN(departamento) AS departamento
            FROM temp_exp_ets
            WHERE radio_censal_id IS NOT NULL
            GROUP BY radio_censal_id
        ),
        total AS (SELECT COUNT(*)::numeric AS n FROM temp_exp_ets)
        SELECT a.radio_censal_id AS link, a.localidad, a.departamento, a.casos,
               ROUND((a.casos * 100.0 / t.n)::numeric, 2) AS pct_del_total,
               i.actividad, i.carencias_sanitarias, i.demografia, i.educacion,
               i.fuente_agua, i.infraestructuta, i.salud, i.indice_compuesto
        FROM agregados a
        CROSS JOIN total t
        LEFT JOIN indices_radios i ON a.radio_censal_id = i.link
        ORDER BY a.casos DESC;
    """)
    return [dict(r._mapping) for r in db.execute(query).fetchall()]


@router.get("/correlacion-indices")
async def correlacion_indices(db: Session = Depends(get_db)):
    asegurar_indices(db)
    rows = db.execute(text("""
        WITH agregados AS (
            SELECT radio_censal_id, COUNT(*) AS casos
            FROM temp_exp_ets
            WHERE radio_censal_id IS NOT NULL
            GROUP BY radio_censal_id
        )
        SELECT a.radio_censal_id AS link, a.casos,
               i.actividad, i.carencias_sanitarias, i.demografia, i.educacion,
               i.fuente_agua, i.infraestructuta, i.salud, i.indice_compuesto
        FROM agregados a
        JOIN indices_radios i ON a.radio_censal_id = i.link;
    """)).fetchall()
    if len(rows) < 3:
        return {"mensaje": "Se necesitan al menos 3 radios con casos."}

    df = pd.DataFrame([dict(r._mapping) for r in rows])
    correlaciones = {}
    for col in COLS_INDICES:
        if col in df.columns:
            sub = df[["casos", col]].dropna()
            if len(sub) >= 3:
                correlaciones[col] = round(float(sub["casos"].corr(sub[col])), 4)
    correlaciones = dict(sorted(correlaciones.items(), key=lambda x: abs(x[1]), reverse=True))
    return {
        "n_radios_analizados": len(df),
        "correlaciones_pearson_casos_vs_indice": correlaciones,
    }