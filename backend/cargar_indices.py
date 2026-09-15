import os
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))

CSV_PATH = "indice_completo.csv"

print("Cargando índices sociodemográficos...")
df = pd.read_csv(CSV_PATH)
print(f"Filas leídas: {len(df)}")
print(f"Columnas: {list(df.columns)}")

# Normalizar nombre de columna link
for nombre in ['LINK', 'Link', 'link']:
    if nombre in df.columns and nombre != 'link':
        df = df.rename(columns={nombre: 'link'})
        break

if 'link' not in df.columns:
    raise ValueError(f"No se encontró columna LINK/link. Columnas: {list(df.columns)}")

# Eliminar geometría si viene (no la necesitamos acá)
if 'geometry' in df.columns:
    df = df.drop(columns=['geometry'])
if 'geom' in df.columns:
    df = df.drop(columns=['geom'])

# Asegurar tipos numéricos
cols_indices = ['actividad', 'carencias_sanitarias', 'demografia',
                'educacion', 'fuente_agua', 'infraestructuta',
                'salud', 'indice_compuesto']
for c in cols_indices:
    if c in df.columns:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    else:
        print(f"ADVERTENCIA: columna '{c}' no está en el CSV")

# Limpiar link
df['link'] = df['link'].astype(str).str.split('.').str[0]

print(f"Insertando {len(df)} registros en tabla 'indices_radios'...")
df.to_sql('indices_radios', engine, if_exists='replace', index=False)

# Crear índice y analizar (con text() para SQLAlchemy 2.0)
with engine.begin() as conn:
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_indices_radios_link ON indices_radios(link);"))
    conn.execute(text("ANALYZE indices_radios;"))

# Verificar
with engine.connect() as conn:
    n = conn.execute(text("SELECT COUNT(*) FROM indices_radios")).scalar()
    print(f"✓ Tabla indices_radios creada con {n} filas")

print("¡Listo!")
