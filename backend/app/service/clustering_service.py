import numpy as np
import pandas as pd
import time
from sklearn.cluster import OPTICS, DBSCAN
from typing import Dict, Any
from sklearn.neighbors import NearestNeighbors
from sklearn.metrics import silhouette_score, calinski_harabasz_score, davies_bouldin_score


def _haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1_rad, lon1_rad = np.radians(lat1), np.radians(lon1)
    lat2_rad, lon2_rad = np.radians(lat2), np.radians(lon2)
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = np.sin(dlat/2)**2 + np.cos(lat1_rad) * np.cos(lat2_rad) * np.sin(dlon/2)**2
    c = 2 * np.arcsin(np.sqrt(a))
    return R * c


def _pairwise_haversine(lats, lons):
    n = len(lats)
    dist = np.zeros((n, n))
    for i in range(n):
        for j in range(i+1, n):
            d = _haversine_distance(lats[i], lons[i], lats[j], lons[j])
            dist[i, j] = d
            dist[j, i] = d
    return dist


def explorar_optics_para_parametros(df: pd.DataFrame, min_samples: int = 5, max_eps_km: float = 20.0) -> Dict[str, Any]:
    """
    OPTICS como EXPLORADOR de densidad. Estima eps óptimo desde las distancias
    k-vecinas (k = min_samples - 1), heurística estándar para DBSCAN.
    """
    start = time.time()
    lats = df['latitud'].values
    lons = df['longitud'].values
    dist_matrix = _pairwise_haversine(lats, lons) + 1e-9

    optics = OPTICS(min_samples=min_samples, max_eps=max_eps_km, metric='precomputed', n_jobs=-1)
    optics.fit(dist_matrix)

    reachability = optics.reachability_[optics.ordering_]
    reach_valid = reachability[np.isfinite(reachability)]

    k = max(2, min_samples - 1)
    n = dist_matrix.shape[0]

    k_dists = np.zeros(n)
    for i in range(n):
        fila = dist_matrix[i].copy()
        fila[i] = np.inf
        fila.sort()
        k_dists[i] = fila[k - 1]

    k_dists_valid = k_dists[(k_dists > 0) & (k_dists < max_eps_km * 3)]

    if len(k_dists_valid) > 0:
        eps_optimo_km = float(np.percentile(k_dists_valid, 90))
    else:
        eps_optimo_km = float(np.percentile(reach_valid, 50)) if len(reach_valid) > 0 else 1.0

    eps_optimo_km = max(1.0, min(eps_optimo_km, max_eps_km * 0.5))

    min_samples_optimo = max(4, min_samples)
    tiempo_ms = (time.time() - start) * 1000

    total = len(reachability)
    step = max(1, total // 500)
    reachability_plot = []
    for i in range(0, total, step):
        v = reachability[i]
        reachability_plot.append({
            "indice": int(i),
            "valor_km": float(v) if np.isfinite(v) and v < max_eps_km * 2 else None
        })

    return {
        "algorithm": "OPTICS (exploración)",
        "eps_espacial_sugerido_km": round(eps_optimo_km, 3),
        "min_samples_sugerido": int(min_samples_optimo),
        "max_eps_usado_km": max_eps_km,
        "tiempo_ms": tiempo_ms,
        "reachability_plot": reachability_plot,
        "estadisticas_reachability": {
            "min_km": float(np.min(reach_valid)) if len(reach_valid) > 0 else None,
            "max_km": float(np.max(reach_valid)) if len(reach_valid) > 0 else None,
            "media_km": float(np.mean(reach_valid)) if len(reach_valid) > 0 else None,
            "mediana_km": float(np.median(reach_valid)) if len(reach_valid) > 0 else None,
        },
        "estadisticas_k_dists": {
            "percentil_90_km": float(np.percentile(k_dists_valid, 90)) if len(k_dists_valid) > 0 else None,
            "mediana_km": float(np.median(k_dists_valid)) if len(k_dists_valid) > 0 else None,
        }
    }


def ejecutar_st_dbscan(df: pd.DataFrame, eps_espacial_km: float, eps_temporal_semanas: float, min_samples: int) -> Dict[str, Any]:
    """ST-DBSCAN final. Recibe parámetros derivados de OPTICS."""
    start = time.time()
    lats = df['latitud'].values
    lons = df['longitud'].values
    semanas = df['semana_epidemiologica'].values
    anios = df['anio_epidemiologico'].values
    semana_abs = (anios - 2000) * 52 + semanas

    spatial_dist = _pairwise_haversine(lats, lons) + 1e-9
    temporal_dist = np.abs(semana_abs[:, np.newaxis] - semana_abs[np.newaxis, :])
    combined_dist = np.maximum(spatial_dist / eps_espacial_km, temporal_dist / eps_temporal_semanas)

    dbscan = DBSCAN(eps=1.0, min_samples=min_samples, metric='precomputed')
    labels = dbscan.fit_predict(combined_dist)

    tiempo_ms = (time.time() - start) * 1000
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_ruido = list(labels).count(-1)
    pct_ruido = (n_ruido / len(labels)) * 100 if len(labels) > 0 else 0

    tamanos = {}
    for c in set(labels):
        if c != -1:
            tamanos[int(c)] = int(list(labels).count(c))

    return {
        "algorithm": "ST-DBSCAN",
        "labels": labels.tolist(),
        "n_clusters": n_clusters,
        "n_ruido": n_ruido,
        "pct_ruido": pct_ruido,
        "tiempo_ms": tiempo_ms,
        "tamanos_clusters": tamanos,
        "params": {
            "eps_espacial_km": eps_espacial_km,
            "eps_temporal_semanas": eps_temporal_semanas,
            "min_samples": min_samples
        }
    }


def ejecutar_st_knn(df: pd.DataFrame, k: int = 6, radio_espacial_km: float = 10.0,
                    radio_temporal_semanas: int = 3, umbral_similaridad: float = 0.7) -> Dict[str, Any]:
    """
    Algoritmo espacio-temporal basado en vecinos más cercanos (ST-kNN).
    Para cada punto busca sus k vecinos más cercanos en espacio-tiempo ponderado.
    Agrupa puntos que comparten vecinos recíprocos con alta similitud espacio-temporal.
    """
    start = time.time()
    n = len(df)
    if n == 0:
        return {"algorithm": "ST-kNN", "labels": [], "n_clusters": 0, "n_ruido": 0, "pct_ruido": 0, "tiempo_ms": 0}

    lats = df['latitud'].values
    lons = df['longitud'].values
    semanas = df['semana_epidemiologica'].values
    anios = df['anio_epidemiologico'].values
    semana_abs = (anios - 2000) * 52 + semanas

    spatial_dist = _pairwise_haversine(lats, lons)
    temporal_dist = np.abs(semana_abs[:, np.newaxis] - semana_abs[np.newaxis, :]).astype(float)

    # Normalización ponderada espacio-tiempo
    spatial_norm = spatial_dist / (radio_espacial_km + 1e-9)
    temporal_norm = temporal_dist / (radio_temporal_semanas + 1e-9)
    st_dist = np.sqrt(spatial_norm ** 2 + temporal_norm ** 2)

    labels = np.full(n, -1)
    visited = np.zeros(n, dtype=bool)
    cluster_id = 0

    for i in range(n):
        if visited[i]:
            continue
        # Vecinos dentro del radio
        vecinos_candidatos = np.where((spatial_dist[i] <= radio_espacial_km) &
                                      (temporal_dist[i] <= radio_temporal_semanas))[0]
        vecinos_candidatos = vecinos_candidatos[vecinos_candidatos != i]
        if len(vecinos_candidatos) < k - 1:
            visited[i] = True
            continue

        # Ordenar por distancia espacio-temporal
        orden = np.argsort(st_dist[i, vecinos_candidatos])
        vecinos_knn = vecinos_candidatos[orden[:k - 1]]

        # Verificar vecindad recíproca y similitud
        cluster_members = {i}
        for j in vecinos_knn:
            if j in cluster_members:
                continue
            vecinos_j = np.where((spatial_dist[j] <= radio_espacial_km) &
                                 (temporal_dist[j] <= radio_temporal_semanas))[0]
            vecinos_j = set(vecinos_j)
            if i in vecinos_j:
                similitud = 1.0 / (1.0 + st_dist[i, j])
                if similitud >= umbral_similaridad:
                    cluster_members.add(j)
            elif len(vecinos_j.intersection(cluster_members)) >= max(1, k // 2):
                similitud = 1.0 / (1.0 + st_dist[i, j])
                if similitud >= umbral_similaridad * 0.8:
                    cluster_members.add(j)

        if len(cluster_members) >= max(k, 3):
            for m in cluster_members:
                labels[m] = cluster_id
                visited[m] = True
            cluster_id += 1
        else:
            visited[i] = True

    tiempo_ms = (time.time() - start) * 1000
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_ruido = list(labels).count(-1)
    pct_ruido = (n_ruido / len(labels)) * 100 if len(labels) > 0 else 0

    tamanos = {}
    for c in set(labels):
        if c != -1:
            tamanos[int(c)] = int(list(labels).count(c))

    return {
        "algorithm": "ST-kNN",
        "labels": labels.tolist(),
        "n_clusters": n_clusters,
        "n_ruido": n_ruido,
        "pct_ruido": pct_ruido,
        "tiempo_ms": tiempo_ms,
        "tamanos_clusters": tamanos,
        "params": {
            "k": k,
            "radio_espacial_km": radio_espacial_km,
            "radio_temporal_semanas": radio_temporal_semanas,
            "umbral_similaridad": umbral_similaridad
        }
    }


def calcular_metricas_clustering(df: pd.DataFrame, labels: list) -> Dict[str, Any]:
    """Calcula métricas de evaluación para comparar algoritmos de clustering."""
    labels_arr = np.array(labels)
    n = len(labels_arr)
    if n == 0:
        return {}

    lats = df['latitud'].values
    lons = df['longitud'].values
    semanas = df['semana_epidemiologica'].values
    anios = df['anio_epidemiologico'].values
    semana_abs = (anios - 2000) * 52 + semanas

    spatial_dist = _pairwise_haversine(lats, lons)
    temporal_dist = np.abs(semana_abs[:, np.newaxis] - semana_abs[np.newaxis, :]).astype(float)
    st_dist = np.maximum(spatial_dist / 10.0, temporal_dist / 3.0)

    n_clusters = len(set(labels_arr)) - (1 if -1 in labels_arr else 0)
    n_ruido = int((labels_arr == -1).sum())
    pct_ruido = (n_ruido / n) * 100

    metricas = {
        "n_puntos": n,
        "n_clusters": n_clusters,
        "n_ruido": n_ruido,
        "pct_ruido": round(pct_ruido, 2)
    }

    # Métricas con sklearn (solo para puntos no ruido si es posible)
    mask_valid = labels_arr != -1
    if n_clusters >= 2 and mask_valid.sum() >= 2:
        try:
            X = np.column_stack([
                lats[mask_valid], lons[mask_valid],
                (semana_abs[mask_valid] - semana_abs.min()) / max(1, semana_abs.max() - semana_abs.min())
            ])
            metricas["silhouette_score"] = round(float(silhouette_score(X, labels_arr[mask_valid])), 4)
            metricas["calinski_harabasz_score"] = round(float(calinski_harabasz_score(X, labels_arr[mask_valid])), 2)
            metricas["davies_bouldin_score"] = round(float(davies_bouldin_score(X, labels_arr[mask_valid])), 4)
        except Exception as e:
            metricas["sklearn_error"] = str(e)
    else:
        metricas["silhouette_score"] = None
        metricas["calinski_harabasz_score"] = None
        metricas["davies_bouldin_score"] = None

    # Métricas espacio-temporales propias
    try:
        if n_clusters >= 1:
            cohesiones_espaciales = []
            separaciones = []
            for c in set(labels_arr):
                if c == -1:
                    continue
                idx_c = np.where(labels_arr == c)[0]
                if len(idx_c) < 2:
                    cohesiones_espaciales.append(0)
                    continue
                # Cohesión espacial promedio intra-cluster
                d_intra = []
                for i in range(len(idx_c)):
                    for j in range(i + 1, len(idx_c)):
                        d_intra.append(spatial_dist[idx_c[i], idx_c[j]])
                cohesiones_espaciales.append(float(np.mean(d_intra)))
            metricas["cohesion_espacial_promedio_km"] = round(float(np.mean(cohesiones_espaciales)), 3) if cohesiones_espaciales else None

            # Ratio casos clusterizados / total
            metricas["ratio_clusterizado"] = round(float(mask_valid.sum() / n), 3)
    except Exception:
        pass

    return metricas


def comparar_algoritmos(df: pd.DataFrame, min_samples: int = 5, max_eps_km: float = 20.0,
                        eps_temporal_semanas: int = 2) -> Dict[str, Any]:
    """Ejecuta múltiples algoritmos y compara sus métricas."""
    resultados = {}
    metricas_comparativas = {}

    # 1. ST-DBSCAN (con OPTICS para parámetros)
    try:
        exploracion = explorar_optics_para_parametros(df, min_samples, max_eps_km)
        res_stdb = ejecutar_st_dbscan(
            df,
            eps_espacial_km=exploracion["eps_espacial_sugerido_km"],
            eps_temporal_semanas=eps_temporal_semanas,
            min_samples=exploracion["min_samples_sugerido"]
        )
        resultados["ST-DBSCAN"] = {
            "exploracion": exploracion,
            "resultado": res_stdb
        }
        metricas_comparativas["ST-DBSCAN"] = calcular_metricas_clustering(df, res_stdb["labels"])
        metricas_comparativas["ST-DBSCAN"]["tiempo_ms"] = res_stdb["tiempo_ms"]
        metricas_comparativas["ST-DBSCAN"]["params"] = res_stdb["params"]
    except Exception as e:
        resultados["ST-DBSCAN"] = {"error": str(e)}

    # 2. ST-kNN
    try:
        res_stknn = ejecutar_st_knn(df, k=min_samples + 1, radio_espacial_km=10.0,
                                    radio_temporal_semanas=eps_temporal_semanas + 1,
                                    umbral_similaridad=0.65)
        resultados["ST-kNN"] = {"resultado": res_stknn}
        metricas_comparativas["ST-kNN"] = calcular_metricas_clustering(df, res_stknn["labels"])
        metricas_comparativas["ST-kNN"]["tiempo_ms"] = res_stknn["tiempo_ms"]
        metricas_comparativas["ST-kNN"]["params"] = res_stknn["params"]
    except Exception as e:
        resultados["ST-kNN"] = {"error": str(e)}

    # 3. ST-kNN con parámetros más restrictivos
    try:
        res_stknn2 = ejecutar_st_knn(df, k=min_samples + 2, radio_espacial_km=7.0,
                                     radio_temporal_semanas=eps_temporal_semanas,
                                     umbral_similaridad=0.75)
        resultados["ST-kNN-restringido"] = {"resultado": res_stknn2}
        metricas_comparativas["ST-kNN-restringido"] = calcular_metricas_clustering(df, res_stknn2["labels"])
        metricas_comparativas["ST-kNN-restringido"]["tiempo_ms"] = res_stknn2["tiempo_ms"]
        metricas_comparativas["ST-kNN-restringido"]["params"] = res_stknn2["params"]
    except Exception as e:
        resultados["ST-kNN-restringido"] = {"error": str(e)}

    return {
        "resultados": resultados,
        "comparativa_metricas": metricas_comparativas,
        "recomendacion": _generar_recomendacion(metricas_comparativas)
    }


def _generar_recomendacion(metricas_comparativas: Dict) -> str:
    """Genera recomendación basada en métricas."""
    mejor = None
    mejor_score = -np.inf
    for alg, met in metricas_comparativas.items():
        if met.get("error"):
            continue
        score = 0
        if met.get("silhouette_score") and met["silhouette_score"] > 0:
            score += met["silhouette_score"] * 10
        if met.get("n_clusters", 0) > 0 and met.get("n_clusters", 0) < 20:
            score += 2
        if met.get("pct_ruido", 100) < 50:
            score += (50 - met["pct_ruido"]) / 10
        if met.get("ratio_clusterizado", 0) > 0.3:
            score += met["ratio_clusterizado"] * 3
        if score > mejor_score:
            mejor_score = score
            mejor = alg
    if mejor:
        return f"Mejor algoritmo según métricas combinadas: {mejor}"
    return "Revisar parámetros manualmente"