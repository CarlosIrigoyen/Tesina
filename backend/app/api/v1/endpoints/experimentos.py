from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Optional
import io
import pandas as pd

from database import get_db
from app.service import experimento_service, clustering_service, pdf_report_service

router = APIRouter()


# ============================================================
# UTILIDAD: verificar/crear índices necesarios para JOINs rápidos
# ============================================================
def _asegurar_indices(db: Session):
    """Verifica y crea los índices necesarios. Idempotente."""
    try:
        db.execute(text("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_indices_radios_link
            ON indices_radios(link);
        """))
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_temp_exp_ets_radio
            ON temp_exp_ets(radio_censal_id);
        """))
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_temp_exp_ets_anio_radio
            ON temp_exp_ets(anio_epidemiologico, radio_censal_id);
        """))
        db.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_temp_exp_ets_localidad
            ON temp_exp_ets(localidad);
        """))
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logging.getLogger(__name__).warning(f"No se pudieron asegurar índices: {e}")


# ============================================================
# CARGA DE CASOS
# ============================================================
@router.post("/cargar-casos")
async def cargar_casos_ets(
    csv_path: str = Query("casos_grupo_ets_completo.csv"),
    years_back: int = 5,
    db: Session = Depends(get_db)
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
        params['year'] = year
    result = db.execute(text(query), params).fetchall()
    features = []
    for row in result:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [row.lon, row.lat]},
            "properties": {
                "id_caso": row.id_caso, "evento": row.evento,
                "semana": row.semana_epidemiologica, "anio": row.anio_epidemiologico,
                "departamento": row.departamento, "localidad": row.localidad,
                "radio_censal_id": row.radio_censal_id,
                "cluster_stdbscan": row.cluster_stdbscan
            }
        })
    return {"type": "FeatureCollection", "features": features}


# ============================================================
# CLUSTERS COMO POLÍGONOS (convex hull)
# ============================================================
@router.get("/clusters-poligonos")
async def clusters_poligonos(db: Session = Depends(get_db)):
    """
    Devuelve cada cluster ST-DBSCAN como un polígono (convex hull de sus puntos).
    """
    from shapely.geometry import MultiPoint, mapping

    query = text("""
        SELECT cluster_stdbscan,
               ARRAY_AGG(latitud) AS lats,
               ARRAY_AGG(longitud) AS lons
        FROM temp_exp_ets
        WHERE cluster_stdbscan IS NOT NULL AND cluster_stdbscan <> -1
        GROUP BY cluster_stdbscan
    """)
    rows = db.execute(query).fetchall()

    features = []
    for row in rows:
        lats = row.lats or []
        lons = row.lons or []
        if len(lats) < 3:
            continue
        puntos = list(zip(lons, lats))
        mp = MultiPoint(puntos)
        hull = mp.convex_hull
        features.append({
            "type": "Feature",
            "geometry": mapping(hull),
            "properties": {
                "cluster": int(row.cluster_stdbscan),
                "n_puntos": len(puntos)
            }
        })
    return {"type": "FeatureCollection", "features": features}


# ============================================================
# FLUJO 1: OPTICS → ST-DBSCAN (global)
# ============================================================
@router.get("/flujo-clustering")
async def flujo_clustering(
    min_samples: int = Query(5),
    max_eps_optics: float = Query(20.0),
    eps_temporal_semanas: int = Query(2),
    db: Session = Depends(get_db)
):
    df = experimento_service.obtener_datos_completos_ets(db)
    if df.empty:
        raise HTTPException(status_code=404, detail="No hay datos cargados.")

    exploracion = clustering_service.explorar_optics_para_parametros(df, min_samples, max_eps_optics)
    res_stdbscan = clustering_service.ejecutar_st_dbscan(
        df,
        eps_espacial_km=exploracion["eps_espacial_sugerido_km"],
        eps_temporal_semanas=eps_temporal_semanas,
        min_samples=exploracion["min_samples_sugerido"]
    )

    db.execute(text("ALTER TABLE temp_exp_ets ADD COLUMN IF NOT EXISTS cluster_stdbscan INT;"))
    db.commit()
    for idx, row in df.iterrows():
        db.execute(text("""
            UPDATE temp_exp_ets SET cluster_stdbscan = :cs WHERE id_caso = :id
        """), {"cs": res_stdbscan['labels'][idx], "id": row['id_caso']})
    db.commit()

    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS clustering_metadata (
                id SERIAL PRIMARY KEY,
                ejecutado_en TIMESTAMP DEFAULT NOW(),
                eps_espacial_km FLOAT,
                eps_temporal_semanas INT,
                min_samples INT,
                n_clusters INT,
                n_ruido INT,
                pct_ruido FLOAT,
                tiempo_ms FLOAT
            );
        """))
        db.execute(text("""
            INSERT INTO clustering_metadata
                (eps_espacial_km, eps_temporal_semanas, min_samples,
                 n_clusters, n_ruido, pct_ruido, tiempo_ms)
            VALUES (:e, :t, :m, :nc, :nr, :pr, :tm)
        """), {
            "e": res_stdbscan["params"]["eps_espacial_km"],
            "t": res_stdbscan["params"]["eps_temporal_semanas"],
            "m": res_stdbscan["params"]["min_samples"],
            "nc": res_stdbscan["n_clusters"],
            "nr": res_stdbscan["n_ruido"],
            "pr": res_stdbscan["pct_ruido"],
            "tm": res_stdbscan["tiempo_ms"],
        })
        db.commit()
    except Exception:
        db.rollback()

    return {"exploracion_optics": exploracion, "clustering_final": res_stdbscan}


@router.get("/clustering-parametros")
async def clustering_parametros(db: Session = Depends(get_db)):
    try:
        row = db.execute(text("""
            SELECT eps_espacial_km, eps_temporal_semanas, min_samples,
                   n_clusters, n_ruido, pct_ruido, tiempo_ms, ejecutado_en
            FROM clustering_metadata
            ORDER BY ejecutado_en DESC
            LIMIT 1;
        """)).fetchone()
        return dict(row._mapping) if row else {}
    except Exception:
        return {}


# ============================================================
# FLUJO 2: SaTScan Poisson (global)
# ============================================================
@router.get("/flujo-satscan")
async def flujo_satscan(
    max_spatial_pct: float = Query(0.1),
    max_temporal_weeks: int = Query(2),
    n_simulaciones: int = Query(19),
    db: Session = Depends(get_db)
):
    query = """
        SELECT id_caso, latitud, longitud,
               anio_epidemiologico, semana_epidemiologica,
               radio_censal_id
        FROM temp_exp_ets
        WHERE radio_censal_id IS NOT NULL
    """
    rows = db.execute(text(query)).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail="No hay datos cargados.")
    df = pd.DataFrame([dict(r._mapping) for r in rows])
    return clustering_service.ejecutar_satscan_poisson(df, max_spatial_pct, max_temporal_weeks, n_simulaciones)


# ============================================================
# ÍNDICES SOCIODEMOGRÁFICOS
# ============================================================
@router.get("/resumen-con-indices")
async def resumen_con_indices(db: Session = Depends(get_db)):
    _asegurar_indices(db)
    query = text("""
        WITH agregados AS (
            SELECT radio_censal_id,
                   COUNT(*) AS casos,
                   MIN(localidad) AS localidad,
                   MIN(departamento) AS departamento
            FROM temp_exp_ets
            WHERE radio_censal_id IS NOT NULL
            GROUP BY radio_censal_id
        ),
        total AS (
            SELECT COUNT(*)::numeric AS n FROM temp_exp_ets
        )
        SELECT a.radio_censal_id AS link,
               a.localidad,
               a.departamento,
               a.casos,
               ROUND((a.casos * 100.0 / t.n)::numeric, 2) AS pct_del_total,
               i.actividad, i.carencias_sanitarias, i.demografia,
               i.educacion, i.fuente_agua, i.infraestructuta, i.salud, i.indice_compuesto
        FROM agregados a
        CROSS JOIN total t
        LEFT JOIN indices_radios i ON a.radio_censal_id = i.link
        ORDER BY a.casos DESC;
    """)
    return [dict(r._mapping) for r in db.execute(query).fetchall()]


@router.get("/correlacion-indices")
async def correlacion_indices(db: Session = Depends(get_db)):
    _asegurar_indices(db)
    query = text("""
        WITH agregados AS (
            SELECT radio_censal_id, COUNT(*) AS casos
            FROM temp_exp_ets
            WHERE radio_censal_id IS NOT NULL
            GROUP BY radio_censal_id
        )
        SELECT a.radio_censal_id AS link,
               a.casos,
               i.actividad, i.carencias_sanitarias, i.demografia,
               i.educacion, i.fuente_agua, i.infraestructuta, i.salud, i.indice_compuesto
        FROM agregados a
        JOIN indices_radios i ON a.radio_censal_id = i.link;
    """)
    rows = db.execute(query).fetchall()
    if len(rows) < 3:
        return {"mensaje": "Se necesitan al menos 3 radios con casos."}
    df = pd.DataFrame([dict(r._mapping) for r in rows])
    indices = ['actividad', 'carencias_sanitarias', 'demografia', 'educacion',
               'fuente_agua', 'infraestructuta', 'salud', 'indice_compuesto']
    correlaciones = {}
    for col in indices:
        if col in df.columns:
            sub = df[['casos', col]].dropna()
            if len(sub) >= 3:
                correlaciones[col] = round(float(sub['casos'].corr(sub[col])), 4)
    correlaciones = dict(sorted(correlaciones.items(), key=lambda x: abs(x[1]), reverse=True))
    return {"n_radios_analizados": len(df), "correlaciones_pearson_casos_vs_indice": correlaciones}


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
# ANÁLISIS POR CIUDAD / LOCALIDAD
# ============================================================
@router.get("/localidades")
async def listar_localidades(db: Session = Depends(get_db)):
    query = text("""
        SELECT localidad, departamento, COUNT(*) AS casos
        FROM temp_exp_ets
        WHERE localidad IS NOT NULL AND localidad <> ''
        GROUP BY localidad, departamento
        ORDER BY casos DESC;
    """)
    return [dict(r._mapping) for r in db.execute(query).fetchall()]


@router.get("/ciudad/desagregado")
async def desagregado_ciudad(
    localidad: str = Query(...),
    db: Session = Depends(get_db)
):
    query = text("""
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
    """)
    rows = db.execute(query, {"loc": f"%{localidad}%"}).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No hay casos para '{localidad}'")
    return [dict(r._mapping) for r in rows]


@router.get("/ciudad/casos-geojson")
async def casos_ciudad_geojson(
    localidad: str = Query(...),
    db: Session = Depends(get_db)
):
    query = """
        SELECT id_caso, evento, semana_epidemiologica, anio_epidemiologico,
               departamento, localidad, latitud, longitud, radio_censal_id,
               cluster_stdbscan,
               ST_X(geom) AS lon, ST_Y(geom) AS lat
        FROM temp_exp_ets
        WHERE localidad ILIKE :loc
    """
    result = db.execute(text(query), {"loc": f"%{localidad}%"}).fetchall()
    features = []
    for row in result:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [row.lon, row.lat]},
            "properties": {
                "id_caso": row.id_caso, "evento": row.evento,
                "semana": row.semana_epidemiologica, "anio": row.anio_epidemiologico,
                "departamento": row.departamento, "localidad": row.localidad,
                "radio_censal_id": row.radio_censal_id,
                "cluster_stdbscan": row.cluster_stdbscan
            }
        })
    return {"type": "FeatureCollection", "features": features}


@router.get("/ciudad/radios-geojson")
async def radios_ciudad_geojson(
    localidad: str = Query(...),
    db: Session = Depends(get_db)
):
    query = """
        SELECT DISTINCT r.link, ST_AsGeoJSON(r.geom) AS geojson
        FROM radios_censales r
        WHERE r.link IN (
            SELECT DISTINCT radio_censal_id
            FROM temp_exp_ets
            WHERE localidad ILIKE :loc AND radio_censal_id IS NOT NULL
        )
    """
    result = db.execute(text(query), {"loc": f"%{localidad}%"}).fetchall()
    import json as _json
    features = []
    for row in result:
        if row.geojson:
            features.append({
                "type": "Feature",
                "geometry": _json.loads(row.geojson),
                "properties": {"link": row.link}
            })
    return {"type": "FeatureCollection", "features": features}


@router.get("/ciudad/satscan")
async def satscan_ciudad(
    localidad: str = Query(...),
    max_spatial_pct: float = Query(0.3),
    max_temporal_weeks: int = Query(4),
    n_simulaciones: int = Query(19),
    anio_desde: int = None,
    db: Session = Depends(get_db)
):
    query = """
        SELECT id_caso, latitud, longitud,
               anio_epidemiologico, semana_epidemiologica,
               radio_censal_id
        FROM temp_exp_ets
        WHERE radio_censal_id IS NOT NULL
          AND localidad ILIKE :loc
    """
    params = {"loc": f"%{localidad}%"}
    if anio_desde:
        query += " AND anio_epidemiologico >= :anio"
        params["anio"] = anio_desde

    rows = db.execute(text(query), params).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No hay casos para '{localidad}'")
    df = pd.DataFrame([dict(r._mapping) for r in rows])
    return clustering_service.ejecutar_satscan_poisson(df, max_spatial_pct, max_temporal_weeks, n_simulaciones)


@router.get("/ciudad/satscan-iterativo")
async def satscan_iterativo_ciudad(
    localidad: str = Query(...),
    max_spatial_pct: float = Query(0.3),
    max_temporal_weeks: int = Query(4),
    n_simulaciones: int = Query(19),
    max_iteraciones: int = Query(5),
    db: Session = Depends(get_db)
):
    """
    SaTScan iterativo: ejecuta N veces, sacando el cluster detectado en cada iteración.
    Devuelve múltiples cilindros.
    """
    from math import radians, cos, sin, asin, sqrt

    query = """
        SELECT id_caso, latitud, longitud,
               anio_epidemiologico, semana_epidemiologica,
               radio_censal_id
        FROM temp_exp_ets
        WHERE radio_censal_id IS NOT NULL
          AND localidad ILIKE :loc
    """
    rows = db.execute(text(query), {"loc": f"%{localidad}%"}).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No hay casos para '{localidad}'")

    df_full = pd.DataFrame([dict(r._mapping) for r in rows])
    clusters_encontrados = []
    df_restante = df_full.copy()

    def haversine(lat1, lon1, lat2, lon2):
        R = 6371.0
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
        return R * 2 * asin(sqrt(a))

    for i in range(max_iteraciones):
        if len(df_restante) < 5:
            break
        res = clustering_service.ejecutar_satscan_poisson(
            df_restante, max_spatial_pct, max_temporal_weeks, n_simulaciones
        )
        if not res.get("clusters") or len(res["clusters"]) == 0:
            break
        c = res["clusters"][0]
        c["iteracion"] = i + 1
        clusters_encontrados.append(c)

        centro_lat = c["lat"]
        centro_lon = c["lon"]
        radio_km = c["radio_km"]
        sem_ini = c["semana_inicio"]
        sem_fin = c["semana_fin"]

        df_restante = df_restante.copy()
        df_restante["sem_abs"] = (
            (df_restante["anio_epidemiologico"] - 2000) * 52
            + df_restante["semana_epidemiologica"]
        )
        df_restante["dist_al_centro"] = df_restante.apply(
            lambda r: haversine(centro_lat, centro_lon, r["latitud"], r["longitud"]),
            axis=1
        )
        mask_fuera = ~(
            (df_restante["dist_al_centro"] <= radio_km)
            & (df_restante["sem_abs"] >= sem_ini)
            & (df_restante["sem_abs"] <= sem_fin)
        )
        df_restante = df_restante[mask_fuera]

    return {
        "n_clusters": len(clusters_encontrados),
        "clusters": clusters_encontrados,
        "casos_sin_cluster": len(df_restante)
    }


@router.get("/ciudad/clustering")
async def clustering_ciudad(
    localidad: str = Query(...),
    min_samples: int = Query(4),
    max_eps_optics: float = Query(10.0),
    eps_temporal_semanas: int = Query(2),
    db: Session = Depends(get_db)
):
    query = """
        SELECT id_caso, evento, latitud, longitud,
               anio_epidemiologico, semana_epidemiologica,
               departamento, localidad, radio_censal_id
        FROM temp_exp_ets
        WHERE localidad ILIKE :loc
          AND radio_censal_id IS NOT NULL
    """
    rows = db.execute(text(query), {"loc": f"%{localidad}%"}).fetchall()
    if not rows:
        raise HTTPException(status_code=404, detail=f"No hay casos para '{localidad}'")
    df = pd.DataFrame([dict(r._mapping) for r in rows])

    exploracion = clustering_service.explorar_optics_para_parametros(df, min_samples, max_eps_optics)
    res_stdbscan = clustering_service.ejecutar_st_dbscan(
        df,
        eps_espacial_km=exploracion["eps_espacial_sugerido_km"],
        eps_temporal_semanas=eps_temporal_semanas,
        min_samples=exploracion["min_samples_sugerido"]
    )

    labels_por_id = {str(k): int(v) for k, v in zip(df['id_caso'], res_stdbscan['labels'])}

    return {
        "exploracion_optics": exploracion,
        "clustering_final": res_stdbscan,
        "labels_por_id": labels_por_id
    }


# ============================================================
# EXPORTAR PDF
# ============================================================
class PDFRequest(BaseModel):
    exploracion_optics: dict
    clustering_stdbscan: dict
    satscan_resultado: dict
    datos_evolucion_temporal: list
    datos_indices: Optional[list] = None
    correlaciones: Optional[dict] = None
    total_casos: int = 0


@router.post("/exportar-pdf")
async def exportar_pdf(payload: PDFRequest):
    try:
        evolucion_df = pd.DataFrame(payload.datos_evolucion_temporal)
        pdf_bytes = pdf_report_service.generar_pdf_experimento(
            exploracion_optics=payload.exploracion_optics,
            clustering_stdbscan=payload.clustering_stdbscan,
            satscan_resultado=payload.satscan_resultado,
            datos_evolucion_temporal=evolucion_df,
            datos_indices=payload.datos_indices,
            correlaciones=payload.correlaciones,
            total_casos=payload.total_casos
        )
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=reporte_experimento.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando PDF: {str(e)}")

@router.get("/cluster-radios/{cluster_id}")
async def cluster_radios(cluster_id: int, db: Session = Depends(get_db)):
    query = text("""
        SELECT radio_censal_id,
               MIN(localidad) AS localidad,
               COUNT(*) AS casos
        FROM temp_exp_ets
        WHERE cluster_stdbscan = :cid
          AND radio_censal_id IS NOT NULL
        GROUP BY radio_censal_id
        ORDER BY casos DESC;
    """)
    return [dict(r._mapping) for r in db.execute(query, {"cid": cluster_id}).fetchall()]
