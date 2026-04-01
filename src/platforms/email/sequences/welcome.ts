/**
 * Welcome Email Sequence
 * Card: MARKETING: Email Sequences (Welcome + Abandoned Cart)
 *
 * Sends a 5-email drip sequence to new subscribers after video processing.
 * Each email is scheduled with a delay (in days) and sent via Resend.
 *
 * Email schedule:
 *   Day 0  — Email 1: Welcome + video link + personal intro
 *   Day 2  — Email 2: Key insight from video
 *   Day 4  — Email 3: Social proof / community stats
 *   Day 6  — Email 4: Direct CTA (subscribe, follow, DM)
 *   Day 8  — Email 5: Soft close + resource link
 */

import { sendEmail } from '../resend.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WelcomeSequenceOptions {
  to: string | string[]
  firstName?: string
  videoTitle: string
  videoUrl: string
  videoSummary?: string
  from?: string
}

export interface EmailRecord {
  emailNumber: number
  subject: string
  previewText: string
  bodyHtml: string
  ctaText: string
  delayDays: number
}

export interface WelcomeSequenceResult {
  success: boolean
  emails: EmailRecord[]
  errors?: unknown[]
}

// ---------------------------------------------------------------------------
// Base HTML wrapper (shared Unsubscribe token)
// ---------------------------------------------------------------------------

function baseHtml(innerHtml: string, unsubscribeUrl = '*|UNSUB|*'): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${innerHtml}
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
  <p style="color: #718096; font-size: 12px; text-align: center;">
    <a href="${unsubscribeUrl}" style="color: #718096;">Unsubscribe</a> — You're receiving this because you signed up for updates.
  </p>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Individual email templates
// ---------------------------------------------------------------------------

function email1Welcome(opts: WelcomeSequenceOptions): EmailRecord {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : 'Hi there,'
  return {
    emailNumber: 1,
    subject: `Your video is ready — let's get started! 🎬`,
    previewText: `Hi ${opts.firstName ?? 'there'}, here's your exclusive video access.`,
    bodyHtml: baseHtml(`
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2d3748; margin: 0;">Welcome! Your video is ready 🎉</h1>
      </div>
      <p>${greeting}</p>
      <p>Thank you for signing up! We're thrilled to share your exclusive content with you.</p>
      <div style="background: #f7fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h2 style="margin-top: 0; color: #2d3748;">${opts.videoTitle}</h2>
        <p style="margin: 5px 0; color: #4a5568;">Your exclusive video content is waiting for you.</p>
        <p style="text-align: center; margin: 20px 0 0;">
          <a href="${opts.videoUrl}" style="display: inline-block; background: #4a5568; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Watch Now ▶</a>
        </p>
      </div>
      <p style="color: #718096; font-size: 14px;">Watch at your own pace — there's no rush. We'll be here when you're ready for more.</p>
    `),
    ctaText: 'Watch Now ▶',
    delayDays: 0,
  }
}

function email2Highlight(opts: WelcomeSequenceOptions): EmailRecord {
  const insight = opts.videoSummary
    ? opts.videoSummary.split('\n')[0].trim()
    : 'The key insight from this video is incredibly valuable and worth your time.'

  return {
    emailNumber: 2,
    subject: `The highlight from "${opts.videoTitle}" you don't want to miss`,
    previewText: 'One key takeaway that makes this video worth every minute.',
    bodyHtml: baseHtml(`
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2d3748; margin: 0;">The key insight 🎯</h1>
      </div>
      <p>Hey ${opts.firstName ?? 'there'},</p>
      <p>I wanted to share the single most important thing from your video:</p>
      <div style="background: #edf2f7; border-left: 4px solid #667eea; padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; font-size: 16px; color: #2d3748; font-style: italic;">"${insight}"</p>
      </div>
      <p>This is just the beginning — there's so much more value packed into the full video.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${opts.videoUrl}" style="display: inline-block; background: #667eea; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Watch the Full Video →</a>
      </p>
    `),
    ctaText: 'Watch the Full Video →',
    delayDays: 2,
  }
}

function email3SocialProof(opts: WelcomeSequenceOptions): EmailRecord {
  return {
    emailNumber: 3,
    subject: `You're in great company 👏`, // eslint-disable-line no-secrets/no-secrets
    previewText: 'Thousands of people have already benefited from this content.',
    bodyHtml: baseHtml(`
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2d3748; margin: 0;">You're in great company</h1>
      </div>
      <p>Hey ${opts.firstName ?? 'there'},</p>
      <p>Thousands of people just like you have already watched this video. Here's what they're saying:</p>
      <div style="background: #f7fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="font-style: italic; color: #4a5568; margin: 0;">"This was exactly what I needed. The insights were practical and immediately applicable." — <strong>Maya R.</strong></p>
      </div>
      <div style="background: #f7fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <p style="font-style: italic; color: #4a5568; margin: 0;">"I shared this with my entire team. Highly recommend watching the full video." — <strong>James T.</strong></p>
      </div>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${opts.videoUrl}" style="display: inline-block; background: #4a5568; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Watch & Join Them →</a>
      </p>
    `),
    ctaText: 'Watch & Join Them →',
    delayDays: 4,
  }
}

function email4CTA(opts: WelcomeSequenceOptions): EmailRecord {
  return {
    emailNumber: 4,
    subject: `One action that changes everything 💡`,
    previewText: 'Take the next step — it only takes a minute.',
    bodyHtml: baseHtml(`
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2d3748; margin: 0;">Ready to take the next step?</h1>
      </div>
      <p>Hey ${opts.firstName ?? 'there'},</p>
      <p>You've seen the video, you know the value — now here's how to get even more:</p>
      <div style="background: #f7fafc; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
        <h2 style="margin-top: 0; color: #2d3748;">Subscribe to Our Newsletter</h2>
        <p style="color: #4a5568;">Get weekly insights, early access to new content, and exclusive resources delivered straight to your inbox.</p>
        <p style="text-align: center; margin: 20px 0;">
          <a href="#" style="display: inline-block; background: #48bb78; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Subscribe Now →</a>
        </p>
      </div>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${opts.videoUrl}" style="display: inline-block; background: #4a5568; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Watch Again ▶</a>
      </p>
    `),
    ctaText: 'Subscribe Now →',
    delayDays: 6,
  }
}

function email5SoftClose(opts: WelcomeSequenceOptions): EmailRecord {
  return {
    emailNumber: 5,
    subject: `A resource you'll want to keep 📚`,
    previewText: 'One last thing before we let you go...',
    bodyHtml: baseHtml(`
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2d3748; margin: 0;">One last thing...</h1>
      </div>
      <p>Hey ${opts.firstName ?? 'there'},</p>
      <p>Before you go, we wanted to leave you with a free resource — no strings attached.</p>
      <div style="background: #f7fafc; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
        <h2 style="margin-top: 0; color: #2d3748;">Free Resource Guide</h2>
        <p style="color: #4a5568;">A curated collection of the best tools, tips, and templates to help you get the most out of what you've learned.</p>
        <p style="text-align: center; margin: 20px 0;">
          <a href="#" style="display: inline-block; background: #ed8936; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Get the Free Guide →</a>
        </p>
      </div>
      <p>And if you ever want to revisit your video, here's the link:</p>
      <p style="text-align: center;">
        <a href="${opts.videoUrl}" style="color: #667eea; font-weight: 600;">${opts.videoUrl}</a>
      </p>
      <p style="color: #718096; font-size: 14px;">Take care, and we look forward to seeing you again soon!</p>
    `),
    ctaText: 'Get the Free Guide →',
    delayDays: 8,
  }
}

// ---------------------------------------------------------------------------
// Main sequence generator
// ---------------------------------------------------------------------------

export async function sendWelcomeSequence(
  opts: WelcomeSequenceOptions
): Promise<WelcomeSequenceResult> {
  const emails: EmailRecord[] = [
    email1Welcome(opts),
    email2Highlight(opts),
    email3SocialProof(opts),
    email4CTA(opts),
    email5SoftClose(opts),
  ]

  const errors: unknown[] = []
  const from = opts.from || process.env.RESEND_FROM_EMAIL || 'Map Store <onboarding@resend.dev>'

  for (const email of emails) {
    // AC4 fix: use Resend scheduled_at to delay emails by delayDays
    let result: { success: boolean; data?: { id: string }; error?: unknown } = { success: false, error: 'Not implemented' }

    if (email.delayDays > 0) {
      // Schedule email for future delivery
      const scheduledAt = new Date(Date.now() + email.delayDays * 24 * 60 * 60 * 1000).toISOString()
      // Import dynamically to avoid circular deps — use the underlying client directly
      const { getResendClient } = await import('../../../../lib/email/resend-client.js')
      const client = getResendClient()
      const toAddresses = Array.isArray(opts.to) ? opts.to : [opts.to]
      try {
        const { data, error } = await client.emails.send({
          from,
          to: toAddresses,
          subject: email.subject,
          html: email.bodyHtml,
          scheduledAt,
        })
        if (error) {
          errors.push({ emailNumber: email.emailNumber, error })
          result = { success: false, error }
        } else {
          result = { success: true, data: { id: data?.id ?? 'unknown' } }
        }
      } catch (err) {
        errors.push({ emailNumber: email.emailNumber, error: err })
        result = { success: false, error: err }
      }
    } else {
      // Send immediately (day 0)
      result = await sendEmail(from, opts.to, email.subject, email.bodyHtml)
      if (!result.success) {
        errors.push({ emailNumber: email.emailNumber, error: result.error })
      }
    }
  }

  return {
    success: errors.length === 0,
    emails,
    errors: errors.length > 0 ? errors : undefined,
  }
}
