"""
poster-generator/api/main.py
FastAPI server for the maptoposter map generation API.
"""

import os
import logging
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

PORT = int(os.getenv("PORT", "8000"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for startup/shutdown events."""
    logger.info(f"Poster Generator API starting on port {PORT}")
    yield
    logger.info("Poster Generator API shutting down")


# CORS allowed origins (configurable via environment)
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,https://maptoposter.com",
).split(",")

app = FastAPI(
    title="Poster Generator API",
    description="Async map generation API for maptoposter storefront",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests."""
    start = datetime.now(timezone.utc)
    logger.info(f"--> {request.method} {request.url.path}")
    response = await call_next(request)
    duration = (datetime.now(timezone.utc) - start).total_seconds() * 1000
    logger.info(f"<-- {response.status_code} {request.method} {request.url.path} ({duration:.1f}ms)")
    return response


@app.get("/health")
def health_check():
    """
    Health check endpoint.
    Returns status and current server timestamp.
    """
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@app.get("/")
def root():
    """Root endpoint with API info."""
    return JSONResponse(
        status_code=200,
        content={
            "name": "Poster Generator API",
            "version": "1.0.0",
            "docs": "/docs",
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=PORT,
        reload=os.getenv("ENV", "production") != "production",
    )
