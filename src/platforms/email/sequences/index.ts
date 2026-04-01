/**
 * Email Sequences — barrel export
 * Card: MARKETING: Email Sequences (Welcome + Abandoned Cart)
 */

export {
  sendWelcomeSequence,
  type WelcomeSequenceOptions,
  type WelcomeSequenceResult,
  type EmailRecord,
} from './welcome.js'

export {
  sendAbandonedCartSequence,
  type AbandonedCartOptions,
  type AbandonedCartResult,
  type AbandonedCartEmail,
} from './abandonedCart.js'

/**
 * sendEmailSequence — alias for sendWelcomeSequence for backward compatibility.
 * Used by src/index.ts when routing email content from the pipeline.
 *
 * Accepts a content string (video summary) and wraps it in minimal options.
 * For full control, use sendWelcomeSequence or sendAbandonedCartSequence directly.
 */
import { sendWelcomeSequence, type WelcomeSequenceOptions } from './welcome.js'

export async function sendEmailSequence(
  content: string,
  options?: Partial<WelcomeSequenceOptions>
): Promise<{ success: boolean; emails: unknown[] }> {
  const result = await sendWelcomeSequence({
    to: options?.to ?? 'default@example.com',
    videoTitle: options?.videoTitle ?? 'Exclusive Content',
    videoUrl: options?.videoUrl ?? 'https://example.com/video',
    videoSummary: content,
    firstName: options?.firstName,
  })
  return result
}
