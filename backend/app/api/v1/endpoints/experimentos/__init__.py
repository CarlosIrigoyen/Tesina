"""Router agregador para el módulo de experimentos."""
from fastapi import APIRouter

from .casos import router as casos_router
from .clusters import router as clusters_router
from .clustering import router as clustering_router
from .satscan import router as satscan_router
from .indices import router as indices_router
from .estadisticas import router as estadisticas_router
from .ciudad import router as ciudad_router
from .reportes import router as reportes_router

router = APIRouter()

router.include_router(casos_router, tags=["casos"])
router.include_router(clusters_router, tags=["clusters"])
router.include_router(clustering_router, tags=["clustering"])
router.include_router(satscan_router, tags=["satscan"])
router.include_router(indices_router, tags=["indices"])
router.include_router(estadisticas_router, tags=["estadisticas"])
router.include_router(ciudad_router, tags=["ciudad"])
router.include_router(reportes_router, tags=["reportes"])
