import io
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageBreak
)
from typing import Dict, Any, List


def _crear_tabla_metricas(metricas: List[Dict[str, Any]]):
    data = [['Algoritmo', 'Tiempo (ms)', 'Clusters', '% Ruido', 'Observaciones']]
    for m in metricas:
        obs = ""
        if m.get('algorithm') == 'OPTICS (exploración)':
            obs = f"eps sugerido: {m.get('eps_espacial_sugerido_km')} km"
        elif m.get('algorithm') == 'ST-DBSCAN':
            obs = f"ε={m['params']['eps_espacial_km']}km, Δt={m['params']['eps_temporal_semanas']}sem"
        data.append([
            m.get('algorithm', '-'),
            f"{m.get('tiempo_ms', 0):.1f}",
            str(m.get('n_clusters', '-')),
            f"{m.get('pct_ruido', 0):.1f}%",
            obs
        ])
    t = Table(data, colWidths=[110, 80, 70, 60, 200])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f172a')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#f1f5f9')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
    ]))
    return t


def _crear_grafico_evolucion(evolucion_df):
    if evolucion_df.empty or 'semana_epidemiologica' not in evolucion_df.columns:
        return None
    fig, ax = plt.subplots(figsize=(8, 3.2))
    ax.plot(evolucion_df['semana_epidemiologica'], evolucion_df['casos'],
            marker='o', color='#2563eb', linewidth=1.5, markersize=4)
    ax.set_xlabel('Semana Epidemiológica', fontsize=9)
    ax.set_ylabel('Casos', fontsize=9)
    ax.set_title('Evolución Temporal de Casos', fontsize=10, fontweight='bold')
    ax.grid(True, linestyle='--', alpha=0.5)
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=110)
    plt.close()
    buf.seek(0)
    return buf


def _crear_grafico_reachability(reachability_plot):
    datos = [p for p in reachability_plot if p['valor_km'] is not None]
    if not datos:
        return None
    fig, ax = plt.subplots(figsize=(8, 3))
    xs = [p['indice'] for p in datos]
    ys = [p['valor_km'] for p in datos]
    ax.plot(xs, ys, color='#7c3aed', linewidth=0.8)
    ax.set_xlabel('Índice ordenado', fontsize=9)
    ax.set_ylabel('Alcanzabilidad (km)', fontsize=9)
    ax.set_title('Reachability Plot de OPTICS', fontsize=10, fontweight='bold')
    ax.grid(True, linestyle='--', alpha=0.5)
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=110)
    plt.close()
    buf.seek(0)
    return buf


def _crear_grafico_correlaciones(correlaciones):
    if not correlaciones:
        return None
    fig, ax = plt.subplots(figsize=(8, 3.2))
    nombres = list(correlaciones.keys())
    valores = list(correlaciones.values())
    colores = ['#059669' if v >= 0 else '#dc2626' for v in valores]
    ax.barh(nombres, valores, color=colores)
    ax.set_xlabel('Correlación de Pearson', fontsize=9)
    ax.set_title('Correlación Casos vs Índices', fontsize=10, fontweight='bold')
    ax.axvline(0, color='black', linewidth=0.8)
    ax.grid(True, linestyle='--', alpha=0.4, axis='x')
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=110)
    plt.close()
    buf.seek(0)
    return buf


def _crear_tabla_indices(datos_indices):
    if not datos_indices:
        return None
    head = ['Link', 'Localidad', 'Casos', '% Total', 'Índice Comp.']
    data = [head]
    for r in datos_indices[:20]:
        data.append([
            str(r.get('link', ''))[:15],
            str(r.get('localidad', ''))[:18],
            str(r.get('casos', 0)),
            f"{r.get('pct_del_total', 0):.1f}%",
            f"{(r.get('indice_compuesto') or 0) * 100:.1f}%"
        ])
    t = Table(data, colWidths=[90, 130, 50, 60, 90])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#ea580c')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('ALIGN', (2,0), (-1,-1), 'CENTER'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.grey),
    ]))
    return t


def generar_pdf_experimento(
    exploracion_optics: Dict[str, Any],
    clustering_stdbscan: Dict[str, Any],
    datos_evolucion_temporal: pd.DataFrame,
    datos_indices: List[Dict[str, Any]] = None,
    correlaciones: Dict[str, float] = None,
    total_casos: int = 0
) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph("Reporte de Análisis Espacio-Temporal", styles['Title']))
    story.append(Spacer(1, 8))
    story.append(Paragraph(f"<b>Provincia de Chubut</b> — Universo: <b>{total_casos}</b> casos", styles['Normal']))
    story.append(Spacer(1, 20))

    story.append(Paragraph("1. Resumen Ejecutivo", styles['Heading2']))
    resumen = (
        f"Se procesaron {total_casos} casos. El flujo OPTICS → ST-DBSCAN detectó "
        f"<b>{clustering_stdbscan.get('n_clusters', 0)} clusters</b> con "
        f"{clustering_stdbscan.get('pct_ruido', 0):.1f}% de ruido."
    )
    story.append(Paragraph(resumen, styles['Normal']))
    story.append(Spacer(1, 12))

    story.append(Paragraph("2. Métricas de Rendimiento", styles['Heading2']))
    story.append(_crear_tabla_metricas([exploracion_optics, clustering_stdbscan]))
    story.append(Spacer(1, 16))

    story.append(PageBreak())
    story.append(Paragraph("3. Flujo 1: OPTICS (Exploración)", styles['Heading2']))
    story.append(Paragraph(
        f"OPTICS sugirió <b>eps = {exploracion_optics.get('eps_espacial_sugerido_km')} km</b> y "
        f"<b>min_samples = {exploracion_optics.get('min_samples_sugerido')}</b>.",
        styles['Normal']
    ))
    img = _crear_grafico_reachability(exploracion_optics.get('reachability_plot', []))
    if img:
        story.append(Image(img, width=470, height=180))

    story.append(PageBreak())
    story.append(Paragraph("4. Flujo 2: ST-DBSCAN (Clustering Final)", styles['Heading2']))
    p = clustering_stdbscan.get('params', {})
    story.append(Paragraph(
        f"ε_espacial = {p.get('eps_espacial_km')} km, ε_temporal = {p.get('eps_temporal_semanas')} semanas, "
        f"min_samples = {p.get('min_samples')}.",
        styles['Normal']
    ))
    story.append(Paragraph(
        f"Clusters: {clustering_stdbscan.get('n_clusters', 0)} — Ruido: {clustering_stdbscan.get('n_ruido', 0)} "
        f"({clustering_stdbscan.get('pct_ruido', 0):.1f}%) — Tiempo: {clustering_stdbscan.get('tiempo_ms', 0):.1f} ms",
        styles['Normal']
    ))

    story.append(PageBreak())
    story.append(Paragraph("5. Evolución Temporal", styles['Heading2']))
    img = _crear_grafico_evolucion(datos_evolucion_temporal)
    if img:
        story.append(Image(img, width=470, height=190))

    if datos_indices or correlaciones:
        story.append(PageBreak())
        story.append(Paragraph("6. Índices Sociodemográficos", styles['Heading2']))
        story.append(Paragraph(
            "Los índices están normalizados entre 0 y 1 (0.42 = 42%).",
            styles['Normal']
        ))
        if correlaciones:
            img = _crear_grafico_correlaciones(correlaciones)
            if img:
                story.append(Image(img, width=470, height=190))
        if datos_indices:
            tabla = _crear_tabla_indices(datos_indices)
            if tabla:
                story.append(tabla)

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()