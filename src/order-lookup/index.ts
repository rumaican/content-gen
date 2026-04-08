/**
 * src/order-lookup/index.ts
 * G4: Order history via email — guest checkout order lookup
 *
 * Provides:
 *  - generateVerificationCode(): string
 *  - isValidEmail(email: string): boolean
 *  - isValidOrderId(id: string): boolean
 *  - buildVerificationEmailHtml(code: string, email: string): string
 *  - buildOrderNotFoundHtml(orderId: string, email: string): string
 *  - buildOrderDetailsHtml(order: OrderLookupResult): string
 */

// sendEmail imported for future use when API route is wired up
// import { sendEmail } from '../../lib/email/resend-client.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderItem {
  name: string
  quantity: number
  price: number
}

export interface OrderLookupResult {
  id: string
  customerEmail: string
  customerName: string
  status: OrderStatus
  trackingNumber?: string
  trackingCarrier?: string
  trackingUrl?: string
  items: OrderItem[]
  total: number
  currency: string
  orderDate: string
}

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'

// ---------------------------------------------------------------------------
// Verification Code
// ---------------------------------------------------------------------------

/** Generate a cryptographically random 6-digit numeric code. */
export function generateVerificationCode(): string {
  // Node.js 19+: globalThis.crypto is available
  // Node.js <19: fallback to Math.random (acceptable for non-crypto use)
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    const array = new Uint32Array(1)
    globalThis.crypto.getRandomValues(array)
    return (array[0] % 1_000_000).toString().padStart(6, '0')
  }
  // Fallback for older Node versions
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim())
}

// Order ID format: starts with UPPERCASE prefix (2-6 letters) + hyphen + numeric suffix
// Examples: CP-12345, MAP-1, ORDERS-99
const ORDER_ID_REGEX = /^[A-Z]{2,6}-\d+$/

export function isValidOrderId(id: string): boolean {
  return typeof id === 'string' && ORDER_ID_REGEX.test(id.trim())
}

// ---------------------------------------------------------------------------
// Email Templates
// ---------------------------------------------------------------------------

const BASE_STYLE = `
<style>
  body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333; }
  .code { font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #1a1a1a; text-align: center; padding: 20px; background: #f5f5f5; border-radius: 8px; margin: 20px 0; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: bold; text-transform: uppercase; }
  .status-pending { background: #fff3cd; color: #856404; }
  .status-processing { background: #cce5ff; color: #004085; }
  .status-shipped { background: #d4edda; color: #155724; }
  .status-delivered { background: #d1e7dd; color: #0f5132; }
  .status-cancelled { background: #f8d7da; color: #721c24; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { padding: 10px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f5f5f5; font-weight: 600; }
  .total-row td { font-weight: bold; border-top: 2px solid #333; }
  .tracking { background: #e9f5ff; padding: 12px; border-radius: 6px; margin-top: 16px; }
  a { color: #0066cc; }
</style>
`

export function buildVerificationEmailHtml(code: string, email: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" />${BASE_STYLE}</head>
<body>
  <h2>🔐 Your Order Verification Code</h2>
  <p>You requested to look up order details for <strong>${email}</strong>.</p>
  <p>Enter this verification code on the order lookup page:</p>
  <div class="code">${code}</div>
  <p style="color:#888;font-size:12px;">This code expires in 15 minutes. If you didn't request this, you can safely ignore this email.</p>
  <p style="margin-top:24px;color:#888;font-size:12px;">— Cartography Prints</p>
</body>
</html>`
}

export function buildOrderNotFoundHtml(orderId: string, email: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" />${BASE_STYLE}</head>
<body>
  <h2>⚠️ Order Not Found</h2>
  <p>We couldn't find an order matching:</p>
  <ul>
    <li><strong>Email:</strong> ${email}</li>
    <li><strong>Order ID:</strong> ${orderId}</li>
  </ul>
  <p>Please double-check your order confirmation email and try again. Make sure you're using the exact email address and order ID from your receipt.</p>
  <p>If you still need help, reply to this email and our team will assist you.</p>
  <p style="margin-top:24px;color:#888;font-size:12px;">— Cartography Prints</p>
</body>
</html>`
}

function statusClass(status: OrderStatus): string {
  return `status-badge status-${status}`
}

function statusColor(status: OrderStatus): string {
  const colors: Record<OrderStatus, string> = {
    pending: '#856404',
    processing: '#004085',
    shipped: '#155724',
    delivered: '#0f5132',
    cancelled: '#721c24',
  }
  return colors[status]
}

export function buildOrderDetailsHtml(order: OrderLookupResult): string {
  const itemsRows = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding:10px;">${item.name}</td>
      <td style="padding:10px;text-align:center;">${item.quantity}</td>
      <td style="padding:10px;text-align:right;">$${item.price.toFixed(2)}</td>
    </tr>`
    )
    .join('')

  const trackingSection =
    order.trackingNumber
      ? `
  <div class="tracking">
    <strong>📦 Shipped via ${order.trackingCarrier ?? 'Carrier'}</strong><br/>
    Tracking #: <strong>${order.trackingNumber}</strong><br/>
    ${order.trackingUrl ? `<a href="${order.trackingUrl}">Track your package →</a>` : ''}
  </div>`
      : ''

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" />${BASE_STYLE}</head>
<body>
  <h2>🗺️ Your Order Details</h2>
  <p>Hi ${order.customerName}, here is your order information.</p>

  <p><strong>Order ID:</strong> ${order.id}</p>
  <p><strong>Date:</strong> ${new Date(order.orderDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
  <p>
    <strong>Status:</strong>
    <span class="${statusClass(order.status)}" style="color:${statusColor(order.status)}">${order.status.toUpperCase()}</span>
  </p>

  ${trackingSection}

  <table>
    <thead>
      <tr>
        <th style="padding:10px;">Item</th>
        <th style="padding:10px;text-align:center;">Qty</th>
        <th style="padding:10px;text-align:right;">Price</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="2" style="padding:12px 10px;text-align:right;">Total:</td>
        <td style="padding:12px 10px;text-align:right;">${order.currency} $${order.total.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  <p style="margin-top:24px;color:#888;font-size:12px;">Questions? Reply to this email or visit <a href="https://cartographyprints.com">cartographyprints.com</a></p>
  <p style="color:#888;font-size:12px;">— Cartography Prints</p>
</body>
</html>`
}
