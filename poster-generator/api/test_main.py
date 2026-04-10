"""
poster-generator/api/test_main.py
Tests for FastAPI server (E2-US1, E2-US2, E2-US3).
"""

import os
import json
import uuid
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta


# Set test env before importing app
os.environ["ENV"] = "test"
os.environ["PORT"] = "8001"

from main import app, JOBS_DIR


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthEndpoint:
    def test_health_returns_200(self, client):
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_returns_status_ok(self, client):
        response = client.get("/health")
        data = response.json()
        assert data["status"] == "ok"

    def test_health_returns_timestamp(self, client):
        response = client.get("/health")
        data = response.json()
        assert "timestamp" in data


class TestRootEndpoint:
    def test_root_returns_200(self, client):
        response = client.get("/")
        assert response.status_code == 200

    def test_root_returns_api_info(self, client):
        response = client.get("/")
        data = response.json()
        assert data["name"] == "Poster Generator API"
        assert data["version"] == "1.0.0"


class TestCORSMiddleware:
    def test_cors_headers_present(self, client):
        response = client.get("/health", headers={"Origin": "http://localhost:3000"})
        assert "access-control-allow-origin" in response.headers


class TestPortEnvVar:
    def test_port_from_env_var(self):
        with patch.dict(os.environ, {"PORT": "9999"}):
            # Re-import to pick up new PORT
            import importlib
            import main
            importlib.reload(main)
            assert main.PORT == 9999


class TestStatusEndpoint:
    """Tests for GET /status/{job_id} (E2-US3)."""

    def _make_job_file(self, job_id: str, status: str, **extra) -> Path:
        """Helper: create a job status file and return its path."""
        data = {
            "job_id": job_id,
            "status": status,
            "city": "Warsaw",
            "country": "Poland",
            "theme": "midnight_blue",
            "started_at": datetime.now(timezone.utc).isoformat(),
            **extra,
        }
        if status == "complete":
            data["completed_at"] = datetime.now(timezone.utc).isoformat()
            data["zip_path"] = f"etsy_bundles/warsaw_midnight_blue_20260321_120215/"
            data["download_count"] = 0
        if status == "failed":
            data["error"] = "Generation script crashed"
        job_file = JOBS_DIR / f"{job_id}.json"
        job_file.write_text(json.dumps(data))
        return job_file

    def _cleanup(self, job_id: str):
        job_file = JOBS_DIR / f"{job_id}.json"
        if job_file.exists():
            job_file.unlink()

    def test_status_unknown_job_returns_404(self, client):
        fake_id = str(uuid.uuid4())
        response = client.get(f"/status/{fake_id}")
        assert response.status_code == 404

    def test_status_pending_job(self, client):
        job_id = str(uuid.uuid4())
        self._make_job_file(job_id, "pending")
        try:
            response = client.get(f"/status/{job_id}")
            assert response.status_code == 200
            data = response.json()
            assert data["job_id"] == job_id
            assert data["status"] == "pending"
            assert "started_at" in data
        finally:
            self._cleanup(job_id)

    def test_status_running_job(self, client):
        job_id = str(uuid.uuid4())
        self._make_job_file(job_id, "running")
        try:
            response = client.get(f"/status/{job_id}")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "running"
        finally:
            self._cleanup(job_id)

    def test_status_complete_job_includes_zip_path_and_timestamps(self, client):
        job_id = str(uuid.uuid4())
        self._make_job_file(job_id, "complete")
        try:
            response = client.get(f"/status/{job_id}")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "complete"
            assert "zip_path" in data
            assert "completed_at" in data
            assert "download_count" in data
        finally:
            self._cleanup(job_id)

    def test_status_failed_job_includes_error(self, client):
        job_id = str(uuid.uuid4())
        self._make_job_file(job_id, "failed")
        try:
            response = client.get(f"/status/{job_id}")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "failed"
            assert "error" in data
        finally:
            self._cleanup(job_id)

    def test_status_does_not_expose_internal_paths(self, client):
        job_id = str(uuid.uuid4())
        self._make_job_file(job_id, "complete")
        try:
            response = client.get(f"/status/{job_id}")
            data = response.json()
            response_text = json.dumps(data)
            # Internal paths like poster-generator/api/jobs should not appear
            assert "poster-generator" not in response_text
            assert "api/jobs" not in response_text
            assert "/home/" not in response_text
            assert "C:\\" not in response_text
        finally:
            self._cleanup(job_id)

    def test_status_expired_job_returns_404(self, client):
        """Jobs older than 7 days should return 404."""
        job_id = str(uuid.uuid4())
        old_date = datetime.now(timezone.utc) - timedelta(days=8)
        data = {
            "job_id": job_id,
            "status": "complete",
            "city": "Warsaw",
            "country": "Poland",
            "theme": "midnight_blue",
            "started_at": old_date.isoformat(),
            "completed_at": old_date.isoformat(),
            "zip_path": "etsy_bundles/warsaw/",
        }
        job_file = JOBS_DIR / f"{job_id}.json"
        job_file.write_text(json.dumps(data))
        try:
            response = client.get(f"/status/{job_id}")
            assert response.status_code == 404
        finally:
            self._cleanup(job_id)
