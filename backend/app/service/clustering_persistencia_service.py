def guardar_configuracion_satscan(
    df: pd.DataFrame,
    satscan_resultado: dict,
    params: dict,
    localidad: str | None = None,
    indices: pd.DataFrame | None = None,
    tiempo_ms: float | None = None,
) -> dict:
    """Guarda una corrida de SaTScan-Poisson (se renderiza como cilindros)."""
    run_id = _generar_run_id("SaTScan-Poisson")
    creado_en = datetime.now().isoformat(timespec="seconds")
    nombre = _nombre_configuracion("SaTScan-Poisson", localidad, params)

    labels = [-1] * len(df)  # SaTScan no etiqueta caso por caso

    payload = {
        "id": run_id,
        "algoritmo": "SaTScan-Poisson",
        "nombre": nombre,
        "creado_en": creado_en,
        "localidad": localidad,
        "params": {k: _escalar(v) for k, v in params.items() if k != "tiempo_ms"},
        "resumen": {
            "n_casos": int(len(df)),
            "n_clusters": int(satscan_resultado.get("n_clusters_significativos", 0)),
            "n_ruido": int(len(df)),
            "pct_ruido": 100.0,
            "tiempo_ms": _escalar(tiempo_ms),
        },
        "metricas": {"n_clusters_significativos": satscan_resultado.get("n_clusters_significativos", 0)},
        "casos": _construir_casos(df.reset_index(drop=True), labels),
        "satscan_clusters": satscan_resultado.get("clusters", []),
        "poligonos": {"type": "FeatureCollection", "features": []},
        "clusters": [],
    }
    resumen = {k: payload[k] for k in
               ("id", "algoritmo", "nombre", "creado_en", "localidad",
                "params", "resumen", "metricas")}

    carpeta = DIRECTORIO / run_id
    carpeta.mkdir(parents=True, exist_ok=True)
    with (carpeta / "resultado.json").open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, allow_nan=False)
    with (carpeta / "configuracion.json").open("w", encoding="utf-8") as f:
        json.dump(resumen, f, ensure_ascii=False, allow_nan=False)
    return resumen