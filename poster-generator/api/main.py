"""
poster-generator/api/main.py
FastAPI server for the maptoposter map generation API.
"""

import os
import logging
import subprocess
import uuid
import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

PORT = int(os.getenv("PORT", "8000"))

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

API_DIR = Path(__file__).parent
JOBS_DIR = API_DIR / "jobs"
SCRIPT_PATH = API_DIR / "generate_etsy_bundle.py"

# Ensure jobs directory exists
JOBS_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# Allowed themes
# ---------------------------------------------------------------------------

ALLOWED_THEMES = frozenset([
    "midnight_blue",
    "vintage",
    "sepia",
    "watercolor",
    "dark",
])

# ---------------------------------------------------------------------------
# Request/Response models
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    city: str = Field(..., min_length=1, description="City name")
    country: str = Field(..., min_length=1, description="Country name")
    theme: str = Field(..., description="Map theme")
    customer_email: str = Field(..., description="Customer email address")

    model_config = {
        "json_schema_extra": {
            "example": {
                "city": "Warsaw",
                "country": "Poland",
                "theme": "midnight_blue",
                "customer_email": "user@example.com",
            }
        }
    }


class GenerateResponse(BaseModel):
    job_id: str


class ErrorResponse(BaseModel):
    detail: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run_generation(job_id: str, city: str, country: str, theme: str) -> None:
    """
    Background worker: runs the maptoposter bundle script and updates
    the job status file when complete.
    """
    job_file = JOBS_DIR / f"{job_id}.json"
    try:
        logger.info(f"[{job_id}] Starting generation: city={city}, country={country}, theme={theme}")

        # Run the generation script as a subprocess
        result = subprocess.run(
            [
                "python",
                str(SCRIPT_PATH),
                "-c", city,
                "-C", country,
                "-t", theme,
                "--no-attribution",
            ],
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
        )

        if result.returncode == 0:
            _update_job_status(job_id, "completed")
            logger.info(f"[{job_id}] Generation completed successfully")
        else:
            _update_job_status(job_id, "failed", error=result.stderr[:500])
            logger.error(f"[{job_id}] Generation failed: {result.stderr[:500]}")
    except subprocess.TimeoutExpired:
        _update_job_status(job_id, "failed", error="Generation timed out after 5 minutes")
        logger.error(f"[{job_id}] Generation timed out")
    except Exception as exc:
        _update_job_status(job_id, "failed", error=str(exc))
        logger.exception(f"[{job_id}] Generation error")


def _update_job_status(job_id: str, status: str, **extra: str) -> None:
    """Update the job status file with new status and any extra fields."""
    job_file = JOBS_DIR / f"{job_id}.json"
    if not job_file.exists():
        return
    data = json.loads(job_file.read_text())
    data["status"] = status
    data.update(extra)
    if status in ("completed", "failed"):
        data["finished_at"] = datetime.now(timezone.utc).isoformat()
    job_file.write_text(json.dumps(data, indent=2))


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for startup/shutdown events."""
    logger.info(f"Poster Generator API starting on port {PORT}")
    JOBS_DIR.mkdir(exist_ok=True)
    yield
    logger.info("Poster Generator API shutting down")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

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


@app.post(
    "/generate",
    status_code=202,
    response_model=GenerateResponse,
    responses={400: {"model": ErrorResponse}},
)
def generate_map(request: GenerateRequest, background_tasks: BackgroundTasks):
    """
    Accept a map generation request and trigger async generation.

    Returns immediately with a job_id. The generation runs in the background.
    """
    # Theme validation
    if request.theme not in ALLOWED_THEMES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid theme '{request.theme}'. Allowed themes: {', '.join(sorted(ALLOWED_THEMES))}",
        )

    # Generate job ID
    job_id = str(uuid.uuid4())

    # Initial job status
    job_data = {
        "job_id": job_id,
        "status": "running",
        "city": request.city,
        "country": request.country,
        "theme": request.theme,
        "customer_email": request.customer_email,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }

    # Persist job file
    job_file = JOBS_DIR / f"{job_id}.json"
    job_file.write_text(json.dumps(job_data, indent=2))
    logger.info(f"[{job_id}] Job file created at {job_file}")

    # Schedule background generation
    background_tasks.add_task(_run_generation, job_id, request.city, request.country, request.theme)

    return GenerateResponse(job_id=job_id)


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=PORT,
        reload=os.getenv("ENV", "production") != "production",
    )
