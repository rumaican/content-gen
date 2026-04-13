/**
 * Abandoned Cart Email Sequence
 * Card: MARKETING: Email Sequences (Welcome + Abandoned Cart)
 *
 * Sends a 3-email drip sequence to users who added a video/content to their
 * cart but did not complete the action. Each email is scheduled and sent via Resend.
 *
 * Email schedule:
 *   Day 0  — Email 1: Gentle reminder with the item still in cart
 *   Day 2  — Email 2: Scarcity / limited availability nudge
 *   Day 4  — Email 3: Final reminder with a soft incentive
 */

import { sendEmail } from '../resend.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AbandonedCartOptions {
  to: string | string[]
  firstName?: string
  itemName: string
  itemUrl: string
  price?: string
  from?: string
}

export interface AbandonedCartEmail {
  emailNumber: number
  subject: string
  previewText: string
  bodyHtml: string
  ctaText: string
  delayDays: number
}

export interface AbandonedCartResult {
  success: boolean
  emails: AbandonedCartEmail[]
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
    <a href="${unsubscribeUrl}" style="color: #718096;">Unsubscribe</a> — You're receiving this because you added an item to your cart.
  </p>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Individual email templates
// ---------------------------------------------------------------------------

function email1Reminder(opts: AbandonedCartOptions): AbandonedCartEmail {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : 'Hi there,'
  const priceBlock = opts.price
    ? `<p style="margin: 5px 0; font-size: 18px; font-weight: bold; color: #2d3748;">${opts.price}</p>`
    : ''

  return {
    emailNumber: 1,
    subject: `You left something behind... 🛒`,
    previewText: 'Your cart is waiting — complete your order before it expires.',
    bodyHtml: baseHtml(`
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2d3748; margin: 0;">Your cart is waiting!</h1>
      </div>
      <p>${greeting}</p>
      <p>We noticed you added <strong>"${opts.itemName}"</strong> to your cart but didn't complete your order. No worries — things come up!</p>
      <div style="background: #f7fafc; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
        <h2 style="margin-top: 0; color: #2d3748;">${opts.itemName}</h2>
        ${priceBlock}
        <p style="text-align: center; margin: 20px 0 0;">
          <a href="${opts.itemUrl}" style="display: inline-block; background: #4a5568; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Complete Your Order →</a>
        </p>
      </div>
      <p style="color: #718096; font-size: 14px;">Take your time — your cart is secure and waiting for you.</p>
    `),
    ctaText: 'Complete Your Order →',
    delayDays: 0,
  }
}

function email2Scarcity(opts: AbandonedCartOptions): AbandonedCartEmail {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : 'Hi there,'

  return {
    emailNumber: 2,
    subject: `Heads up — "${opts.itemName}" won't be available forever ⏰`,
    previewText: 'Limited quantities available. Others are interested too.',
    bodyHtml: baseHtml(`
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #e53e3e; margin: 0;">Before you forget...</h1>
      </div>
      <p>${greeting}</p>
      <p>Just a quick heads-up — <strong>"${opts.itemName}"</strong> is in high demand right now, and quantities are limited.</p>
      <div style="background: #fff5f5; border: 1px solid #fc8181; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
        <p style="font-size: 24px; margin: 0;"><strong>⚠️ Limited Availability</strong></p>
        <p style="color: #c53030; margin: 8px 0 0;">We can't reserve items in carts — once it's gone, it's gone.</p>
      </div>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${opts.itemUrl}" style="display: inline-block; background: #e53e3e; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">Claim It Now →</a>
      </p>
    `),
    ctaText: 'Claim It Now →',
    delayDays: 2,
  }
}

function email3FinalReminder(opts: AbandonedCartOptions): AbandonedCartEmail {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : 'Hi there,'
  const priceBlock = opts.price
    ? `<p style="margin: 5px 0; font-size: 18px; font-weight: bold; color: #48bb78;">${opts.price}</p>`
    : ''

  return {
    emailNumber: 3,
    subject: `Last chance for "${opts.itemName}" — this is it 📦`,
    previewText: 'Final reminder. After this, your cart expires automatically.',
    bodyHtml: baseHtml(`
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2d3748; margin: 0;">This is your final reminder</h1>
      </div>
      <p>${greeting}</p>
      <p>We've saved your cart, but we can't hold it forever. After today, <strong>"${opts.itemName}"</strong> may no longer be available.</p>
      <div style="background: #f0fff4; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
        <h2 style="margin-top: 0; color: #2d3748;">${opts.itemName}</h2>
        ${priceBlock}
        <p style="color: #718096; font-size: 14px;">Complete your order now before it's gone.</p>
        <p style="text-align: center; margin: 20px 0 0;">
          <a href="${opts.itemUrl}" style="display: inline-block; background: #48bb78; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">Finish Checkout →</a>
        </p>
      </div>
      <p style="color: #718096; font-size: 14px; text-align: center;">If you meant to pass on this one, no hard feelings — we hope to see you again soon!</p>
    `),
    ctaText: 'Finish Checkout →',
    delayDays: 4,
  }
}

// ---------------------------------------------------------------------------
// Main sequence sender
// ---------------------------------------------------------------------------

export async function sendAbandonedCartSequence(
  opts: AbandonedCartOptions
): Promise<AbandonedCartResult> {
  const emails: AbandonedCartEmail[] = [
    email1Reminder(opts),
    email2Scarcity(opts),
    email3FinalReminder(opts),
  ]

  const errors: unknown[] = []
  const from = opts.from || process.env.RESEND_FROM_EMAIL || 'Map Store <onboarding@resend.dev>'

  for (const email of emails) {
    const scheduledAt =
      email.delayDays > 0
        ? new Date(Date.now() + email.delayDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined

    const result = await sendEmail(from, opts.to, email.subject, email.bodyHtml, scheduledAt)
    if (!result.success) {
      errors.push({ emailNumber: email.emailNumber, error: result.error })
    }
  }

  return {
    success: errors.length === 0,
    emails,
    errors: errors.length > 0 ? errors : undefined,
  }
}
