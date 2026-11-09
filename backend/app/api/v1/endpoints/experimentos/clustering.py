"""Endpoints de clustering (OPTICS→ST-DBSCAN, ST-kNN), configuraciones y comparativa."""
from typing import Optional
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from app.service import  clustering_service, experimento_service
from ._common import filtrar_por_localidad

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/flujo-clustering")
async def flujo_clustering(
    min_samples: int = Query(5),
    max_eps_optics: float = Query(20.0),
    eps_temporal_semanas: int = Query(2),
    localidad: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    df = experimento_service.obtener_datos_completos_ets(db)
    df = filtrar_por_localidad(df, localidad).reset_index(drop=True)
    if df.empty:
        raise HTTPException(404, detail="No hay datos cargados.")

    exploracion = clustering_service.explorar_optics_para_parametros(df, min_samples, max_eps_optics)
    res_stdbscan = clustering_service.ejecutar_st_dbscan(
        df,
        eps_espacial_km=exploracion["eps_espacial_sugerido_km"],
        eps_temporal_semanas=eps_temporal_semanas,
        min_samples=exploracion["min_samples_sugerido"],
    )

    db.execute(text("ALTER TABLE temp_exp_ets ADD COLUMN IF NOT EXISTS cluster_stdbscan INT;"))
    db.commit()

    offset = 0
    if localidad:
        row_max = db.execute(text("""
            SELECT COALESCE(MAX(cluster_stdbscan) + 1, 0) FROM temp_exp_ets
            WHERE cluster_stdbscan IS NOT NULL AND cluster_stdbscan <> -1
        """)).fetchone()
        offset = int(row_max[0] or 0)

    for idx, row in df.iterrows():
        label = res_stdbscan["labels"][idx]
        db_label = -1 if label == -1 else label + offset
        db.execute(
            text("UPDATE temp_exp_ets SET cluster_stdbscan = :cs WHERE id_caso = :id"),
            {"cs": db_label, "id": row["id_caso"]},
        )
    db.commit()

    _guardar_metadata(db, res_stdbscan)

    configuracion = None
    try:
        configuracion = clustering_persistencia_service.guardar_configuracion(
            df=df,
            labels=res_stdbscan["labels"],
            algoritmo="ST-DBSCAN",
            params=res_stdbscan["params"],
            localidad=localidad,
            exploracion=exploracion,
            indices=clustering_persistencia_service.obtener_indices_radios(db),
            tiempo_ms=res_stdbscan["tiempo_ms"],
        )
    except Exception as e:
        logger.warning(f"No se pudo guardar la configuración ST-DBSCAN: {e}")

    return {
        "exploracion_optics": exploracion,
        "clustering_final": res_stdbscan,
        "configuracion": configuracion,
    }


def _guardar_metadata(db: Session, res):
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS clustering_metadata (
                id SERIAL PRIMARY KEY,
                ejecutado_en TIMESTAMP DEFAULT NOW(),
                eps_espacial_km FLOAT, eps_temporal_semanas INT, min_samples INT,
                n_clusters INT, n_ruido INT, pct_ruido FLOAT, tiempo_ms FLOAT
            );
        """))
        db.execute(text("""
            INSERT INTO clustering_metadata
                (eps_espacial_km, eps_temporal_semanas, min_samples,
                 n_clusters, n_ruido, pct_ruido, tiempo_ms)
            VALUES (:e, :t, :m, :nc, :nr, :pr, :tm)
        """), {
            "e": res["params"]["eps_espacial_km"],
            "t": res["params"]["eps_temporal_semanas"],
            "m": res["params"]["min_samples"],
            "nc": res["n_clusters"], "nr": res["n_ruido"],
            "pr": res["pct_ruido"], "tm": res["tiempo_ms"],
        })
        db.commit()
    except Exception:
        db.rollback()


@router.get("/flujo-clustering-stknn")
async def flujo_clustering_stknn(
    k: int = Query(6),
    radio_espacial_km: float = Query(10.0),
    radio_temporal_semanas: int = Query(3),
    umbral_similaridad: float = Query(0.7),
    localidad: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    df = experimento_service.obtener_datos_completos_ets(db)
    df = filtrar_por_localidad(df, localidad).reset_index(drop=True)
    if df.empty:
        raise HTTPException(404, detail="No hay datos cargados.")

    res_stknn = clustering_service.ejecutar_st_knn(
        df, k=k, radio_espacial_km=radio_espacial_km,
        radio_temporal_semanas=radio_temporal_semanas,
        umbral_similaridad=umbral_similaridad,
    )
    metricas = clustering_service.calcular_metricas_clustering(df, res_stknn["labels"])
    res_stknn["metricas"] = metricas

    configuracion = None
    try:
        configuracion = clustering_persistencia_service.guardar_configuracion(
            df=df, labels=res_stknn["labels"],
            algoritmo="ST-kNN", params=res_stknn["params"],
            localidad=localidad, metricas=metricas,
            indices=clustering_persistencia_service.obtener_indices_radios(db),
            tiempo_ms=res_stknn["tiempo_ms"],
        )
    except Exception as e:
        logger.warning(f"No se pudo guardar la configuración ST-kNN: {e}")

    res_stknn["configuracion"] = configuracion
    return res_stknn


@router.get("/clustering-configuraciones")
async def listar_configuraciones_clustering():
    return clustering_persistencia_service.listar_configuraciones()


@router.get("/clustering-configuraciones/{run_id}")
async def obtener_configuracion_clustering(run_id: str):
    try:
        return clustering_persistencia_service.cargar_configuracion(run_id)
    except FileNotFoundError:
        raise HTTPException(404, detail=f"No se encontró la configuración '{run_id}'.")


@router.delete("/clustering-configuraciones/{run_id}")
async def eliminar_configuracion_clustering(run_id: str):
    try:
        clustering_persistencia_service.eliminar_configuracion(run_id)
    except FileNotFoundError:
        raise HTTPException(404, detail=f"No se encontró la configuración '{run_id}'.")
    return {"status": "ok", "id": run_id}


@router.get("/comparativa-clustering")
async def comparativa_clustering(
    min_samples: int = Query(5),
    max_eps_optics: float = Query(20.0),
    eps_temporal_semanas: int = Query(2),
    localidad: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    df = experimento_service.obtener_datos_completos_ets(db)
    df = filtrar_por_localidad(df, localidad).reset_index(drop=True)
    if df.empty:
        raise HTTPException(404, detail="No hay datos cargados.")
    return clustering_service.comparar_algoritmos(
        df, min_samples=min_samples,
        max_eps_optics=max_eps_optics,
        eps_temporal_semanas=eps_temporal_semanas,
    )


@router.get("/clustering-parametros")
async def clustering_parametros(db: Session = Depends(get_db)):
    try:
        row = db.execute(text("""
            SELECT eps_espacial_km, eps_temporal_semanas, min_samples,
                   n_clusters, n_ruido, pct_ruido, tiempo_ms, ejecutado_en
            FROM clustering_metadata
            ORDER BY ejecutado_en DESC LIMIT 1;
        """)).fetchone()
        return dict(row._mapping) if row else {}
    except Exception:
        return {}