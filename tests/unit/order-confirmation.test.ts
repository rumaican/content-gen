/**
 * order-confirmation.test.ts — Unit tests for order confirmation email functionality.
 *
 * Tests lib/email.ts sendOrderConfirmation() using the existing resend-client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendOrderConfirmation, type OrderData } from '../../src/lib/email/order-confirmation.js';
import * as resendClient from '../../lib/email/resend-client.js';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeOrder(overrides: Partial<OrderData> = {}): OrderData {
  return {
    id: 'ORD-001',
    customerEmail: 'jane.doe@example.com',
    customerName: 'Jane Doe',
    items: [
      { name: 'Vintage Map Poster — Paris', quantity: 1, price: 49.99 },
      { name: 'Vintage Map Poster — Tokyo', quantity: 2, price: 59.99 },
    ],
    total: 169.97,
    currency: 'USD',
    orderDate: '2026-04-04T12:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.RESEND_API_KEY = 'test-resend-api-key';
  process.env.RESEND_FROM_EMAIL = 'Cartography Prints <noreply@cartographyprints.com>';
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// sendOrderConfirmation_calls_Resend_with_correct_to_address
// ---------------------------------------------------------------------------

describe('sendOrderConfirmation', () => {
  it('sendOrderConfirmation_calls_Resend_with_correct_to_address', async () => {
    const sendEmailSpy = vi.spyOn(resendClient, 'sendEmail').mockResolvedValue({
      success: true,
      data: { id: 'email_test_001' },
    });

    const order = makeOrder({ customerEmail: 'jane.doe@example.com' });
    await sendOrderConfirmation(order);

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    const call = sendEmailSpy.mock.calls[0][0];
    expect(call.to).toBe('jane.doe@example.com');
  });

  it('sendOrderConfirmation_includes_order_ID_in_email_subject', async () => {
    const sendEmailSpy = vi.spyOn(resendClient, 'sendEmail').mockResolvedValue({
      success: true,
      data: { id: 'email_test_002' },
    });

    const order = makeOrder({ id: 'ORD-12345' });
    await sendOrderConfirmation(order);

    const call = sendEmailSpy.mock.calls[0][0];
    expect(call.subject).toContain('ORD-12345');
    expect(call.subject).toMatch(/Your order confirmation/i);
  });

  it('sendOrderConfirmation_includes_items_and_total', async () => {
    const sendEmailSpy = vi.spyOn(resendClient, 'sendEmail').mockResolvedValue({
      success: true,
      data: { id: 'email_test_003' },
    });

    const order = makeOrder({
      items: [
        { name: 'Vintage Map — Paris', quantity: 1, price: 49.99 },
        { name: 'Vintage Map — Tokyo', quantity: 2, price: 59.99 },
      ],
      total: 169.97,
    });
    await sendOrderConfirmation(order);

    const call = sendEmailSpy.mock.calls[0][0];
    expect(call.html).toContain('Vintage Map — Paris');
    expect(call.html).toContain('Vintage Map — Tokyo');
    expect(call.html).toContain('169.97');
    expect(call.html).toContain('USD');
  });

  it('sendOrderConfirmation_does_not_throw_on_Resend_error', async () => {
    const sendEmailSpy = vi.spyOn(resendClient, 'sendEmail').mockResolvedValue({
      success: false,
      error: { message: 'Rate limit exceeded' },
    });

    const order = makeOrder();
    // Should not throw — error is non-blocking per AC
    await expect(sendOrderConfirmation(order)).resolves.toBeUndefined();
  });

  it('sendOrderConfirmation_returns_Promise', async () => {
    vi.spyOn(resendClient, 'sendEmail').mockResolvedValue({
      success: true,
      data: { id: 'email_test_005' },
    });

    const order = makeOrder();
    const result = sendOrderConfirmation(order);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });

  it('sendOrderConfirmation_uses_correct_from_address', async () => {
    const sendEmailSpy = vi.spyOn(resendClient, 'sendEmail').mockResolvedValue({
      success: true,
      data: { id: 'email_test_006' },
    });

    const order = makeOrder();
    await sendOrderConfirmation(order);

    const call = sendEmailSpy.mock.calls[0][0];
    expect(call.from).toBe('Cartography Prints <noreply@cartographyprints.com>');
  });

  it('sendOrderConfirmation_addressed_to_exact_email_from_order', async () => {
    const sendEmailSpy = vi.spyOn(resendClient, 'sendEmail').mockResolvedValue({
      success: true,
      data: { id: 'email_test_007' },
    });

    const order = makeOrder({ customerEmail: 'specific@customer.com' });
    await sendOrderConfirmation(order);

    const call = sendEmailSpy.mock.calls[0][0];
    expect(call.to).toBe('specific@customer.com');
  });

  it('sendOrderConfirmation_includes_order_ID_in_body', async () => {
    const sendEmailSpy = vi.spyOn(resendClient, 'sendEmail').mockResolvedValue({
      success: true,
      data: { id: 'email_test_008' },
    });

    const order = makeOrder({ id: 'ORD-999' });
    await sendOrderConfirmation(order);

    const call = sendEmailSpy.mock.calls[0][0];
    expect(call.html).toContain('ORD-999');
  });
});
