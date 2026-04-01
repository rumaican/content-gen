/**
 * __tests__/ffmpeg.test.ts
 * TDD: verify FFmpeg is available on PATH.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';

describe('ffmpeg', () => {
  it('test_ffmpeg_version_returns', () => {
    let version: string;
    try {
      version = execSync('ffmpeg -version', { timeout: 10000, encoding: 'utf-8' });
    } catch (err) {
      throw new Error(`FFmpeg not found on PATH or returned non-zero exit.`);
    }
    expect(version).toContain('ffmpeg');
  });
});
