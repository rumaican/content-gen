"""
poster-generator/api/test_main.py
Tests for FastAPI server (E2-US1).
"""

import os
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock


# Set test env before importing app
os.environ["ENV"] = "test"
os.environ["PORT"] = "8001"

from main import app


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
