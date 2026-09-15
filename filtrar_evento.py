import os
import pandas as pd

NOMBRE_ARCHIVO = "casos_geo.csv"
ARCHIVO_SALIDA = "casos_grupo_ets_completo.csv"

TERMINOS_ETS = [
    "sífilis", "sifilis", "vih", "gonorrea",
    "hepatitis b", "hepatitis c",
    "infecciones genitales", "htlv",
]


def filtrar_dataset():
    """
    Filtra el dataset original por provincia == 'Chubut' y agrupa eventos ETS.
    Genera casos_grupo_ets_completo.csv (2.488 casos).
    """
    if not os.path.exists(NOMBRE_ARCHIVO):
        print(f"Error: No se encontró '{NOMBRE_ARCHIVO}'")
        return

    df = pd.read_csv(NOMBRE_ARCHIVO)

    if "provincia" not in df.columns:
        print("Error: El CSV no tiene la columna 'provincia'")
        return

    df["provincia"] = df["provincia"].astype(str).str.strip()
    df = df[df["provincia"].str.lower() == "chubut"]
    print(f"Registros de Chubut: {len(df)}")

    if df.empty:
        print("No hay casos para Chubut.")
        return

    regex_ets = "|".join(TERMINOS_ETS)
    df_ets = df[df["evento"].str.contains(regex_ets, case=False, na=False)]
    print(f"Generando dataset con TODAS las ETS de Chubut ({len(df_ets)} casos)...")

    df_ets.to_csv(ARCHIVO_SALIDA, index=False)
    print(f"¡Éxito! Archivo guardado como: '{ARCHIVO_SALIDA}'")


if __name__ == "__main__":
    filtrar_dataset()
