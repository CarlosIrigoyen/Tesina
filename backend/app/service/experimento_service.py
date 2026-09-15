import pandas as pd
from sqlalchemy import text, Table, Column, MetaData, String, Integer, Float
from sqlalchemy.orm import Session
from geoalchemy2 import Geometry, WKTElement
import logging

logger = logging.getLogger(__name__)


def preparar_tabla_experimento_ets(db: Session, csv_path: str, years_back: int = 5):
    try:
        df = pd.read_csv(csv_path)
        logger.info(f"CSV cargado: {len(df)} registros")
        if len(df) == 0:
            raise ValueError("El CSV está vacío")
    except Exception as e:
        logger.error(f"Error leyendo CSV: {e}")
        raise

    max_year = df['anio_epidemiologico'].max()
    min_year = max_year - years_back + 1
    df = df[df['anio_epidemiologico'] >= min_year]
    logger.info(f"Filtrados últimos {years_back} años: {len(df)} registros")

    db.execute(text("""
        DROP TABLE IF EXISTS temp_exp_ets;
        CREATE UNLOGGED TABLE temp_exp_ets (
            id_caso VARCHAR(50),
            evento VARCHAR(100),
            semana_epidemiologica INT,
            anio_epidemiologico INT,
            departamento VARCHAR(100),
            localidad VARCHAR(100),
            latitud FLOAT,
            longitud FLOAT,
            radio_censal_id VARCHAR(20),
            cluster_stdbscan INT,
            geom geometry(Point, 4326)
        );
    """))
    db.commit()

    metadata = MetaData()
    temp_table = Table(
        'temp_exp_ets', metadata,
        Column('id_caso', String),
        Column('evento', String),
        Column('semana_epidemiologica', Integer),
        Column('anio_epidemiologico', Integer),
        Column('departamento', String),
        Column('localidad', String),
        Column('latitud', Float),
        Column('longitud', Float),
        Column('radio_censal_id', String),
        Column('cluster_stdbscan', Integer),
        Column('geom', Geometry('POINT', srid=4326))
    )

    registros = []
    for _, row in df.iterrows():
        geom_wkt = f"POINT({row['longitud']} {row['latitud']})"
        registros.append({
            'id_caso': str(row['id_caso']),
            'evento': row['evento'],
            'semana_epidemiologica': int(row['semana_epidemiologica']),
            'anio_epidemiologico': int(row['anio_epidemiologico']),
            'departamento': row['departamento'],
            'localidad': row['localidad'],
            'latitud': float(row['latitud']),
            'longitud': float(row['longitud']),
            'radio_censal_id': None,
            'cluster_stdbscan': None,
            'geom': WKTElement(geom_wkt, srid=4326)
        })

    db.execute(temp_table.insert(), registros)
    db.commit()
    logger.info(f"{len(registros)} registros insertados")

    db.execute(text("""
        UPDATE temp_exp_ets t
        SET radio_censal_id = r.link
        FROM radios_censales r
        WHERE ST_Contains(r.geom, t.geom);
    """))
    db.commit()

    db.execute(text("""
        CREATE INDEX idx_temp_exp_ets_semana ON temp_exp_ets (semana_epidemiologica);
        CREATE INDEX idx_temp_exp_ets_anio ON temp_exp_ets (anio_epidemiologico);
        CREATE INDEX idx_temp_exp_ets_radio ON temp_exp_ets (radio_censal_id);
        CREATE INDEX idx_temp_exp_ets_geom_gist ON temp_exp_ets USING GIST (geom);
    """))
    db.commit()
    logger.info("Índices creados")
    return {"status": "success", "registros": len(registros)}


def obtener_datos_completos_ets(db: Session) -> pd.DataFrame:
    query = text("""
        SELECT id_caso, evento, semana_epidemiologica, anio_epidemiologico,
               departamento, localidad, latitud, longitud, radio_censal_id,
               cluster_stdbscan,
               ST_X(geom) AS lon, ST_Y(geom) AS lat
        FROM temp_exp_ets;
    """)
    result = db.execute(query).fetchall()
    df = pd.DataFrame(result, columns=[
        'id_caso', 'evento', 'semana_epidemiologica', 'anio_epidemiologico',
        'departamento', 'localidad', 'latitud', 'longitud', 'radio_censal_id',
        'cluster_stdbscan', 'lon', 'lat'
    ])
    logger.info(f"Se obtuvieron {len(df)} registros")
    return df
