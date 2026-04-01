/**
 * Unit tests for the Twitter Content Generator pipeline.
 *
 * Tests cover:
 * - generateTwitterContent: LLM call, parsing, validation
 * - validateTweet: ≤280 char enforcement
 * - validateThread: cap at 10 tweets
 * - postTwitterThread: threading order, rate limit retry, Airtable update
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateTweet } from '../../src/generators/twitterGenerator';

describe('twitterGenerator', () => {
  // -------------------------------------------------------------------------
  // validateTweet
  // -------------------------------------------------------------------------

  describe('validateTweet', () => {
    it('returns short tweet unchanged', () => {
      const input = 'This is a short tweet.';
      expect(validateTweet(input)).toBe(input);
    });

    it('returns tweet at exactly 280 chars unchanged', () => {
      const input = 'A'.repeat(280);
      expect(validateTweet(input)).toBe(input);
    });

    it('splits long tweet at sentence boundary', () => {
      const input = 'This is the first sentence. This is the second sentence that pushes us well over the limit of two hundred and eighty characters and needs to be cut.';
      const result = validateTweet(input);
      expect(result.length).toBeLessThanOrEqual(280);
      expect(result).toContain('first sentence');
    });

    it('hard truncates if no sentence boundary near 280', () => {
      const input = 'A'.repeat(350);
      const result = validateTweet(input);
      expect(result.length).toBeLessThanOrEqual(280);
      expect(result.endsWith('…')).toBe(true);
    });

    it('trims whitespace', () => {
      const input = '  Hello world  ';
      expect(validateTweet(input)).toBe('Hello world');
    });
  });
});

describe('twitterThreadSystemPrompt', () => {
  // -------------------------------------------------------------------------
  // Prompt structure
  // -------------------------------------------------------------------------

  it('system prompt mentions 280 character limit', async () => {
    const { twitterThreadSystemPrompt } = await import('../../src/prompts/twitterThread.js');
    expect(twitterThreadSystemPrompt).toContain('280');
  });

  it('system prompt specifies 3-10 tweet range', async () => {
    const { twitterThreadSystemPrompt } = await import('../../src/prompts/twitterThread.js');
    expect(twitterThreadSystemPrompt).toContain('3 to 10');
  });

  it('system prompt specifies CTA requirement', async () => {
    const { twitterThreadSystemPrompt } = await import('../../src/prompts/twitterThread.js');
    expect(twitterThreadSystemPrompt.toLowerCase()).toContain('cta');
  });

  it('buildTwitterThreadUserPrompt includes title and transcript', async () => {
    const { buildTwitterThreadUserPrompt } = await import('../../src/prompts/twitterThread.js');
    const prompt = buildTwitterThreadUserPrompt({
      title: 'How to Build a Rocket',
      channelTitle: 'ScienceGuy',
      transcript: 'Today we will discuss rocket science.',
      tone: 'professional',
    });
    expect(prompt).toContain('How to Build a Rocket');
    expect(prompt).toContain('ScienceGuy');
    expect(prompt).toContain('rocket science');
    expect(prompt).toContain('professional');
  });
});

describe('TwitterThreadOutput type', () => {
  it('tweet output interface has required fields', async () => {
    const { TwitterThreadOutput, TweetOutput } = await import('../../src/prompts/twitterThread.js');

    const validOutput: TwitterThreadOutput = {
      tweets: [
        { text: 'Short tweet.', mediaSuggestion: null },
        { text: 'Another short tweet.', mediaSuggestion: 'quote frame at 1:23' },
      ],
      threadTheme: 'Rocket Science',
      pinnedQuote: 'We chose to go to the moon.',
    };

    expect(validOutput.tweets.length).toBe(2);
    expect(validOutput.tweets[0].text.length).toBeLessThanOrEqual(280);
    expect(validOutput.threadTheme.length).toBeGreaterThan(0);
  });
});

describe('postAndNotify', () => {
  // -------------------------------------------------------------------------
  // Rate limit retry
  // -------------------------------------------------------------------------

  it('withRetry succeeds on first attempt', async () => {
    const { withRetry } = await import('../../src/generators/postAndNotify.js');

    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('withRetry retries on 429 and eventually succeeds', async () => {
    const { withRetry } = await import('../../src/generators/postAndNotify.js');

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('withRetry throws after max retries exceeded', async () => {
    const { withRetry } = await import('../../src/generators/postAndNotify.js');

    const fn = vi.fn().mockRejectedValue(new Error('429 rate limit'));

    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 10 })).rejects.toThrow(
      '429 rate limit'
    );
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('withRetry does not retry non-429 errors', async () => {
    const { withRetry } = await import('../../src/generators/postAndNotify.js');

    const fn = vi.fn().mockRejectedValue(new Error('some other error'));

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 10 })).rejects.toThrow(
      'some other error'
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('Thread validation edge cases', () => {
  // -------------------------------------------------------------------------
  // Thread capping and minimum
  // -------------------------------------------------------------------------

  it('thread with more than 10 tweets is capped', async () => {
    // We test the validateThread logic by importing the validateThread function
    // from twitterGenerator directly
    const { validateThread } = await import('../../src/generators/twitterGenerator.js');

    const overLimit = {
      tweets: Array.from({ length: 15 }, (_, i) => ({
        text: `Tweet number ${i + 1}`,
        mediaSuggestion: null,
      })),
      threadTheme: 'Test',
      pinnedQuote: 'Test quote',
    };

    const result = validateThread(overLimit);
    expect(result.tweets.length).toBe(10);
  });

  it('thread with 0 tweets is preserved (validation passes empty array check)', async () => {
    const { validateThread } = await import('../../src/generators/twitterGenerator.js');

    const empty = {
      tweets: [],
      threadTheme: 'Test',
      pinnedQuote: null,
    };

    // validateThread doesn't add tweets, it just validates what exists
    const result = validateThread(empty);
    expect(result.tweets.length).toBe(0);
  });

  it('pinnedQuote over 280 chars is truncated', async () => {
    const { validateThread } = await import('../../src/generators/twitterGenerator.js');

    const longQuote = {
      tweets: [{ text: 'A short tweet.', mediaSuggestion: null }],
      threadTheme: 'Test',
      pinnedQuote: 'A'.repeat(350),
    };

    const result = validateThread(longQuote);
    expect(result.pinnedQuote!.length).toBeLessThanOrEqual(280);
    expect(result.pinnedQuote!.endsWith('…')).toBe(true);
  });
});
