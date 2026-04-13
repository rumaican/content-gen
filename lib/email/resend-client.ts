/**
 * MARKETING: Email Sequences — Resend Client Wrapper
 * Card: MARKETING: Email Sequences (Welcome + Abandoned Cart)
 *
 * Provides a typed, centralized Resend client with consistent error handling.
 * Replaces direct `new Resend()` calls scattered across lib/email.ts.
 */

import { Resend } from 'resend'

// ---------------------------------------------------------------------------
// Client singleton
// ---------------------------------------------------------------------------
let _client: Resend | null = null

/**
 * Get or create the Resend singleton client.
 * Throws if RESEND_API_KEY is not configured.
 */
export function getResendClient(): Resend {
  if (_client) return _client

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error(
      '[resend-client] RESEND_API_KEY is not set. ' +
        'Add it to .env.local or .env.example.'
    )
  }

  _client = new Resend(apiKey)
  return _client
}

/**
 * Reset the client singleton (for testing only).
 */
export function resetResendClient(): void {
  _client = null
}

// ---------------------------------------------------------------------------
// sendEmail helper
// ---------------------------------------------------------------------------
export interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  from?: string
  text?: string
  scheduledAt?: string
}

export type SendEmailResult =
  | { success: true; data: { id: string } }
  | { success: false; error: unknown }

/**
 * Send an email via Resend with consistent error handling.
 *
 * - Uses RESEND_FROM_EMAIL env var as default `from` address.
 * - Never throws — always returns { success: boolean }.
 */
export async function sendEmail({
  to,
  subject,
  html,
  from,
  text,
  scheduledAt,
}: SendEmailParams): Promise<SendEmailResult> {
  const client = getResendClient()
  const fromAddress = from ?? process.env.RESEND_FROM_EMAIL ?? 'Map Store <onboarding@resend.dev>'

  try {
    const { data, error } = await client.emails.send({
      from: fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      scheduledAt,
    })

    if (error) {
      console.error('[resend-client] Resend error:', error)
      return { success: false, error }
    }

    return { success: true, data: { id: data?.id ?? 'unknown' } }
  } catch (err) {
    console.error('[resend-client] Unexpected error:', err)
    return { success: false, error: err }
  }
}
