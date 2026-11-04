"""Helpers compartidos entre los endpoints de experimentos."""
from typing import Optional
import logging

import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def filtrar_por_localidad(df: pd.DataFrame, localidad: Optional[str]) -> pd.DataFrame:
    """Filtra un DataFrame de casos por localidad (sin distinguir mayúsculas)."""
    if not localidad or df.empty or "localidad" not in df.columns:
        return df
    objetivo = localidad.strip().lower()
    mask = df["localidad"].astype(str).str.strip().str.lower() == objetivo
    return df[mask].reset_index(drop=True)


def asegurar_indices(db: Session) -> None:
    """Crea los índices necesarios para los JOINs. Idempotente."""
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
        logger.warning(f"No se pudieron asegurar índices: {e}")
