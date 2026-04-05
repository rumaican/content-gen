/**
 * __tests__/generators/emailSequence.test.ts
 * TDD: Email Sequence Generator — verify LLM-powered drip sequence generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock OpenAI
// ---------------------------------------------------------------------------

const mockCreate = vi.fn()

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}))

// ---------------------------------------------------------------------------
// Mock Airtable
// ---------------------------------------------------------------------------

const mockAirtableCreate = vi.fn().mockResolvedValue({ id: 'seq_123' })
const mockAirtableUpdate = vi.fn().mockResolvedValue({ id: 'seq_123', fields: {} })

vi.mock('airtable', () => ({
  default: {
    base: vi.fn().mockReturnValue({
      table: vi.fn().mockReturnValue({
        create: mockAirtableCreate,
        update: mockAirtableUpdate,
      }),
    }),
  },
}))

// ---------------------------------------------------------------------------
// Mock Resend
// ---------------------------------------------------------------------------

const mockResendSend = vi.fn().mockResolvedValue({ success: true, data: { id: 'msg_123' } })

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: mockResendSend,
    },
  })),
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { generateEmailSequence } from '../../src/generators/emailSequence.js'
import type { EmailSequenceOptions } from '../../src/generators/emailSequence.js'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function mockLLMSuccess(emails: unknown[]) {
  mockCreate.mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: JSON.stringify({ emails }),
        },
      },
    ],
  })
}

function mockLLMParseError() {
  mockCreate.mockResolvedValueOnce({
    choices: [
      {
        message: {
          content: 'This is not JSON',
        },
      },
    ],
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateEmailSequence', () => {
  beforeEach(() => {
    mockCreate.mockClear()
    mockAirtableCreate.mockClear()
    mockAirtableUpdate.mockClear()
    mockResendSend.mockClear()
    mockResendSend.mockResolvedValue({ success: true, data: { id: 'msg_123' } })
  })

  // -------------------------------------------------------------------------
  // Basic generation
  // -------------------------------------------------------------------------

  it('test_generates_sequence_from_video_record', async () => {
    mockLLMSuccess([
      {
        email_number: 1,
        subject: 'Your video is ready!',
        preview_text: 'Watch now — exclusive content inside.',
        body_html: '<p>Hi there, here is your video.</p>',
        cta_text: 'Watch Now',
        delay_days: 0,
      },
      {
        email_number: 2,
        subject: 'The key insight from your video',
        preview_text: 'One takeaway that changes everything.',
        body_html: '<p>The most important insight is...</p>',
        cta_text: 'Watch the Full Video',
        delay_days: 2,
      },
      {
        email_number: 3,
        subject: "You're in great company",
        preview_text: 'What others are saying.',
        body_html: '<p>Social proof here.</p>',
        cta_text: 'Watch & Join Them',
        delay_days: 4,
      },
      {
        email_number: 4,
        subject: 'One action that changes everything',
        preview_text: 'Take the next step.',
        body_html: '<p>Subscribe for more.</p>',
        cta_text: 'Subscribe Now',
        delay_days: 6,
      },
      {
        email_number: 5,
        subject: 'A resource you will want to keep',
        preview_text: 'Free guide inside.',
        body_html: '<p>Free resource guide.</p>',
        cta_text: 'Get the Free Guide',
        delay_days: 8,
      },
    ])

    const result = await generateEmailSequence({
      videoTitle: 'Test Video',
      videoUrl: 'https://example.com/video/123',
      videoSummary: 'This is the video summary with key insights.',
      recipientEmail: 'test@example.com',
      recipientFirstName: 'Alice',
    })

    expect(result.success).toBe(true)
    expect(result.emails).toHaveLength(5)
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('test_sequence_has_5_to_7_emails', async () => {
    mockLLMSuccess([
      { email_number: 1, subject: 'E1', preview_text: 'P1', body_html: '<p>1</p>', cta_text: 'CTA', delay_days: 0 },
      { email_number: 2, subject: 'E2', preview_text: 'P2', body_html: '<p>2</p>', cta_text: 'CTA', delay_days: 2 },
      { email_number: 3, subject: 'E3', preview_text: 'P3', body_html: '<p>3</p>', cta_text: 'CTA', delay_days: 4 },
      { email_number: 4, subject: 'E4', preview_text: 'P4', body_html: '<p>4</p>', cta_text: 'CTA', delay_days: 6 },
      { email_number: 5, subject: 'E5', preview_text: 'P5', body_html: '<p>5</p>', cta_text: 'CTA', delay_days: 8 },
      { email_number: 6, subject: 'E6', preview_text: 'P6', body_html: '<p>6</p>', cta_text: 'CTA', delay_days: 10 },
      { email_number: 7, subject: 'E7', preview_text: 'P7', body_html: '<p>7</p>', cta_text: 'CTA', delay_days: 12 },
    ])

    const result = await generateEmailSequence({
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
      videoSummary: 'Summary',
      recipientEmail: 'test@example.com',
    })

    expect(result.emails.length).toBeGreaterThanOrEqual(5)
    expect(result.emails.length).toBeLessThanOrEqual(7)
  })

  // -------------------------------------------------------------------------
  // Email fields
  // -------------------------------------------------------------------------

  it('test_each_email_has_required_fields', async () => {
    mockLLMSuccess([
      { email_number: 1, subject: 'Subject 1', preview_text: 'Preview 1', body_html: '<p>Body 1</p>', cta_text: 'CTA 1', delay_days: 0 },
      { email_number: 2, subject: 'Subject 2', preview_text: 'Preview 2', body_html: '<p>Body 2</p>', cta_text: 'CTA 2', delay_days: 2 },
    ])

    const result = await generateEmailSequence({
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
      videoSummary: 'Summary',
      recipientEmail: 'test@example.com',
    })

    for (const email of result.emails) {
      expect(typeof email.subject).toBe('string')
      expect(email.subject.length).toBeGreaterThan(0)
      expect(typeof email.previewText).toBe('string')
      expect(email.previewText.length).toBeGreaterThan(0)
      expect(typeof email.bodyHtml).toBe('string')
      expect(email.bodyHtml.length).toBeGreaterThan(0)
      expect(typeof email.ctaText).toBe('string')
      expect(email.ctaText.length).toBeGreaterThan(0)
      expect(typeof email.delayDays).toBe('number')
      expect(email.delayDays).toBeGreaterThanOrEqual(0)
      expect(email.delayDays).toBeLessThanOrEqual(14)
    }
  })

  it('test_progressive_delays', async () => {
    mockLLMSuccess([
      { email_number: 1, subject: 'E1', preview_text: 'P1', body_html: '<p>1</p>', cta_text: 'CTA', delay_days: 0 },
      { email_number: 2, subject: 'E2', preview_text: 'P2', body_html: '<p>2</p>', cta_text: 'CTA', delay_days: 2 },
      { email_number: 3, subject: 'E3', preview_text: 'P3', body_html: '<p>3</p>', cta_text: 'CTA', delay_days: 4 },
    ])

    const result = await generateEmailSequence({
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
      videoSummary: 'Summary',
      recipientEmail: 'test@example.com',
    })

    const delays = result.emails.map((e) => e.delayDays)
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1])
    }
  })

  it('test_unsubscribe_link_in_all_emails', async () => {
    mockLLMSuccess([
      { email_number: 1, subject: 'E1', preview_text: 'P1', body_html: '<p>Body 1</p>', cta_text: 'CTA', delay_days: 0 },
      { email_number: 2, subject: 'E2', preview_text: 'P2', body_html: '<p>Body 2</p>', cta_text: 'CTA', delay_days: 2 },
    ])

    const result = await generateEmailSequence({
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
      videoSummary: 'Summary',
      recipientEmail: 'test@example.com',
    })

    for (const email of result.emails) {
      expect(email.bodyHtml).toContain('*|UNSUB|*')
    }
  })

  it('test_video_url_in_emails', async () => {
    mockLLMSuccess([
      { email_number: 1, subject: 'E1', preview_text: 'P1', body_html: '<p>Body</p>', cta_text: 'CTA', delay_days: 0 },
    ])

    const result = await generateEmailSequence({
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video/abc123',
      videoSummary: 'Summary',
      recipientEmail: 'test@example.com',
    })

    expect(result.emails[0].bodyHtml).toContain('https://example.com/video/abc123')
  })

  // -------------------------------------------------------------------------
  // Spam trigger checks
  // -------------------------------------------------------------------------

  it('test_subject_lines_avoid_all_caps', async () => {
    mockLLMSuccess([
      { email_number: 1, subject: 'YOUR VIDEO IS READY', preview_text: 'P1', body_html: '<p>B</p>', cta_text: 'CTA', delay_days: 0 },
    ])

    const result = await generateEmailSequence({
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
      videoSummary: 'Summary',
      recipientEmail: 'test@example.com',
    })

    // LLM should avoid ALL CAPS subjects but we check the result is rejected if not
    for (const email of result.emails) {
      const words = email.subject.split(' ')
      const allCapsWords = words.filter(
        (w: string) => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)
      )
      const flagged = allCapsWords.filter((w: string) => w.length >= 3)
      expect(flagged.length, `Subject "${email.subject}" contains ALL CAPS: ${flagged.join(', ')}`).toBe(0)
    }
  })

  it('test_subject_lines_limit_punctuation', async () => {
    mockLLMSuccess([
      { email_number: 1, subject: 'Your video! Watch now.', preview_text: 'P1', body_html: '<p>B</p>', cta_text: 'CTA', delay_days: 0 },
      { email_number: 2, subject: 'One key insight?', preview_text: 'P2', body_html: '<p>B</p>', cta_text: 'CTA', delay_days: 2 },
      { email_number: 3, subject: 'Join thousands of others.', preview_text: 'P3', body_html: '<p>B</p>', cta_text: 'CTA', delay_days: 4 },
    ])

    const result = await generateEmailSequence({
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
      videoSummary: 'Summary',
      recipientEmail: 'test@example.com',
    })

    for (const email of result.emails) {
      const exclamationCount = (email.subject.match(/!/g) || []).length
      const questionCount = (email.subject.match(/\?/g) || []).length
      expect(exclamationCount + questionCount, `Subject "${email.subject}" has excessive punctuation`).toBeLessThanOrEqual(2)
    }
  })

  // -------------------------------------------------------------------------
  // LLM error handling
  // -------------------------------------------------------------------------

  it('test_handles_llm_parse_error', async () => {
    mockLLMParseError()

    const result = await generateEmailSequence({
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
      videoSummary: 'Summary',
      recipientEmail: 'test@example.com',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to parse')
  })

  it('test_handles_llm_api_failure', async () => {
    mockCreate.mockRejectedValueOnce(new Error('OpenAI API error'))

    const result = await generateEmailSequence({
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
      videoSummary: 'Summary',
      recipientEmail: 'test@example.com',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // Resend scheduling
  // -------------------------------------------------------------------------

  it('test_emails_scheduled_with_resend', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test123')
    mockLLMSuccess([
      { email_number: 1, subject: 'E1', preview_text: 'P1', body_html: '<p>1</p>', cta_text: 'CTA', delay_days: 0 },
      { email_number: 2, subject: 'E2', preview_text: 'P2', body_html: '<p>2</p>', cta_text: 'CTA', delay_days: 2 },
      { email_number: 3, subject: 'E3', preview_text: 'P3', body_html: '<p>3</p>', cta_text: 'CTA', delay_days: 4 },
    ])

    const result = await generateEmailSequence({
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
      videoSummary: 'Summary',
      recipientEmail: 'test@example.com',
    })

    expect(result.success).toBe(true)
    expect(mockResendSend).toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Airtable
  // -------------------------------------------------------------------------

  it('test_sequence_saved_to_airtable', async () => {
    vi.stubEnv('AIRTABLE_API_KEY', 'pat_test123')
    vi.stubEnv('AIRTABLE_BASE_ID', 'appTestBase')
    mockLLMSuccess([
      { email_number: 1, subject: 'E1', preview_text: 'P1', body_html: '<p>1</p>', cta_text: 'CTA', delay_days: 0 },
      { email_number: 2, subject: 'E2', preview_text: 'P2', body_html: '<p>2</p>', cta_text: 'CTA', delay_days: 2 },
      { email_number: 3, subject: 'E3', preview_text: 'P3', body_html: '<p>3</p>', cta_text: 'CTA', delay_days: 4 },
    ])

    const result = await generateEmailSequence({
      videoTitle: 'Test Video',
      videoUrl: 'https://example.com/video',
      videoSummary: 'Summary',
      recipientEmail: 'test@example.com',
    })

    expect(result.success).toBe(true)
    expect(mockAirtableCreate).toHaveBeenCalled()
  })
})
