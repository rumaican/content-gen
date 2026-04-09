/**
 * __tests__/fastapi-generate-endpoint.test.ts
 * TDD: E2-US2 — POST /generate Endpoint
 *
 * Tests for:
 *  - POST /generate returns 202 with job_id immediately
 *  - Returns 400 if city/country/theme is missing or invalid
 *  - Theme validation rejects unknown themes
 *  - Job status file created at poster-generator/api/jobs/{job_id}.json
 *  - Generation runs in background, does not block the request
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { setTimeout as sleep } from 'timers/promises';

const root = path.resolve(__dirname, '..');
const API_DIR = path.join(root, 'poster-generator', 'api');
const JOBS_DIR = path.join(API_DIR, 'jobs');
const MAIN_PY = path.join(API_DIR, 'main.py');
const PORT = parseInt(process.env.PORT || '8002');
const BASE_URL = `http://localhost:${PORT}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function rmRF(dir: string): Promise<void> {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
}

async function axiosGet(path: string) {
  const { default: axios } = await import('axios');
  return axios.get(`${BASE_URL}${path}`, { timeout: 5000 });
}

async function axiosPost(path: string, data: unknown) {
  const { default: axios } = await import('axios');
  return axios.post(`${BASE_URL}${path}`, data, { timeout: 5000 });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('E2-US2: POST /generate Endpoint', () => {
  let serverProcess: ChildProcess | null = null;

  beforeAll(async () => {
    // Clean up jobs dir before tests
    await rmRF(JOBS_DIR);

    // Start the FastAPI server
    serverProcess = spawn(
      'python',
      ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', String(PORT)],
      { cwd: API_DIR, stdio: 'pipe' }
    );

    // Wait for server to be ready
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 6000);
      serverProcess!.stdout!.on('data', (data: Buffer) => {
        if (data.toString().includes('Uvicorn running')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProcess!.stderr!.on('data', (data: Buffer) => {
        // Capture startup errors
        console.error('[server stderr]', data.toString());
      });
    });

    // Extra safety pause
    await sleep(1000);
  });

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
    }
    await rmRF(JOBS_DIR);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('POST /generate — success', () => {
    it('test_returns_202_with_job_id', async () => {
      const response = await axiosPost('/generate', {
        city: 'Warsaw',
        country: 'Poland',
        theme: 'midnight_blue',
        customer_email: 'user@example.com',
      });

      expect(response.status).toBe(202);
      expect(response.data).toHaveProperty('job_id');
      expect(typeof response.data.job_id).toBe('string');
      expect(response.data.job_id.length).toBeGreaterThan(0);
    });

    it('test_job_status_file_created', async () => {
      const response = await axiosPost('/generate', {
        city: 'Berlin',
        country: 'Germany',
        theme: 'vintage',
        customer_email: 'berlin@example.com',
      });

      const jobId: string = response.data.job_id;
      const jobFile = path.join(JOBS_DIR, `${jobId}.json`);

      // Check file exists immediately (before background task overwrites it)
      expect(fs.existsSync(jobFile), `Job file ${jobFile} should be created`).toBe(true);

      // Check initial job data — status should be 'running' initially
      // Note: background task may have already updated it to 'failed' if script is missing
      const jobData = JSON.parse(fs.readFileSync(jobFile, 'utf-8'));
      expect(jobData).toHaveProperty('job_id', jobId);
      expect(jobData).toHaveProperty('city', 'Berlin');
      expect(jobData).toHaveProperty('theme', 'vintage');
      expect(jobData).toHaveProperty('customer_email', 'berlin@example.com');
      expect(jobData).toHaveProperty('started_at');
    });

    it('test_response_is_immediate_not_blocking', async () => {
      const start = Date.now();
      const response = await axiosPost('/generate', {
        city: 'Paris',
        country: 'France',
        theme: 'midnight_blue',
        customer_email: 'paris@example.com',
      });
      const elapsed = Date.now() - start;

      expect(response.status).toBe(202);
      // Should respond in under 2 seconds — if it blocks on subprocess it would take much longer
      expect(elapsed).toBeLessThan(2000);
    });
  });

  // -------------------------------------------------------------------------
  // Validation — missing fields
  // -------------------------------------------------------------------------

  describe('POST /generate — validation (400 errors)', () => {
    it('test_missing_city_returns_400', async () => {
      let err: unknown;
      try {
        await axiosPost('/generate', {
          country: 'Poland',
          theme: 'midnight_blue',
          customer_email: 'user@example.com',
        });
      } catch (e: unknown) {
        err = e;
      }
      const e = err as { response?: { status?: number } };
      // FastAPI returns 422 for Pydantic validation errors
      expect(e?.response?.status).toBeGreaterThanOrEqual(400);
      expect(e?.response?.status).toBeLessThan(500);
    });

    it('test_missing_country_returns_400', async () => {
      let err: unknown;
      try {
        await axiosPost('/generate', {
          city: 'Warsaw',
          theme: 'midnight_blue',
          customer_email: 'user@example.com',
        });
      } catch (e: unknown) {
        err = e;
      }
      const e = err as { response?: { status?: number } };
      expect(e?.response?.status).toBeGreaterThanOrEqual(400);
      expect(e?.response?.status).toBeLessThan(500);
    });

    it('test_missing_theme_returns_400', async () => {
      let err: unknown;
      try {
        await axiosPost('/generate', {
          city: 'Warsaw',
          country: 'Poland',
          customer_email: 'user@example.com',
        });
      } catch (e: unknown) {
        err = e;
      }
      const e = err as { response?: { status?: number } };
      expect(e?.response?.status).toBeGreaterThanOrEqual(400);
      expect(e?.response?.status).toBeLessThan(500);
    });

    it('test_empty_body_returns_400', async () => {
      let err: unknown;
      try {
        await axiosPost('/generate', {});
      } catch (e: unknown) {
        err = e;
      }
      const e = err as { response?: { status?: number } };
      expect(e?.response?.status).toBeGreaterThanOrEqual(400);
      expect(e?.response?.status).toBeLessThan(500);
    });
  });

  // -------------------------------------------------------------------------
  // Theme validation
  // -------------------------------------------------------------------------

  describe('POST /generate — theme validation', () => {
    it('test_invalid_theme_returns_400', async () => {
      let err: unknown;
      try {
        await axiosPost('/generate', {
          city: 'Warsaw',
          country: 'Poland',
          theme: 'nonexistent_theme',
          customer_email: 'user@example.com',
        });
      } catch (e: unknown) {
        err = e;
      }
      const e = err as { response?: { status?: number } };
      expect(e?.response?.status).toBe(400);
    });

    it('test_allowed_themes_accepted', async () => {
      // This is a smoke test — just verify each allowed theme doesn't 400
      const allowedThemes = ['midnight_blue', 'vintage', 'sepia', 'watercolor', 'dark'];
      for (const theme of allowedThemes) {
        const response = await axiosPost('/generate', {
          city: 'TestCity',
          country: 'TestCountry',
          theme,
          customer_email: 'test@example.com',
        });
        expect(response.status).toBe(202);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Health check still works
  // -------------------------------------------------------------------------

  describe('GET /health', () => {
    it('test_health_endpoint_still_works', async () => {
      const response = await axiosGet('/health');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'ok');
    });
  });
});
