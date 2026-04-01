/**
 * __tests__/config.test.ts
 * TDD: verify config module loads and exports correct keys.
 */

import { describe, it, expect } from 'vitest';
import { pipelineConfig } from '../src/config/index.js';

describe('pipelineConfig', () => {
  it('test_config_loads_env_variables', () => {
    // Only check keys that actually exist in pipelineConfig
    const keys = [
      'downloadDir',
      'outputDir',
      'maxConcurrent',
      'ytDlpPath',
      'YTDLP_PATH',
      'AIRTABLE_BASE_ID',
      'AIRTABLE_API_KEY',
    ];

    for (const key of keys) {
      expect(key in pipelineConfig, `Key ${key} should exist in pipelineConfig`).toBe(true);
    }
  });

  it('test_config_has_defaults_for_optional_vars', () => {
    // Optional vars may be empty strings, check they are defined (string or number)
    expect(typeof pipelineConfig.downloadDir).toBe('string');
    expect(typeof pipelineConfig.outputDir).toBe('string');
    expect(typeof pipelineConfig.maxConcurrent).toBe('number');
  });
});
