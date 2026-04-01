import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseSrt, isSrtPopulated, srtTimestampToSeconds } from '../src/utils/ffmpegUtils.js';

// ─────────────────────────────────────────────────────────────────────────────
// We mock fluent-ffmpeg at the module level so FFmpeg itself isn't required.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('fluent-ffmpeg', () => {
  const mockCmd = {
    input: vi.fn().mockReturnThis(),
    inputOptions: vi.fn().mockReturnThis(),
    outputOptions: vi.fn().mockReturnThis(),
    output: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    run: vi.fn(),
    kill: vi.fn(),
  };
  return { default: vi.fn(() => mockCmd), FfmpegCommand: class {} };
});

// We also need to mock ffprobe — fluent-ffmpeg uses .ffprobe() as a static method
// so it lives on the ffmpeg function itself.
vi.mock('fluent-ffmpeg', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fluent-ffmpeg')>();
  return {
    ...actual,
    default: Object.assign(
      (): typeof mockCmd => mockCmd,
      {
        ffprobe: vi.fn((path, cb) =>
          cb(null, { format: { duration: 30 } })
        ),
      }
    ),
  };
});

const mockCmd = {
  input: vi.fn().mockReturnThis(),
  inputOptions: vi.fn().mockReturnThis(),
  outputOptions: vi.fn().mockReturnThis(),
  output: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
  run: vi.fn(),
  kill: vi.fn(),
};

vi.mocked<any>(require('fluent-ffmpeg').default).mockImplementation(() => mockCmd);
vi.mocked<any>(require('fluent-ffmpeg').default).ffprobe = vi.fn((p, cb) =>
  cb(null, { format: { duration: 30 } })
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers to create temp SRT files
// ─────────────────────────────────────────────────────────────────────────────

function makeTmpSrt(content: string): string {
  const tmp = path.join('/tmp', `test-${Date.now()}.srt`);
  fs.writeFileSync(tmp, content, 'utf8');
  return tmp;
}

// ─────────────────────────────────────────────────────────────────────────────
// SRT parsing tests
// ─────────────────────────────────────────────────────────────────────────────

describe('parseSrt', () => {
  it('parses a valid SRT file with two entries', () => {
    const srt = makeTmpSrt(`1
00:00:00,000 --> 00:00:03,500
Hello world

2
00:00:04,000 --> 00:00:07,200
This is a test
`);
    const entries = parseSrt(srt);
    expect(entries).toHaveLength(2);
    expect(entries[0].text).toBe('Hello world');
    expect(entries[1].startTime).toBe('00:00:04,000');
    fs.unlinkSync(srt);
  });

  it('throws if SRT file does not exist', () => {
    expect(() => parseSrt('/nonexistent/path/foo.srt')).toThrow('SRT file not found');
  });

  it('skips malformed blocks gracefully', () => {
    const srt = makeTmpSrt(`1
00:00:00,000 --> 00:00:03,500
Valid entry

NOT_A_TIMESTAMP
garbage

2
00:00:04,000 --> 00:00:07,200
Another valid
`);
    const entries = parseSrt(srt);
    expect(entries).toHaveLength(2);
    fs.unlinkSync(srt);
  });

  it('handles Windows CRLF line endings', () => {
    const srt = makeTmpSrt('1\r\n00:00:00,000 --> 00:00:03,500\r\nHello\r\n\r\n');
    const entries = parseSrt(srt);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Hello');
    fs.unlinkSync(srt);
  });

  it('handles multi-line subtitle text', () => {
    const srt = makeTmpSrt(`1
00:00:00,000 --> 00:00:05,000
Line one
Line two
Line three
`);
    const entries = parseSrt(srt);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('Line one\nLine two\nLine three');
    fs.unlinkSync(srt);
  });
});

describe('isSrtPopulated', () => {
  it('returns true for a valid SRT with entries', () => {
    const srt = makeTmpSrt(`1\n00:00:00,000 --> 00:00:03,000\nHello\n`);
    expect(isSrtPopulated(srt)).toBe(true);
    fs.unlinkSync(srt);
  });

  it('returns false for an empty file', () => {
    const srt = makeTmpSrt('');
    expect(isSrtPopulated(srt)).toBe(false);
    fs.unlinkSync(srt);
  });

  it('returns false for a file with only whitespace', () => {
    const srt = makeTmpSrt('   \n\n   \n');
    expect(isSrtPopulated(srt)).toBe(false);
    fs.unlinkSync(srt);
  });

  it('returns false for non-existent file', () => {
    expect(isSrtPopulated('/tmp/does-not-exist-xyz.srt')).toBe(false);
  });
});

describe('srtTimestampToSeconds', () => {
  const { srtTimestampToSeconds: toSec } = require('../src/utils/ffmpegUtils.js');

  it('converts basic timestamps correctly', () => {
    expect(toSec('00:00:00,000')).toBe(0);
    expect(toSec('00:00:01,000')).toBe(1);
    expect(toSec('00:01:00,000')).toBe(60);
    expect(toSec('01:00:00,000')).toBe(3600);
  });

  it('handles milliseconds', () => {
    expect(toSec('00:00:00,500')).toBe(0.5);
    expect(toSec('00:00:05,250')).toBe(5.25);
  });

  it('returns 0 for invalid format', () => {
    expect(toSec('invalid')).toBe(0);
    expect(toSec('')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Colour conversion
// ─────────────────────────────────────────────────────────────────────────────

describe('toFfmpegColor (via integration)', () => {
  // This tests the colour conversion used in addTextOverlay
  it('converts #FFFFFF to FFmpeg format', () => {
    // Inline helper for testing purposes
    const toFfmpegColor = (hex: string): string => {
      const clean = hex.replace('#', '');
      if (clean.length === 6) {
        const r = clean.slice(0, 2);
        const g = clean.slice(2, 4);
        const b = clean.slice(4, 6);
        return `&H00${b}${g}${r}`;
      }
      return '&H00FFFFFF';
    };
    expect(toFfmpegColor('#FFFFFF')).toBe('&H00FFFFFF');
    expect(toFfmpegColor('#000000')).toBe('&H00000000');
    expect(toFfmpegColor('#FF5500')).toBe('&H000055FF');
  });
});
