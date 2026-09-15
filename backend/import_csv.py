import os
from dotenv import load_dotenv
import geopandas as gpd
import pandas as pd
from shapely import wkt
from shapely.geometry import MultiPolygon, Polygon
from sqlalchemy import create_engine

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

CSV_PATH = "areas_censales.csv"

print("Cargando archivo CSV de radios censales de Chubut...")
df = pd.read_csv(CSV_PATH)

# Tomamos las columnas por posición exacta: B1 (índice 1) y C1 (índice 2)
col_link = df.columns[1]  # B1: LINK
col_geom = df.columns[2]  # C1: geometry

print(f"Columna LINK: '{col_link}' | Columna Geometry: '{col_geom}'")

# Filtrar registros sin geometría
df = df.dropna(subset=[col_geom])

# Limpiar formato de link (quitar decimales)
df[col_link] = df[col_link].astype(str).str.split(".").str[0]

print("Parseando geometrías WKT a objetos espaciales...")
geometrias = df[col_geom].astype(str).apply(wkt.loads)


def a_multipolygon(geom):
    if isinstance(geom, Polygon):
        return MultiPolygon([geom])
    return geom


geometrias = geometrias.apply(a_multipolygon)

gdf = gpd.GeoDataFrame(
    df[[col_link]].rename(columns={col_link: "link"}),
    geometry=geometrias,
    crs="EPSG:4326",
)

gdf = gdf.rename(columns={"geometry": "geom"}).set_geometry("geom")

print(f"Insertando {len(gdf)} radios censales en PostgreSQL/PostGIS...")

gdf.to_postgis(
    name="radios_censales",
    con=engine,
    if_exists="replace",
    index=False,
    schema="public",
)

print("¡Importación exitosa! Radios censales de Chubut cargados en PostGIS.")
