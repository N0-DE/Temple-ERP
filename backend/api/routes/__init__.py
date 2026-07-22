from fastapi import APIRouter
from . import auth, pooja, devotee

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(pooja.router, prefix="/poojas", tags=["poojas"])
api_router.include_router(devotee.router, prefix="/devotees", tags=["devotees"])
