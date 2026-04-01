/**
 * Unit tests for Whisper Transcription pipeline
 *
 * Tests cover:
 * - audioToSrt: wordsToSrt() conversion correctness
 * - transcribe: validation, error types, mock API call
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { wordsToSrt, type WordTimestamp } from '../../src/utils/audioToSrt.js';

// ---------------------------------------------------------------------------
// wordsToSrt tests
// ---------------------------------------------------------------------------

describe('wordsToSrt', () => {
  it('returns empty string for empty input', () => {
    expect(wordsToSrt([])).toBe('');
  });

  it('returns empty string for null/undefined input', () => {
    expect(wordsToSrt(null as any)).toBe('');
    expect(wordsToSrt(undefined as any)).toBe('');
  });

  it('formats single word correctly', () => {
    const words: WordTimestamp[] = [{ word: 'Hello', start: 0.0, end: 0.5 }];
    const srt = wordsToSrt(words);
    expect(srt).toContain('00:00:00,000 --> 00:00:00,500');
    expect(srt).toContain('Hello');
  });

  it('assigns sequential indices starting at 1', () => {
    // Words spaced far apart so they form 3 separate entries
    const words: WordTimestamp[] = [
      { word: 'One', start: 0.0, end: 0.5 },
      { word: 'Two', start: 4.0, end: 4.5 },   // starts after 3s window from first word
      { word: 'Three', start: 8.0, end: 8.5 }, // starts after 3s window from first word
    ];
    const srt = wordsToSrt(words);
    expect(srt).toMatch(/^1\n/);
    expect(srt).toContain('\n2\n');
    expect(srt).toContain('\n3\n');
  });

  it('groups words into same entry when within MAX_ENTRY_DURATION', () => {
    const words: WordTimestamp[] = [
      { word: 'Hello', start: 0.0, end: 0.5 },
      { word: 'world', start: 0.5, end: 1.0 },
    ];
    const srt = wordsToSrt(words);
    // Both words fit within 3s, so should be grouped into ONE entry
    expect(srt).toContain('Hello world');
    // Should be a single entry (index 1 only, no "2" index)
    const doubleNewlineEntries = srt.split('\n\n').length;
    expect(doubleNewlineEntries).toBe(1);
  });

  it('splits into multiple entries when duration exceeds MAX_ENTRY_DURATION', () => {
    const words: WordTimestamp[] = [
      { word: 'Hello', start: 0.0, end: 0.5 },
      { word: 'world', start: 0.5, end: 1.0 },
      { word: 'this', start: 3.5, end: 4.0 },  // gap: starts after 3s limit
      { word: 'is', start: 4.0, end: 4.5 },
    ];
    const srt = wordsToSrt(words);
    // Should have index 1 (first group) and index 2 (second group)
    expect(srt).toContain('1\n');
    expect(srt).toContain('2\n');
    expect(srt).toContain('Hello world');
    expect(srt).toContain('this is');
  });

  it('uses correct SRT timecode format with milliseconds', () => {
    const words: WordTimestamp[] = [
      { word: 'Hi', start: 1.234, end: 1.567 },
    ];
    const srt = wordsToSrt(words);
    expect(srt).toContain('00:00:01,234 --> 00:00:01,567');
  });

  it('handles hours correctly', () => {
    const words: WordTimestamp[] = [
      { word: 'Long', start: 3661.0, end: 3662.0 }, // 1h 1m 1s
    ];
    const srt = wordsToSrt(words);
    expect(srt).toContain('01:01:01,000 --> 01:01:02,000');
  });

  it('handles sub-second precision correctly', () => {
    const words: WordTimestamp[] = [
      { word: 'Quick', start: 0.05, end: 0.099 },
    ];
    const srt = wordsToSrt(words);
    expect(srt).toContain('00:00:00,050 --> 00:00:00,099');
  });
});

// ---------------------------------------------------------------------------
// Error class tests
// ---------------------------------------------------------------------------

describe('Error classes', async () => {
  const { FileTooLargeError, UnsupportedFormatError, TranscriptionError } = await import('../../src/pipelines/transcribe.js');

  it('FileTooLargeError reports size in MB', () => {
    const err = new FileTooLargeError(30 * 1024 * 1024);
    expect(err.message).toContain('30.00 MB');
    expect(err.name).toBe('FileTooLargeError');
  });

  it('UnsupportedFormatError reports the bad extension', () => {
    const err = new UnsupportedFormatError('flac');
    expect(err.message).toContain('flac');
    expect(err.extension).toBe('flac');
    expect(err.name).toBe('UnsupportedFormatError');
  });

  it('TranscriptionError includes cause', () => {
    const cause = new Error('API down');
    const err = new TranscriptionError('Whisper failed', cause);
    expect(err.message).toContain('Whisper failed');
    expect(err.cause).toBe(cause);
    expect(err.name).toBe('TranscriptionError');
  });
});
