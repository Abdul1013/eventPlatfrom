import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import allocation

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger("sao-engine")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "SAO Engine ready — uvicorn serving on port %s", os.getenv("PORT", "8000")
    )
    yield


app = FastAPI(
    title="EventFlow SAO Engine",
    description="Seat Allocation Optimiser — K-means clustering + constrained greedy assignment",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — origins from ALLOWED_ORIGINS env var (comma-separated list)
_origins_raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
_allowed_origins = [o.strip() for o in _origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(allocation.router, prefix="/api/v1", tags=["Allocation"])


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "sao-engine"}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {"code": "INTERNAL_ERROR", "message": str(exc)},
        },
    )
