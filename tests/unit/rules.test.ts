/**
 * rules.test.ts — Unit tests for routing rules.
 * Pure functions, no I/O, no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import {
  countInsights,
  isEligible,
  scorePlatform,
  selectPlatforms,
  chooseContentType,
  estimateEffort,
  type VideoRecord,
} from '../../src/router/rules.js';

type PlatformName = 'twitter' | 'instagram' | 'linkedin' | 'tiktok' | 'email';

// ---------------------------------------------------------------------------
// countInsights
// ---------------------------------------------------------------------------

describe('countInsights', () => {
  it('returns 0 for null transcript', () => {
    expect(countInsights(null)).toBe(0);
  });

  it('returns 0 for empty transcript', () => {
    expect(countInsights('')).toBe(0);
  });

  it('returns 0 for undefined transcript', () => {
    expect(countInsights(undefined)).toBe(0);
  });

  it('counts only short sentences', () => {
    const transcript = 'Short insight one here. Short insight two here. Short insight three.';
    expect(countInsights(transcript)).toBe(3);
  });

  it('ignores very long sentences', () => {
    const long = 'A'.repeat(150);
    const transcript = `Short insight. ${long}. Another short insight here.`;
    expect(countInsights(transcript)).toBe(2);
  });

  it('ignores filler phrases', () => {
    const transcript = 'Um that was interesting. A valid short insight here. Uh huh valid.';
    expect(countInsights(transcript)).toBe(1);
  });

  it('caps at 5000 chars', () => {
    const long = 'Short sentence. '.repeat(500);
    expect(countInsights(long)).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// isEligible — TikTok
// ---------------------------------------------------------------------------

describe('isEligible tiktok', () => {
  it('returns true for short video on tiktok (duration: 45)', () => {
    const record: VideoRecord = { videoId: 'v1', duration: 45 };
    expect(isEligible('tiktok', record)).toBe(true);
  });

  it('returns false for long video on tiktok (duration: 180)', () => {
    const record: VideoRecord = { videoId: 'v1', duration: 180 };
    expect(isEligible('tiktok', record)).toBe(false);
  });

  it('returns false for null duration on tiktok', () => {
    const record: VideoRecord = { videoId: 'v1', duration: null };
    expect(isEligible('tiktok', record)).toBe(false);
  });

  it('returns true for exactly 59s', () => {
    const record: VideoRecord = { videoId: 'v1', duration: 59 };
    expect(isEligible('tiktok', record)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isEligible — Twitter
// ---------------------------------------------------------------------------

describe('isEligible twitter', () => {
  it('returns true for insight-rich transcript on twitter (8 short sentences)', () => {
    const transcript =
      'First insight here. Second point made. Third idea presented. ' +
      'Fourth thought here. Fifth observation. Sixth note made. ' +
      'Seventh insight. Eighth point made.';
    const record: VideoRecord = { videoId: 'v1', transcript };
    expect(isEligible('twitter', record)).toBe(true);
  });

  it('returns false for short transcript on twitter (1 sentence)', () => {
    const record: VideoRecord = { videoId: 'v1', transcript: 'Just one short sentence.' };
    expect(isEligible('twitter', record)).toBe(false);
  });

  it('handles missing transcript gracefully (no crash)', () => {
    const record: VideoRecord = { videoId: 'v1', transcript: null };
    expect(isEligible('twitter', record)).toBe(false);
  });

  it('returns false for empty transcript', () => {
    const record: VideoRecord = { videoId: 'v1', transcript: '' };
    expect(isEligible('twitter', record)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isEligible — Instagram
// ---------------------------------------------------------------------------

describe('isEligible instagram', () => {
  it('returns true for video with visual hook tag', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      duration: 120,
      tags: 'demo,visual hook,product',
    };
    expect(isEligible('instagram', record)).toBe(true);
  });

  it('returns true for video in optimal duration range', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      duration: 120, // 15-300s optimal
      transcript: 'Some transcript content.',
    };
    expect(isEligible('instagram', record)).toBe(true);
  });

  it('returns false for very long video with no visual keywords', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      duration: 600,
      tags: 'speech,interview',
    };
    expect(isEligible('instagram', record)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isEligible — LinkedIn
// ---------------------------------------------------------------------------

describe('isEligible linkedin', () => {
  it('returns true for long-form educational video (>10min + how-to)', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      duration: 700,
      title: 'How to build a startup from scratch',
      transcript: 'Many words here. More content. Even more. Still going.',
    };
    expect(isEligible('linkedin', record)).toBe(true);
  });

  it('returns true for long-form + explainer keyword in tags', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      duration: 800,
      title: 'Deep dive topic',
      tags: 'explainer,tutorial',
      transcript: 'Many words here.',
    };
    expect(isEligible('linkedin', record)).toBe(true);
  });

  it('returns false for short video even with educational keywords', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      duration: 300,
      title: 'How to do something',
      transcript: 'Some content here.',
    };
    expect(isEligible('linkedin', record)).toBe(false);
  });

  it('returns false for long video without educational keywords', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      duration: 700,
      title: 'Random video content',
      transcript: 'Many words here.',
    };
    expect(isEligible('linkedin', record)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isEligible — Email
// ---------------------------------------------------------------------------

describe('isEligible email', () => {
  it('returns true for rich transcript', () => {
    const transcript = 'A'.repeat(200);
    const record: VideoRecord = { videoId: 'v1', transcript };
    expect(isEligible('email', record)).toBe(true);
  });

  it('returns false for short transcript', () => {
    const record: VideoRecord = { videoId: 'v1', transcript: 'Short.' };
    expect(isEligible('email', record)).toBe(false);
  });

  it('returns false for null transcript', () => {
    const record: VideoRecord = { videoId: 'v1', transcript: null };
    expect(isEligible('email', record)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isEligible — respects maxPosts
// ---------------------------------------------------------------------------

describe('isEligible maxPosts constraint', () => {
  it('selectPlatforms respects maxPosts per platform', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      duration: 30,
      transcript:
        'Sentence one. Sentence two. Sentence three. Sentence four. ' +
        'Sentence five. Sentence six. Sentence seven. Sentence eight. ' +
        'Sentence nine. Sentence ten.',
      title: 'How to startup tech business growth',
      tags: 'demo,visual hook',
    };

    const selected = selectPlatforms(record);
    const tiktokCount = selected.filter((p) => p === 'tiktok').length;
    const twitterCount = selected.filter((p) => p === 'twitter').length;

    // TikTok maxPosts = 2, Twitter maxPosts = 5
    expect(tiktokCount).toBeLessThanOrEqual(2);
    expect(twitterCount).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// scorePlatform
// ---------------------------------------------------------------------------

describe('scorePlatform', () => {
  it('returns 0 for ineligible platform', () => {
    const record: VideoRecord = { videoId: 'v1', duration: 180 };
    expect(scorePlatform('tiktok', record)).toBe(0);
  });

  it('returns higher score for very short video on tiktok', () => {
    const shortRecord: VideoRecord = { videoId: 'v1', duration: 20 };
    const longerRecord: VideoRecord = { videoId: 'v1', duration: 55 };

    const shortScore = scorePlatform('tiktok', shortRecord);
    const longerScore = scorePlatform('tiktok', longerRecord);

    expect(shortScore).toBeGreaterThan(longerScore);
  });

  it('returns higher score for visual hook on instagram', () => {
    const visualRecord: VideoRecord = {
      videoId: 'v1',
      duration: 120,
      tags: 'visual hook,demo',
    };
    const plainRecord: VideoRecord = {
      videoId: 'v1',
      duration: 120,
      tags: 'speech',
    };

    const visualScore = scorePlatform('instagram', visualRecord);
    const plainScore = scorePlatform('instagram', plainRecord);

    expect(visualScore).toBeGreaterThan(plainScore);
  });

  it('instagram score > tiktok score for visual content', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      duration: 60,
      tags: 'visual demo',
      transcript: 'Some short transcript.',
    };

    const instagramScore = scorePlatform('instagram', record);
    const tiktokScore = scorePlatform('tiktok', record);

    expect(instagramScore).toBeGreaterThan(tiktokScore);
  });
});

// ---------------------------------------------------------------------------
// selectPlatforms
// ---------------------------------------------------------------------------

describe('selectPlatforms', () => {
  it('returns empty array when no platforms eligible', () => {
    // duration 400 (outside all optimal ranges), short transcript, no edu keywords, no visual tags
    const record: VideoRecord = {
      videoId: 'v1',
      duration: 400,
      transcript: 'Short.',
    };
    expect(selectPlatforms(record)).toEqual([]);
  });

  it('returns multiple platforms for standard video', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      duration: 30,
      transcript:
        'Sentence one. Sentence two. Sentence three. Sentence four. ' +
        'Sentence five. Sentence six. Sentence seven. Sentence eight.',
      title: 'How to build a tech startup',
      tags: 'demo,visual hook',
    };

    const selected = selectPlatforms(record);
    expect(selected.length).toBeGreaterThanOrEqual(1);
  });

  it('includes tiktok for short video', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      duration: 45,
      transcript:
        'Sentence one. Sentence two. Sentence three. Sentence four. ' +
        'Sentence five.',
    };
    expect(selectPlatforms(record)).toContain('tiktok');
  });
});

// ---------------------------------------------------------------------------
// chooseContentType
// ---------------------------------------------------------------------------

describe('chooseContentType', () => {
  it('chooses thread for insight-rich twitter', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      transcript:
        'First insight here. Second point made. Third idea presented. ' +
        'Fourth thought here. Fifth observation. Sixth note made. ' +
        'Seventh insight. Eighth point made.',
    };
    expect(chooseContentType('twitter', record)).toBe('thread');
  });

  it('chooses text for low-insight twitter', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      transcript: 'Just one short sentence here.',
    };
    expect(chooseContentType('twitter', record)).toBe('text');
  });

  it('chooses reel for short instagram video', () => {
    const record: VideoRecord = { videoId: 'v1', duration: 45 };
    expect(chooseContentType('instagram', record)).toBe('reel');
  });

  it('chooses caption for longer instagram video', () => {
    const record: VideoRecord = { videoId: 'v1', duration: 120 };
    expect(chooseContentType('instagram', record)).toBe('caption');
  });

  it('chooses article for educational linkedin', () => {
    const record: VideoRecord = {
      videoId: 'v1',
      duration: 700,
      title: 'How to build a startup',
    };
    expect(chooseContentType('linkedin', record)).toBe('article');
  });

  it('chooses drip-email for email', () => {
    const record: VideoRecord = { videoId: 'v1', transcript: 'Some content.' };
    expect(chooseContentType('email', record)).toBe('drip-email');
  });
});

// ---------------------------------------------------------------------------
// estimateEffort
// ---------------------------------------------------------------------------

describe('estimateEffort', () => {
  it('returns platform-specific effort in minutes', () => {
    expect(estimateEffort('tiktok')).toBe(15);
    expect(estimateEffort('twitter')).toBe(10);
    expect(estimateEffort('instagram')).toBe(20);
    expect(estimateEffort('linkedin')).toBe(30);
    expect(estimateEffort('email')).toBe(25);
  });
});
