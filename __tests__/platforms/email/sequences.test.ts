/**
 * __tests__/platforms/email/sequences.test.ts
 * TDD: Email Sequences — verify structure, types, and HTML output
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendWelcomeSequence } from '../../../src/platforms/email/sequences/welcome.ts'
import { sendAbandonedCartSequence } from '../../../src/platforms/email/sequences/abandonedCart.ts'

// ---------------------------------------------------------------------------
// Mock sendEmail so we don't actually send emails
// ---------------------------------------------------------------------------

const mockSendEmail = vi.fn().mockResolvedValue({ success: true, data: { id: 'mock-id' } })

vi.mock('../../../src/platforms/email/resend.ts', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}))

// ---------------------------------------------------------------------------
// Welcome Sequence Tests
// ---------------------------------------------------------------------------

describe('sendWelcomeSequence', () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
  })

  it('test_welcome_sequence_sends_5_emails', async () => {
    const result = await sendWelcomeSequence({
      to: 'test@example.com',
      firstName: 'Alice',
      videoTitle: 'Test Video Title',
      videoUrl: 'https://example.com/video/123',
      videoSummary: 'This is the key insight from the video.',
    })

    expect(result.emails).toHaveLength(5)
    expect(mockSendEmail).toHaveBeenCalledTimes(5)
  })

  it('test_welcome_email_1_has_delay_0', async () => {
    const result = await sendWelcomeSequence({
      to: 'test@example.com',
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
    })
    expect(result.emails[0].delayDays).toBe(0)
  })

  it('test_welcome_emails_have_progressive_delays', async () => {
    const result = await sendWelcomeSequence({
      to: 'test@example.com',
      videoTitle: 'Test Video',
      videoUrl: 'https://example.com/video',
    })

    const delays = result.emails.map((e) => e.delayDays)
    expect(delays).toEqual([0, 2, 4, 6, 8])
  })

  it('test_welcome_emails_have_subjects_and_preview_text', async () => {
    const result = await sendWelcomeSequence({
      to: 'test@example.com',
      videoTitle: 'My Video',
      videoUrl: 'https://example.com/video',
    })

    for (const email of result.emails) {
      expect(typeof email.subject).toBe('string')
      expect(email.subject.length).toBeGreaterThan(0)
      expect(typeof email.previewText).toBe('string')
      expect(email.previewText.length).toBeGreaterThan(0)
    }
  })

  it('test_welcome_emails_contain_unsubscribe_link', async () => {
    const result = await sendWelcomeSequence({
      to: 'test@example.com',
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
    })

    for (const email of result.emails) {
      expect(email.bodyHtml).toContain('*|UNSUB|*')
    }
  })

  it('test_welcome_emails_have_cta_text', async () => {
    const result = await sendWelcomeSequence({
      to: 'test@example.com',
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
    })

    for (const email of result.emails) {
      expect(typeof email.ctaText).toBe('string')
      expect(email.ctaText.length).toBeGreaterThan(0)
    }
  })

  it('test_welcome_email_1_contains_video_link', async () => {
    const result = await sendWelcomeSequence({
      to: 'test@example.com',
      videoTitle: 'My Video',
      videoUrl: 'https://example.com/video/123',
    })

    const email1 = result.emails[0]
    expect(email1.bodyHtml).toContain('https://example.com/video/123')
    expect(email1.subject).toContain('ready')
  })

  it('test_welcome_personalizes_with_first_name', async () => {
    const result = await sendWelcomeSequence({
      to: 'test@example.com',
      firstName: 'Bob',
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
    })

    expect(result.emails[0].bodyHtml).toContain('Hi Bob,')
  })

  it('test_welcome_personalizes_without_first_name', async () => {
    const result = await sendWelcomeSequence({
      to: 'test@example.com',
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
    })

    expect(result.emails[0].bodyHtml).toContain('Hi there,')
  })

  it('test_welcome_result_success_when_all_emails_sent', async () => {
    const result = await sendWelcomeSequence({
      to: 'test@example.com',
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
    })

    expect(result.success).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('test_welcome_result_reports_errors_on_failure', async () => {
    mockSendEmail.mockImplementation(() => Promise.resolve({ success: false, error: new Error('Network error') }))

    const result = await sendWelcomeSequence({
      to: 'test@example.com',
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
    })

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)

    // Reset to default
    mockSendEmail.mockReset()
    mockSendEmail.mockResolvedValue({ success: true, data: { id: 'mock-id' } })
  })

  it('test_welcome_email_2_contains_video_summary', async () => {
    const summary = 'The most important insight from this video is actionable.'
    const result = await sendWelcomeSequence({
      to: 'test@example.com',
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
      videoSummary: summary,
    })

    const email2 = result.emails[1]
    expect(email2.bodyHtml).toContain(summary)
  })

  it('test_welcome_accepts_array_of_recipients', async () => {
    const result = await sendWelcomeSequence({
      to: ['alice@example.com', 'bob@example.com'],
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
    })

    expect(result.emails).toHaveLength(5)
    expect(mockSendEmail).toHaveBeenCalledTimes(5)
  })
})

// ---------------------------------------------------------------------------
// Abandoned Cart Sequence Tests
// ---------------------------------------------------------------------------

describe('sendAbandonedCartSequence', () => {
  beforeEach(() => {
    mockSendEmail.mockClear()
  })

  it('test_abandoned_cart_sends_3_emails', async () => {
    const result = await sendAbandonedCartSequence({
      to: 'test@example.com',
      itemName: 'Premium Video Course',
      itemUrl: 'https://example.com/checkout',
    })

    expect(result.emails).toHaveLength(3)
    expect(mockSendEmail).toHaveBeenCalledTimes(3)
  })

  it('test_abandoned_cart_emails_have_progressive_delays', async () => {
    const result = await sendAbandonedCartSequence({
      to: 'test@example.com',
      itemName: 'Test Item',
      itemUrl: 'https://example.com/checkout',
    })

    const delays = result.emails.map((e) => e.delayDays)
    expect(delays).toEqual([0, 2, 4])
  })

  it('test_abandoned_cart_email_1_contains_item_name', async () => {
    const result = await sendAbandonedCartSequence({
      to: 'test@example.com',
      itemName: 'My Special Product',
      itemUrl: 'https://example.com/checkout',
    })

    const email1 = result.emails[0]
    expect(email1.bodyHtml).toContain('My Special Product')
  })

  it('test_abandoned_cart_email_1_contains_item_url', async () => {
    const result = await sendAbandonedCartSequence({
      to: 'test@example.com',
      itemName: 'Test Item',
      itemUrl: 'https://example.com/checkout/abc123',
    })

    const email1 = result.emails[0]
    expect(email1.bodyHtml).toContain('https://example.com/checkout/abc123')
  })

  it('test_abandoned_cart_all_emails_contain_unsubscribe', async () => {
    const result = await sendAbandonedCartSequence({
      to: 'test@example.com',
      itemName: 'Test Item',
      itemUrl: 'https://example.com/checkout',
    })

    for (const email of result.emails) {
      expect(email.bodyHtml).toContain('*|UNSUB|*')
    }
  })

  it('test_abandoned_cart_personalizes_with_first_name', async () => {
    const result = await sendAbandonedCartSequence({
      to: 'test@example.com',
      firstName: 'Charlie',
      itemName: 'Test Item',
      itemUrl: 'https://example.com/checkout',
    })

    expect(result.emails[0].bodyHtml).toContain('Hi Charlie,')
  })

  it('test_abandoned_cart_without_first_name_uses_hi_there', async () => {
    const result = await sendAbandonedCartSequence({
      to: 'test@example.com',
      itemName: 'Test Item',
      itemUrl: 'https://example.com/checkout',
    })

    expect(result.emails[0].bodyHtml).toContain('Hi there,')
  })

  it('test_abandoned_cart_includes_price_when_provided', async () => {
    const result = await sendAbandonedCartSequence({
      to: 'test@example.com',
      itemName: 'Premium Course',
      itemUrl: 'https://example.com/checkout',
      price: '$49.99',
    })

    for (const email of result.emails) {
      // price only appears in emails 1 and 3
    }
    expect(result.emails[0].bodyHtml).toContain('$49.99')
    expect(result.emails[2].bodyHtml).toContain('$49.99')
  })

  it('test_abandoned_cart_result_success_when_all_emails_sent', async () => {
    const result = await sendAbandonedCartSequence({
      to: 'test@example.com',
      itemName: 'Test Item',
      itemUrl: 'https://example.com/checkout',
    })

    expect(result.success).toBe(true)
    expect(result.errors).toBeUndefined()
  })

  it('test_abandoned_cart_result_reports_errors_on_failure', async () => {
    mockSendEmail.mockImplementation(() => Promise.resolve({ success: false, error: new Error('Send failed') }))

    const result = await sendAbandonedCartSequence({
      to: 'test@example.com',
      itemName: 'Test Item',
      itemUrl: 'https://example.com/checkout',
    })

    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)

    // Reset to default
    mockSendEmail.mockReset()
    mockSendEmail.mockResolvedValue({ success: true, data: { id: 'mock-id' } })
  })

  it('test_abandoned_cart_email_2_has_scarcity_language', async () => {
    const result = await sendAbandonedCartSequence({
      to: 'test@example.com',
      itemName: 'Limited Item',
      itemUrl: 'https://example.com/checkout',
    })

    const email2 = result.emails[1]
    expect(email2.subject).toContain('Limited')
    expect(email2.bodyHtml).toContain('Limited')
  })

  it('test_abandoned_cart_email_3_final_reminder_language', async () => {
    const result = await sendAbandonedCartSequence({
      to: 'test@example.com',
      itemName: 'Last Chance Item',
      itemUrl: 'https://example.com/checkout',
    })

    const email3 = result.emails[2]
    expect(email3.bodyHtml).toContain('final reminder') || expect(email3.bodyHtml).toContain('Last chance')
  })
})

// ---------------------------------------------------------------------------
// Spam-trigger word checks
// ---------------------------------------------------------------------------

describe('email subjects avoid spam triggers', () => {
  it('test_no_all_caps_subject_lines', async () => {
    const welcomeResult = await sendWelcomeSequence({
      to: 'test@example.com',
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
    })

    const cartResult = await sendAbandonedCartSequence({
      to: 'test@example.com',
      itemName: 'Test Item',
      itemUrl: 'https://example.com/checkout',
    })

    const allSubjects = [
      ...welcomeResult.emails.map((e) => e.subject),
      ...cartResult.emails.map((e) => e.subject),
    ]

    for (const subject of allSubjects) {
      const words = subject.split(' ')
      const allCapsWords = words.filter(
        (w) => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)
      )
      // Allow short words like "AI" or "API" but flag 3+ letter ALL CAPS
      const flagged = allCapsWords.filter((w) => w.length >= 3 && !['UVA', 'UVB'].includes(w))
      expect(flagged, `Subject "${subject}" contains ALL CAPS words: ${flagged.join(', ')}`).toHaveLength(0)
    }
  })

  it('test_no_excessive_punctuation_in_subjects', async () => {
    const welcomeResult = await sendWelcomeSequence({
      to: 'test@example.com',
      videoTitle: 'Test',
      videoUrl: 'https://example.com/video',
    })

    const cartResult = await sendAbandonedCartSequence({
      to: 'test@example.com',
      itemName: 'Test Item',
      itemUrl: 'https://example.com/checkout',
    })

    const allSubjects = [
      ...welcomeResult.emails.map((e) => e.subject),
      ...cartResult.emails.map((e) => e.subject),
    ]

    for (const subject of allSubjects) {
      const exclamationCount = (subject.match(/!/g) || []).length
      const questionCount = (subject.match(/\?/g) || []).length
      expect(
        exclamationCount + questionCount,
        `Subject "${subject}" has excessive punctuation`
      ).toBeLessThanOrEqual(2)
    }
  })
})
