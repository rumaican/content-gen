/**
 * twentyCrm.test.ts — Unit tests for Twenty CRM pipeline fields integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers — used by all tests
// ---------------------------------------------------------------------------

function makeCompany(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'comp_test_001',
    name: 'Test Company Ltd',
    domainName: 'testcompany.com',
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test environment — set in beforeEach, used by all tests
// ---------------------------------------------------------------------------

const TEST_API_KEY = 'test-api-key';
const TEST_BASE_URL = 'http://localhost:3000';

beforeEach(() => {
  // Ensure env vars are set before any test runs
  process.env.TWENTY_CRM_API_KEY = TEST_API_KEY;
  process.env.TWENTY_CRM_BASE_URL = TEST_BASE_URL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Import after env setup
// ---------------------------------------------------------------------------

import {
  ensurePipelineCustomFields,
  getCompanyCustomFields,
  createCompanyCustomField,
  updateCompanyPipelineFields,
  writeIcpScoreAndTrack,
  updateSequenceStage,
  suppressCompany,
  populateDefaultPipelineFields,
  type PipelineFields,
} from '../../src/lib/twentyCrm.js';

// ---------------------------------------------------------------------------
// getCompanyCustomFields
// ---------------------------------------------------------------------------

describe('getCompanyCustomFields', () => {
  it('returns_customFields_array_from_API', async () => {
    const fields = [
      { id: 'f1', name: 'icp_score', type: 'number' },
      { id: 'f2', name: 'track', type: 'select' },
    ];

    const mockGet = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ customFields: fields }),
    });
    vi.stubGlobal('fetch', mockGet);

    const result = await getCompanyCustomFields();

    expect(result).toEqual(fields);
    expect(mockGet).toHaveBeenCalledWith(
      'http://localhost:3000/api/metadata/objects/company/custom-fields',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-api-key' }) })
    );
  });

  it('throws_when_API_returns_error', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });
    vi.stubGlobal('fetch', mockGet);

    await expect(getCompanyCustomFields()).rejects.toThrow(
      'getCompanyCustomFields failed: 401'
    );
  });
});

// ---------------------------------------------------------------------------
// createCompanyCustomField
// ---------------------------------------------------------------------------

describe('createCompanyCustomField', () => {
  it('posts_field_definition_to_API', async () => {
    const mockPost = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new_field_1', name: 'icp_score', type: 'number' }),
    });
    vi.stubGlobal('fetch', mockPost);

    await createCompanyCustomField({ name: 'icp_score', type: 'number' });

    expect(mockPost).toHaveBeenCalledWith(
      'http://localhost:3000/api/metadata/objects/company/custom-fields',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'icp_score', type: 'number', object: 'company' }),
        headers: expect.objectContaining({ Authorization: 'Bearer test-api-key' }),
      })
    );
  });
});

// ---------------------------------------------------------------------------
// ensurePipelineCustomFields
// ---------------------------------------------------------------------------

describe('ensurePipelineCustomFields', () => {
  it('creates_only_missing_fields_when_some_already_exist', async () => {
    // GET returns: icp_score already exists
    const mockGet = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        customFields: [{ id: 'f1', name: 'icp_score', type: 'number' }],
      }),
    });

    // 6 POSTs for remaining fields
    const mockPost = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new_field' }),
    });

    vi.stubGlobal('fetch', (url: string, options?: { method?: string }) => {
      if (options?.method === 'POST') return mockPost(url, options);
      return mockGet(url, options);
    });

    const result = await ensurePipelineCustomFields();

    expect(result.created).toBe(6);
    expect(result.skipped).toBe(1);
    // 1 GET + 6 POSTs
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledTimes(6);
  });

  it('skips_all_fields_when_all_already_exist', async () => {
    const allFieldNames = [
      'icp_score', 'track', 'current_sequence_stage',
      'suppression_status', 'suppression_reason',
      'local_timezone', 'sequence_version',
    ];

    const mockGet = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        customFields: allFieldNames.map((name, i) => ({ id: `f${i}`, name, type: 'text' })),
      }),
    });
    vi.stubGlobal('fetch', mockGet);

    const result = await ensurePipelineCustomFields();

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(7);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('creates_all_fields_when_none_exist', async () => {
    const mockGet = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ customFields: [] }),
    });
    const mockPost = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new_field' }),
    });
    vi.stubGlobal('fetch', (url: string, options?: { method?: string }) => {
      if (options?.method === 'POST') return mockPost(url, options);
      return mockGet(url, options);
    });

    const result = await ensurePipelineCustomFields();

    expect(result.created).toBe(7);
    expect(result.skipped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// updateCompanyPipelineFields
// ---------------------------------------------------------------------------

describe('updateCompanyPipelineFields', () => {
  it('patches_company_with_pipeline_fields', async () => {
    const mockPatch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeCompany({ icp_score: 8, track: 'Strategic' }),
    });
    vi.stubGlobal('fetch', mockPatch);

    const result = await updateCompanyPipelineFields('comp_test_001', {
      icp_score: 8,
      track: 'Strategic',
    });

    expect(result.icp_score).toBe(8);
    expect(result.track).toBe('Strategic');
    expect(mockPatch).toHaveBeenCalledWith(
      'http://localhost:3000/api/companies/comp_test_001',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ icp_score: 8, track: 'Strategic' }),
      })
    );
  });

  it('maps_all_pipeline_field_types_correctly', async () => {
    const fields: PipelineFields = {
      icp_score: 7,
      track: 'Pipeline',
      current_sequence_stage: 'S2',
      suppression_status: 'Active',
      suppression_reason: 'manual',
      local_timezone: 'Africa/Lagos',
      sequence_version: 'v2',
    };

    const mockPatch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeCompany(fields as Record<string, unknown>),
    });
    vi.stubGlobal('fetch', mockPatch);

    await updateCompanyPipelineFields('comp_test_001', fields);

    const callBody = JSON.parse(mockPatch.mock.calls[0][1].body as string);
    expect(callBody.icp_score).toBe(7);
    expect(callBody.track).toBe('Pipeline');
    expect(callBody.current_sequence_stage).toBe('S2');
    expect(callBody.suppression_status).toBe('Active');
    expect(callBody.suppression_reason).toBe('manual');
    expect(callBody.local_timezone).toBe('Africa/Lagos');
    expect(callBody.sequence_version).toBe('v2');
  });

  it('throws_when_patch_fails', async () => {
    const mockPatch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });
    vi.stubGlobal('fetch', mockPatch);

    await expect(
      updateCompanyPipelineFields('comp_bad_id', { track: 'Pipeline' })
    ).rejects.toThrow('updateCompanyPipelineFields failed: 404');
  });

  it('ignores_undefined_fields', async () => {
    const mockPatch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeCompany(),
    });
    vi.stubGlobal('fetch', mockPatch);

    await updateCompanyPipelineFields('comp_test_001', {
      icp_score: undefined,
      track: undefined,
    });

    const callBody = JSON.parse(mockPatch.mock.calls[0][1].body as string);
    expect(callBody).not.toHaveProperty('icp_score');
    expect(callBody).not.toHaveProperty('track');
  });
});

// ---------------------------------------------------------------------------
// writeIcpScoreAndTrack
// ---------------------------------------------------------------------------

describe('writeIcpScoreAndTrack', () => {
  it('writes_icp_score_and_track_to_company', async () => {
    const mockPatch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeCompany({ icp_score: 9, track: 'Strategic' }),
    });
    vi.stubGlobal('fetch', mockPatch);

    const result = await writeIcpScoreAndTrack('comp_test_001', 9, 'Strategic');

    expect(result.icp_score).toBe(9);
    expect(result.track).toBe('Strategic');
  });
});

// ---------------------------------------------------------------------------
// updateSequenceStage
// ---------------------------------------------------------------------------

describe('updateSequenceStage', () => {
  it('updates_stage_to_S1', async () => {
    const mockPatch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeCompany({ current_sequence_stage: 'S1' }),
    });
    vi.stubGlobal('fetch', mockPatch);

    const result = await updateSequenceStage('comp_test_001', 'S1');
    expect(result.current_sequence_stage).toBe('S1');
  });

  it('updates_stage_to_replied', async () => {
    const mockPatch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeCompany({ current_sequence_stage: 'replied' }),
    });
    vi.stubGlobal('fetch', mockPatch);

    const result = await updateSequenceStage('comp_test_001', 'replied');
    expect(result.current_sequence_stage).toBe('replied');
  });

  it('updates_stage_to_bounced', async () => {
    const mockPatch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeCompany({ current_sequence_stage: 'bounced' }),
    });
    vi.stubGlobal('fetch', mockPatch);

    const result = await updateSequenceStage('comp_test_001', 'bounced');
    expect(result.current_sequence_stage).toBe('bounced');
  });
});

// ---------------------------------------------------------------------------
// suppressCompany
// ---------------------------------------------------------------------------

describe('suppressCompany', () => {
  it('sets_suppression_status_to_Suppressed_with_reason_bounce', async () => {
    const mockPatch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeCompany({ suppression_status: 'Suppressed', suppression_reason: 'bounce' }),
    });
    vi.stubGlobal('fetch', mockPatch);

    const result = await suppressCompany('comp_test_001', 'bounce');
    expect(result.suppression_status).toBe('Suppressed');
    expect(result.suppression_reason).toBe('bounce');
  });

  it('sets_suppression_reason_to_OOTO', async () => {
    const mockPatch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeCompany({ suppression_status: 'Suppressed', suppression_reason: 'OOTO' }),
    });
    vi.stubGlobal('fetch', mockPatch);

    const result = await suppressCompany('comp_test_001', 'OOTO');
    expect(result.suppression_reason).toBe('OOTO');
  });

  it('sets_suppression_reason_to_STOP', async () => {
    const mockPatch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeCompany({ suppression_status: 'Suppressed', suppression_reason: 'STOP' }),
    });
    vi.stubGlobal('fetch', mockPatch);

    const result = await suppressCompany('comp_test_001', 'STOP');
    expect(result.suppression_reason).toBe('STOP');
  });
});

// ---------------------------------------------------------------------------
// populateDefaultPipelineFields
// ---------------------------------------------------------------------------

describe('populateDefaultPipelineFields', () => {
  it('updates_companies_without_track_to_Pipeline', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // GET — list companies
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              makeCompany({ id: 'c1', track: undefined }),
              makeCompany({ id: 'c2', track: undefined }),
            ],
            pageInfo: { hasNextPage: false },
          }),
        });
      } else {
        // PATCH
        return Promise.resolve({
          ok: true,
          json: async () => makeCompany({ track: 'Pipeline' }),
        });
      }
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await populateDefaultPipelineFields();

    expect(result.updated).toBe(2);
    expect(result.errors).toBe(0);
  });

  it('skips_companies_that_already_have_track', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              makeCompany({ id: 'c1', track: 'Strategic' }),
              makeCompany({ id: 'c2', track: 'Pipeline' }),
            ],
            pageInfo: { hasNextPage: false },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await populateDefaultPipelineFields();

    expect(result.updated).toBe(0);
    expect(result.errors).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1); // only GET, no PATCHes
  });

  it('counts_errors_and_continues', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [
              makeCompany({ id: 'c1', track: undefined }),
              makeCompany({ id: 'c2', track: undefined }),
            ],
            pageInfo: { hasNextPage: false },
          }),
        });
      } else if (callCount === 2) {
        return Promise.resolve({
          ok: true,
          json: async () => makeCompany({ track: 'Pipeline' }),
        });
      } else {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error',
        });
      }
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await populateDefaultPipelineFields();

    expect(result.updated).toBe(1);
    expect(result.errors).toBe(1);
  });

  it('calls_onProgress_callback_with_running_count', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: [makeCompany({ id: 'c1', track: undefined })],
            pageInfo: { hasNextPage: false },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => makeCompany({ track: 'Pipeline' }),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const progressValues: number[] = [];
    await populateDefaultPipelineFields((count) => progressValues.push(count));

    expect(progressValues).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// Environment variable guard
// ---------------------------------------------------------------------------

describe('environment', () => {
  it('throws_when_TWENTY_CRM_API_KEY_not_set', async () => {
    // Temporarily unset the env var
    const saved = process.env.TWENTY_CRM_API_KEY;
    delete process.env.TWENTY_CRM_API_KEY;

    const mockGet = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ customFields: [] }),
    });
    vi.stubGlobal('fetch', mockGet);

    await expect(getCompanyCustomFields()).rejects.toThrow(
      'TWENTY_CRM_API_KEY environment variable is not set'
    );

    // Restore
    process.env.TWENTY_CRM_API_KEY = saved;
  });
});
