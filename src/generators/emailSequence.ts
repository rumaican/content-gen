/**
 * Email Sequence Generator
 *
 * Generates LLM-powered multi-email drip sequences (3-7 emails) triggered
 * when a new video is processed. Each email has subject, preview text,
 * HTML body, CTA, and delay. Sequences are queued via Resend and tracked
 * in Airtable.
 *
 * File: src/generators/emailSequence.ts
 */

import OpenAI from 'openai'
import { Resend } from 'resend'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmailSequenceEmail {
  email_number: number
  subject: string
  preview_text: string
  body_html: string
  cta_text: string
  delay_days: number
}

export interface GeneratedEmailRecord {
  emailNumber: number
  subject: string
  previewText: string
  bodyHtml: string
  ctaText: string
  delayDays: number
}

export interface EmailSequenceOptions {
  videoTitle: string
  videoUrl: string
  videoSummary?: string
  recipientEmail: string | string[]
  recipientFirstName?: string
}

export interface EmailSequenceResult {
  success: boolean
  emails: GeneratedEmailRecord[]
  airtableRecordId?: string
  error?: string
}

// ---------------------------------------------------------------------------
// LLM prompt
// ---------------------------------------------------------------------------

function buildPrompt(opts: EmailSequenceOptions): string {
  return `You are an expert email copywriter for a content platform. Generate a ${opts.videoSummary ? '5-7' : '3-5' }-email drip sequence for a new video subscriber.

Video Title: ${opts.videoTitle}
Video URL: ${opts.videoUrl}
${opts.videoSummary ? `Video Summary: ${opts.videoSummary}` : ''}

Requirements:
- Each email must have: email_number (1-based), subject, preview_text, body_html, cta_text, delay_days (0-14, progressive)
- Day 0 email is sent immediately; subsequent emails are spaced 2-4 days apart
- All emails MUST include the unsubscribe token *|UNSUB|* in the HTML body
- All emails MUST include the video URL somewhere in the body
- Subjects: no ALL CAPS words (3+ letters), max 2 exclamation marks + question marks combined
- Body HTML should be professional, mobile-responsive, using inline styles
- Personalize with the recipient's first name if provided (use "Hi FirstName," or "Hi there," fallback)
- Email 1: Welcome + video link
- Email 2: Key insight or highlight from the video
- Email 3: Social proof (testimonials, community stats)
- Email 4: Direct CTA (subscribe, follow, DM)
- Email 5+: Soft close, resource link, or second video recommendation

Return a valid JSON object with an "emails" array. Example:
{
  "emails": [
    {
      "email_number": 1,
      "subject": "Your video is ready — watch now!",
      "preview_text": "Here's your exclusive access.",
      "body_html": "<p>Hi Alice,</p><p>Your video is ready...</p>",
      "cta_text": "Watch Now",
      "delay_days": 0
    }
  ]
}`
}

// ---------------------------------------------------------------------------
// Spam validation
// ---------------------------------------------------------------------------

function hasSpamTriggers(subject: string): boolean {
  const words = subject.split(' ')
  const allCapsWords = words.filter(
    (w) => w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)
  )
  if (allCapsWords.length > 0) return true

  const exclamationCount = (subject.match(/!/g) || []).length
  const questionCount = (subject.match(/\?/g) || []).length
  if (exclamationCount + questionCount > 2) return true

  return false
}

// ---------------------------------------------------------------------------
// HTML wrapper with unsubscribe
// ---------------------------------------------------------------------------

function wrapHtml(bodyHtml: string, videoUrl: string, unsubscribeUrl = '*|UNSUB|*'): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${bodyHtml}
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
  <p style="color: #718096; font-size: 12px; text-align: center;">
    <a href="${unsubscribeUrl}" style="color: #718096;">Unsubscribe</a> — You're receiving this because you signed up for updates.
  </p>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Airtable helpers
// ---------------------------------------------------------------------------

async function saveToAirtable(
  _opts: EmailSequenceOptions,
  emails: GeneratedEmailRecord[]
): Promise<string | undefined> {
  const apiKey = process.env.AIRTABLE_API_KEY
  const baseId = process.env.AIRTABLE_BASE_ID

  if (!apiKey || !baseId) {
    console.warn('[emailSequence] Airtable credentials not configured — skipping save')
    return undefined
  }

  try {
    const response = await fetch(`https://api.airtable.com/v0/${baseId}/Email%20Sequences`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [
          {
            fields: {
              'Video Title': _opts.videoTitle,
              'Video URL': _opts.videoUrl,
              'Email Count': emails.length,
              'Status': 'Generated',
              'Emails': JSON.stringify(emails),
            },
          },
        ],
      }),
    })

    if (!response.ok) {
      console.error('[emailSequence] Airtable error:', await response.text())
      return undefined
    }

    const data = (await response.json()) as { records?: { id: string }[] }
    return data.records?.[0]?.id
  } catch (err) {
    console.error('[emailSequence] Airtable save failed:', err)
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export async function generateEmailSequence(
  opts: EmailSequenceOptions
): Promise<EmailSequenceResult> {
  // Initialize OpenAI
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  // Call LLM
  let rawContent: string
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: buildPrompt(opts) }],
      temperature: 0.8,
      max_tokens: 2048,
    })

    rawContent = response.choices[0]?.message?.content ?? ''
  } catch (err) {
    return {
      success: false,
      emails: [],
      error: `OpenAI API error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // Parse LLM response
  let parsed: { emails: EmailSequenceEmail[] }
  try {
    // Try to extract JSON from the response
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in LLM response')
    parsed = JSON.parse(jsonMatch[0])
  } catch (err) {
    return {
      success: false,
      emails: [],
      error: `Failed to parse LLM response as JSON: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const rawEmails = parsed.emails ?? []

  // Validate and normalize
  const emails: GeneratedEmailRecord[] = []
  for (const raw of rawEmails) {
    if (!raw.subject || !raw.body_html) continue

    let subject = raw.subject

    // Spam check — fix subjects with ALL CAPS or excessive punctuation
    if (hasSpamTriggers(subject)) {
      subject = subject
        .replace(/!{2,}/g, '!')
        .replace(/\?{2,}/g, '?')
        .replace(/!+\s*!/g, '!')
        .replace(/\?+\s*\?/g, '?')
        .split(/\s+/)
        .map((word) => {
          if (word.length >= 3 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
            // Title-case it
            return word.charAt(0) + word.slice(1).toLowerCase()
          }
          return word
        })
        .join(' ')
        .replace(/!\s*!+/g, '!')
        .replace(/\?\s*\?+/g, '?')
        .trim()
    }

    // Ensure video URL appears in body
    const bodyWithVideo = raw.body_html.includes(opts.videoUrl)
      ? raw.body_html
      : raw.body_html.replace('</p>', ` <a href="${opts.videoUrl}">Watch video</a></p>`)

    emails.push({
      emailNumber: raw.email_number,
      subject,
      previewText: raw.preview_text ?? '',
      bodyHtml: wrapHtml(bodyWithVideo, opts.videoUrl),
      ctaText: raw.cta_text ?? '',
      delayDays: Math.min(Math.max(raw.delay_days ?? 0, 0), 14),
    })
  }

  if (emails.length < 3) {
    return {
      success: false,
      emails,
      error: `LLM returned too few emails (${emails.length}), expected 3-7`,
    }
  }

  // Save to Airtable
  const airtableRecordId = await saveToAirtable(opts, emails)

  // Queue in Resend
  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'Map Store <onboarding@resend.dev>'
  const resend = resendApiKey ? new Resend(resendApiKey) : null

  const recipients = Array.isArray(opts.recipientEmail) ? opts.recipientEmail : [opts.recipientEmail]

  for (const email of emails) {
    if (!resend) continue // Skip if no Resend key (test mode)

    try {
      const scheduledAt =
        email.delayDays === 0
          ? undefined
          : new Date(Date.now() + email.delayDays * 24 * 60 * 60 * 1000).toISOString()

      await resend.emails.send({
        from: fromEmail,
        to: recipients,
        subject: email.subject,
        html: email.bodyHtml,
        scheduledAt,
      })
    } catch (err) {
      console.error(`[emailSequence] Failed to send email ${email.emailNumber}:`, err)
    }
  }

  // Core generation succeeded; external deps (Resend/Airtable) are best-effort
  return {
    success: true,
    emails,
    airtableRecordId,
  }
}
