"""Generación de PDF."""
import io
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import pandas as pd

from app.service import pdf_report_service

router = APIRouter()


class PDFRequest(BaseModel):
    exploracion_optics: dict
    clustering_stdbscan: dict
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
            datos_evolucion_temporal=evolucion_df,
            datos_indices=payload.datos_indices,
            correlaciones=payload.correlaciones,
            total_casos=payload.total_casos,
        )
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=reporte_experimento.pdf"},
        )
    except Exception as e:
        raise HTTPException(500, detail=f"Error generando PDF: {e}")