/**
 * Twenty CRM integration — pipeline fields for SDR tracking.
 *
 * API base: http://192.168.0.154:3000
 * Auth: Bearer token (TWENTY_CRM_API_KEY)
 *
 * Custom fields added to Company object:
 *   icp_score          — number (1-10)
 *   track              — select: Strategic | Pipeline | Archive
 *   current_sequence_stage — select: S1 | S2 | S3 | replied | bounced | escalated
 *   suppression_status — select: Active | Suppressed | Cleared
 *   suppression_reason — text
 *   local_timezone     — text (e.g. Africa/Lagos)
 *   sequence_version    — text (e.g. v1)
 */

import { pipelineConfig } from '../config/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineFields {
  icp_score?: number | null;
  track?: 'Strategic' | 'Pipeline' | 'Archive' | null;
  current_sequence_stage?:
    | 'S1'
    | 'S2'
    | 'S3'
    | 'replied'
    | 'bounced'
    | 'escalated'
    | null;
  suppression_status?: 'Active' | 'Suppressed' | 'Cleared' | null;
  suppression_reason?: string | null;
  local_timezone?: string | null;
  sequence_version?: string | null;
}

export interface CompanyResponse {
  id: string;
  name: string;
  domainName?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TWENTY_CRM_BASE = process.env.TWENTY_CRM_BASE_URL || 'http://192.168.0.154:3000';

function apiHeaders() {
  const apiKey = process.env.TWENTY_CRM_API_KEY;
  if (!apiKey) throw new Error('TWENTY_CRM_API_KEY environment variable is not set');
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function apiUrl(path: string) {
  const base = process.env.TWENTY_CRM_BASE_URL || 'http://192.168.0.154:3000';
  return `${base}/api${path}`;
}

// ---------------------------------------------------------------------------
// Custom Field definitions (metadata)
// ---------------------------------------------------------------------------

interface FieldOption {
  label: string;
  color?: string;
}

interface CustomFieldDefinition {
  name: string;
  type: 'select' | 'number' | 'text';
  options?: FieldOption[];
  description?: string;
}

const PIPELINE_CUSTOM_FIELDS: CustomFieldDefinition[] = [
  {
    name: 'icp_score',
    type: 'number',
    description: 'ICP fit score from enrichment (1-10)',
  },
  {
    name: 'track',
    type: 'select',
    options: [
      { label: 'Strategic' },
      { label: 'Pipeline' },
      { label: 'Archive' },
    ],
    description: 'Lead track',
  },
  {
    name: 'current_sequence_stage',
    type: 'select',
    options: [
      { label: 'S1' },
      { label: 'S2' },
      { label: 'S3' },
      { label: 'replied' },
      { label: 'bounced' },
      { label: 'escalated' },
    ],
    description: 'Current sequence stage',
  },
  {
    name: 'suppression_status',
    type: 'select',
    options: [
      { label: 'Active' },
      { label: 'Suppressed' },
      { label: 'Cleared' },
    ],
    description: 'Suppression status',
  },
  {
    name: 'suppression_reason',
    type: 'text',
    description: 'Reason for suppression: bounce | OOTO | STOP | manual',
  },
  {
    name: 'local_timezone',
    type: 'text',
    description: 'Company local timezone (e.g. Africa/Lagos)',
  },
  {
    name: 'sequence_version',
    type: 'text',
    description: 'Sequence version tag (e.g. v1)',
  },
];

// ---------------------------------------------------------------------------
// Metadata helpers
// ---------------------------------------------------------------------------

/**
 * Get existing custom fields for the Company object.
 */
export async function getCompanyCustomFields(): Promise<unknown[]> {
  const res = await fetch(apiUrl('/metadata/objects/company/custom-fields'), {
    headers: apiHeaders(),
  });
  if (!res.ok) {
    throw new Error(`getCompanyCustomFields failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { customFields: unknown[] };
  return data.customFields ?? [];
}

/**
 * Create a custom field on the Company object.
 * Returns the created field definition.
 */
export async function createCompanyCustomField(
  field: CustomFieldDefinition
): Promise<unknown> {
  const res = await fetch(apiUrl('/metadata/objects/company/custom-fields'), {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ ...field, object: 'company' }),
  });
  if (!res.ok) {
    throw new Error(`createCompanyCustomField failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Ensure all pipeline custom fields exist on Company object.
 * Idempotent — skips fields that already exist.
 */
export async function ensurePipelineCustomFields(): Promise<{ created: number; skipped: number }> {
  const existing = await getCompanyCustomFields();
  const existingNames = new Set(
    (existing as { name: string }[]).map((f) => f.name)
  );

  let created = 0;
  let skipped = 0;
  for (const field of PIPELINE_CUSTOM_FIELDS) {
    if (existingNames.has(field.name)) {
      skipped++;
      continue;
    }
    await createCompanyCustomField(field);
    created++;
  }
  return { created, skipped };
}

// ---------------------------------------------------------------------------
// Company CRUD with pipeline fields
// ---------------------------------------------------------------------------

/**
 * List all companies with optional pagination.
 */
export async function listCompanies(
  pageSize = 100,
  pageToken?: string
): Promise<{ companies: CompanyResponse[]; nextPageToken?: string }> {
  let url = apiUrl(`/companies?limit=${pageSize}`);
  if (pageToken) url += `&cursor=${pageToken}`;

  const res = await fetch(url, { headers: apiHeaders() });
  if (!res.ok) {
    throw new Error(`listCompanies failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    data: CompanyResponse[];
    pageInfo?: { hasNextPage: boolean; startCursor?: string };
  };
  return {
    companies: data.data ?? [],
    nextPageToken: data.pageInfo?.hasNextPage
      ? (data.pageInfo.startCursor as string)
      : undefined,
  };
}

/**
 * Update pipeline fields on a company.
 */
export async function updateCompanyPipelineFields(
  companyId: string,
  fields: PipelineFields
): Promise<CompanyResponse> {
  // Map camelCase → snake_case for the API
  const apiFields: Record<string, unknown> = {};
  if (fields.icp_score !== undefined)
    apiFields.icp_score = fields.icp_score;
  if (fields.track !== undefined)
    apiFields.track = fields.track;
  if (fields.current_sequence_stage !== undefined)
    apiFields.current_sequence_stage = fields.current_sequence_stage;
  if (fields.suppression_status !== undefined)
    apiFields.suppression_status = fields.suppression_status;
  if (fields.suppression_reason !== undefined)
    apiFields.suppression_reason = fields.suppression_reason;
  if (fields.local_timezone !== undefined)
    apiFields.local_timezone = fields.local_timezone;
  if (fields.sequence_version !== undefined)
    apiFields.sequence_version = fields.sequence_version;

  const res = await fetch(apiUrl(`/companies/${companyId}`), {
    method: 'PATCH',
    headers: apiHeaders(),
    body: JSON.stringify({ ...apiFields }),
  });
  if (!res.ok) {
    throw new Error(`updateCompanyPipelineFields failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<CompanyResponse>;
}

/**
 * Update all existing companies with default pipeline field values.
 * Sensible defaults: track=Pipeline, suppression_status=Active,
 * current_sequence_stage=null (unset).
 */
export async function populateDefaultPipelineFields(
  onProgress?: (count: number) => void
): Promise<{ updated: number; errors: number }> {
  let updated = 0;
  let errors = 0;
  let pageToken: string | undefined;

  do {
    const { companies, nextPageToken } = await listCompanies(100, pageToken);
    pageToken = nextPageToken;

    for (const company of companies) {
      // Only update companies that don't already have track set
      if (company.track !== undefined) continue;

      try {
        await updateCompanyPipelineFields(company.id, {
          track: 'Pipeline',
          suppression_status: 'Active',
        });
        updated++;
        onProgress?.(updated);
      } catch {
        errors++;
      }
    }
  } while (pageToken);

  return { updated, errors };
}

// ---------------------------------------------------------------------------
// Convenience helpers used by other agents
// ---------------------------------------------------------------------------

/**
 * Write ICP score and track from enrichment result.
 * Called by the enrichment agent after scoring a new lead.
 */
export async function writeIcpScoreAndTrack(
  companyId: string,
  icpScore: number,
  track: 'Strategic' | 'Pipeline' | 'Archive'
): Promise<CompanyResponse> {
  return updateCompanyPipelineFields(companyId, {
    icp_score: icpScore,
    track,
  });
}

/**
 * Update current sequence stage. Called by reply triage or send tracker.
 */
export async function updateSequenceStage(
  companyId: string,
  stage: NonNullable<PipelineFields['current_sequence_stage']>
): Promise<CompanyResponse> {
  return updateCompanyPipelineFields(companyId, {
    current_sequence_stage: stage,
  });
}

/**
 * Add a company to suppression list.
 */
export async function suppressCompany(
  companyId: string,
  reason: 'bounce' | 'OOTO' | 'STOP' | 'manual'
): Promise<CompanyResponse> {
  return updateCompanyPipelineFields(companyId, {
    suppression_status: 'Suppressed',
    suppression_reason: reason,
  });
}
