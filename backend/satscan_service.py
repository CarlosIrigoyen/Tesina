import numpy as np
import pandas as pd
from scipy.spatial.distance import cdist

def ejecutar_satscan_poisson(
    df: pd.DataFrame,
    col_lat: str = 'lat',
    col_lon: str = 'lon',
    col_casos: str = 'casos',
    col_poblacion: str = 'poblacion',
    col_tiempo: str = 'semana_epi',
    max_spatial_pct: float = 0.5,
    max_temporal_weeks: int = 4,
    n_simulaciones: int = 999
):
    """
    Implementación en Python del algoritmo SaTScan Espacio-Temporal (Poisson).
    Calcula el cilindro espacio-temporal de mayor verosimilitud (LLR) y
    valida la significancia estadística con permutaciones de Monte Carlo.
    """
    if df.empty:
        return None

    coords = df[[col_lat, col_lon]].values
    # Matriz de distancias euclidianas aproximada en kilómetros (1 grado ≈ 111 km)
    dist_matrix = cdist(coords, coords) * 111.0 
    
    total_casos = df[col_casos].sum()
    total_pob = df[col_poblacion].sum()
    
    if total_pob == 0 or total_casos == 0:
        return None
        
    tasa_global = total_casos / total_pob
    unique_times = sorted(df[col_tiempo].unique())
    n_registros = len(df)
    
    def evaluar_max_llr(datos):
        max_llr = -np.inf
        best_c = None
        
        for i in range(n_registros):
            dists = dist_matrix[i]
            for r in np.unique(dists):
                mask_esp = dists <= r
                pob_dentro = datos.loc[mask_esp, col_poblacion].sum()
                
                # Restricción espacial para no abarcar más del porcentaje límite
                if pob_dentro > total_pob * max_spatial_pct or pob_dentro == 0:
                    break
                
                for t_start in unique_times:
                    for w in range(1, max_temporal_weeks + 1):
                        t_end = t_start + w - 1
                        mask_temp = (datos[col_tiempo] >= t_start) & (datos[col_tiempo] <= t_end)
                        mask_cilindro = mask_esp & mask_temp
                        
                        c_obs = datos.loc[mask_cilindro, col_casos].sum()
                        pob_pond = pob_dentro * (w / len(unique_times))
                        c_esp = pob_pond * tasa_global
                        
                        if c_esp == 0 or c_obs <= c_esp:
                            continue
                        
                        # Expresión Log-Likelihood Ratio (LLR Poisson)
                        c_fuera = total_casos - c_obs
                        e_fuera = total_casos - c_esp
                        
                        llr = c_obs * np.log(c_obs / c_esp)
                        if c_fuera > 0 and e_fuera > 0:
                            llr += c_fuera * np.log(c_fuera / e_fuera)
                            
                        if llr > max_llr:
                            max_llr = llr
                            best_c = {
                                "radio_id_centro": int(datos.iloc[i]['radio_id']),
                                "radio_km": float(round(r, 2)),
                                "semana_inicio": int(t_start),
                                "semana_fin": int(t_end),
                                "casos_observados": int(c_obs),
                                "casos_esperados": float(round(c_esp, 2)),
                                "llr": float(round(llr, 4))
                            }
        return max_llr, best_c

    # 1. Evaluar datos reales
    best_llr, cluster = evaluar_max_llr(df)
    
    if cluster is None or best_llr == -np.inf:
        return {"mensaje": "No se encontraron clusters significativos."}

    # 2. Simulaciones de Monte Carlo para calcular p-value
    llr_sims = []
    df_sim = df.copy()
    casos_arr = df[col_casos].values.copy()
    
    for _ in range(n_simulaciones):
        np.random.shuffle(casos_arr)
        df_sim[col_casos] = casos_arr
        llr_s, _ = evaluar_max_llr(df_sim)
        llr_sims.append(llr_s)
        
    p_val = (sum(1 for s in llr_sims if s >= best_llr) + 1) / (n_simulaciones + 1)
    cluster["p_value"] = float(round(p_val, 4))
    
    return cluster
