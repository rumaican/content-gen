/**
 * Resend Email Platform
 *
 * Provides a simple sendEmail() wrapper around the existing Resend client.
 * Env vars: RESEND_API_KEY, RESEND_FROM_EMAIL (default from), RESEND_DOMAIN (verified sending domain)
 */

import { sendEmail as _sendEmail, SendEmailParams } from '../../../lib/email/resend-client.js'

// ---------------------------------------------------------------------------
// sendEmail — generic sender
// ---------------------------------------------------------------------------

export async function sendEmail(
  from: string,
  to: string | string[],
  subject: string,
  html: string
): Promise<{ success: boolean; data?: { id: string }; error?: unknown }> {
  const params: SendEmailParams = { from, to, subject, html }
  return _sendEmail(params)
}

// ---------------------------------------------------------------------------
// Welcome Email Template
// ---------------------------------------------------------------------------

export interface WelcomeEmailTemplateProps {
  firstName?: string
  orderId: string
  downloadUrl: string
}

export function welcomeEmailTemplate({ firstName, orderId, downloadUrl }: WelcomeEmailTemplateProps): string {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="color: #2d3748; margin: 0;">Your map is ready! 🌍</h1>
  </div>

  <p>${greeting}</p>

  <p>Thank you for your order! We're thrilled you chose Cartography Prints. Your custom map has been generated and is ready for download.</p>

  <div style="background: #f7fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
    <h2 style="margin-top: 0; color: #2d3748;">Order Details</h2>
    <p style="margin: 5px 0;"><strong>Order ID:</strong> #${orderId}</p>
    <p style="margin: 5px 0;"><strong>Status:</strong> Ready for download</p>
  </div>

  <p style="text-align: center; margin: 30px 0;">
    <a href="${downloadUrl}" style="display: inline-block; background: #4a5568; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 16px;">Download Your Map</a>
  </p>

  <p style="color: #718096; font-size: 14px; text-align: center;">
    Your download link is valid for 7 days. Need help? Reply to this email — we're happy to assist.
  </p>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

  <div style="margin: 30px 0;">
    <h3 style="color: #2d3748; margin-bottom: 12px;">Discover more destinations 🗺️</h3>
    <p style="color: #4a5568; font-size: 14px;">Looking for your next adventure? Here are some of our most popular map destinations:</p>
    <ul style="color: #4a5568; font-size: 14px; padding-left: 20px;">
      <li>Paris, France — the City of Light</li>
      <li>Tokyo, Japan — where tradition meets future</li>
      <li>New York City, USA — the city that never sleeps</li>
      <li>Amsterdam, Netherlands — charming canals &amp; culture</li>
      <li>Rome, Italy — timeless history and art</li>
    </ul>
    <p style="text-align: center; margin-top: 16px;">
      <a href="https://mapcommerce.com/shop" style="color: #667eea; font-weight: 600;">Browse all destinations ➡️</a>
    </p>
  </div>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

  <p style="color: #718096; font-size: 12px; text-align: center;">
    <a href="*|UNSUB|*" style="color: #718096;">Unsubscribe</a> — Map Store — Premium Maps & Art
  </p>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Convenience helper — send welcome email in one call
// ---------------------------------------------------------------------------

export interface SendWelcomeEmailOptions {
  to: string
  firstName?: string
  orderId: string
  downloadUrl: string
  from?: string
}

export async function sendWelcomeEmail({
  to,
  firstName,
  orderId,
  downloadUrl,
  from,
}: SendWelcomeEmailOptions): Promise<{ success: boolean; data?: { id: string }; error?: unknown }> {
  const html = welcomeEmailTemplate({ firstName, orderId, downloadUrl })
  return sendEmail(
    from || process.env.RESEND_FROM_EMAIL || 'Map Store <onboarding@resend.dev>',
    to,
    `Your map is ready! 🌍 — Order #${orderId}`,
    html
  )
}
