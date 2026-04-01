/**
 * Email Sequences — sends email sequences via Resend
 */
import { sendEmail } from './resend.js';

export async function sendEmailSequence(content: string): Promise<void> {
  // TODO: Implement email sequences (welcome, abandoned cart, etc.)
  console.log('Email sequence:', content.slice(0, 50));
}
