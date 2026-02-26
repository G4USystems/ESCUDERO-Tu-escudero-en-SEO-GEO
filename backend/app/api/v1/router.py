from fastapi import APIRouter

from app.api.v1.analysis import router as analysis_router
from app.api.v1.brief import router as brief_router
from app.api.v1.content import router as content_router
from app.api.v1.domains import router as domains_router
from app.api.v1.geo import router as geo_router
from app.api.v1.niches import router as niches_router
from app.api.v1.projects import router as projects_router
from app.api.v1.prompts import router as prompts_router
from app.api.v1.seo import router as seo_router
from app.api.v1.influencers import router as influencers_router
from app.api.v1.influencer_brief import router as influencer_brief_router
from app.api.v1.sancho import router as sancho_router

api_router = APIRouter()

api_router.include_router(projects_router, prefix="/projects", tags=["projects"])
api_router.include_router(niches_router, prefix="/projects", tags=["niches"])
api_router.include_router(brief_router, tags=["brief"])
api_router.include_router(prompts_router, tags=["prompts"])
api_router.include_router(geo_router, tags=["geo"])
api_router.include_router(seo_router, tags=["seo"])
api_router.include_router(domains_router, tags=["domains"])
api_router.include_router(analysis_router, tags=["analysis"])
api_router.include_router(content_router, tags=["content"])
api_router.include_router(influencers_router, tags=["influencers"])
api_router.include_router(influencer_brief_router, tags=["influencer-brief"])
api_router.include_router(sancho_router, tags=["sancho"])
