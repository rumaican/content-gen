/**
 * order-confirmation.ts — Order confirmation email via Resend.
 *
 * Card: G2: Email confirmation (3pts)
 * Uses the existing lib/email/resend-client.ts sendEmail() helper.
 */

import { sendEmail } from '../../../lib/email/resend-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface OrderData {
  id: string;
  customerEmail: string;
  customerName: string;
  items: OrderItem[];
  total: number;
  currency: string;
  orderDate: string;
}

// ---------------------------------------------------------------------------
// Email template
// ---------------------------------------------------------------------------

function buildEmailHtml(order: OrderData): string {
  const itemsHtml = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">${item.name}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">$${item.price.toFixed(2)}</td>
      </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Your Order Confirmation</title>
</head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#1a1a1a;">Your Order is Confirmed 🎉</h2>
  <p>Hi ${order.customerName},</p>
  <p>Thank you for your order! Here are your details:</p>

  <h3 style="margin-top:24px;">Order ID: ${order.id}</h3>
  <p><strong>Date:</strong> ${new Date(order.orderDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

  <table style="width:100%;border-collapse:collapse;margin-top:16px;">
    <thead>
      <tr style="background:#f5f5f5;">
        <th style="padding:8px;text-align:left;">Item</th>
        <th style="padding:8px;text-align:center;">Qty</th>
        <th style="padding:8px;text-align:right;">Price</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2" style="padding:12px 0;font-weight:bold;text-align:right;">Total:</td>
        <td style="padding:12px 0;font-weight:bold;text-align:right;">${order.currency} $${order.total.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  <p style="margin-top:24px;">Your print will be prepared and shipped shortly. We'll email you with tracking information once it's on its way!</p>
  <p style="margin-top:24px;color:#888;font-size:12px;">— The Cartography Prints Team</p>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// sendOrderConfirmation
// ---------------------------------------------------------------------------

/**
 * Send an order confirmation email to the customer.
 *
 * Non-blocking: catches Resend errors and logs them instead of throwing.
 * This ensures order success is never rolled back due to email failures.
 */
export async function sendOrderConfirmation(order: OrderData): Promise<void> {
  const html = buildEmailHtml(order);

  const result = await sendEmail({
    to: order.customerEmail,
    subject: `Your order confirmation - ${order.id}`,
    html,
    from: 'Cartography Prints <noreply@cartographyprints.com>',
  });

  if (!result.success) {
    const err = (result as { success: false; error: unknown }).error;
    console.error(
      `[order-confirmation] Failed to send confirmation for order ${order.id} to ${order.customerEmail}:`,
      err
    );
    // Non-blocking — order is still successful even if email fails
  }
}
