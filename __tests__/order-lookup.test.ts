/**
 * __tests__/order-lookup.test.ts
 * TDD: G4 — Order history via email (guest checkout)
 *
 * Tests for:
 *  - Verification code generation & validation
 *  - Order lookup (email + order ID)
 *  - Order data shape returned after verification
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Resend
// ---------------------------------------------------------------------------

const mockResendSend = vi.fn()
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockResendSend },
  })),
}))

// ---------------------------------------------------------------------------
// Mock verify-order API (we test the logic layer directly)
// ---------------------------------------------------------------------------

import {
  generateVerificationCode,
  isValidEmail,
  isValidOrderId,
  buildVerificationEmailHtml,
  buildOrderNotFoundHtml,
  buildOrderDetailsHtml,
  type OrderLookupResult,
} from '../src/order-lookup/index.js'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Order Lookup — Verification Code', () => {
  it('test_generates_6_digit_code', () => {
    const code = generateVerificationCode()
    expect(code).toMatch(/^\d{6}$/)
  })

  it('test_codes_are_unique_per_call', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateVerificationCode()))
    // At least 90% unique (allowing tiny collision probability)
    expect(codes.size).toBeGreaterThan(90)
  })
})

describe('Order Lookup — Validation', () => {
  it('test_valid_email_passes_validation', () => {
    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('user.name+tag@domain.co.uk')).toBe(true)
  })

  it('test_invalid_email_fails_validation', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('notanemail')).toBe(false)
    expect(isValidEmail('@nodomain.com')).toBe(false)
    expect(isValidEmail('noat.com')).toBe(false)
  })

  it('test_valid_order_id_passes_validation', () => {
    expect(isValidOrderId('CP-12345')).toBe(true)
    expect(isValidOrderId('CP-1')).toBe(true) // prefix + single digit
    expect(isValidOrderId('ORDERS-99')).toBe(true)
  })

  it('test_invalid_order_id_fails_validation', () => {
    expect(isValidOrderId('')).toBe(false)
    expect(isValidOrderId('TOOSHORT')).toBe(false) // no hyphen
    expect(isValidOrderId('CPX')).toBe(false) // no hyphen
    expect(isValidOrderId('CP-')).toBe(false) // no suffix
    expect(isValidOrderId('cp-12345')).toBe(false) // lowercase prefix
  })
})

describe('Order Lookup — Email Templates', () => {
  beforeEach(() => {
    mockResendSend.mockReset()
    mockResendSend.mockResolvedValue({ success: true, data: { id: 'msg_test' } })
  })

  it('test_verification_email_contains_6_digit_code', () => {
    const code = '123456'
    const html = buildVerificationEmailHtml(code, 'test@example.com')
    expect(html).toContain(code)
    expect(html).toContain('verification code')
    expect(html).toContain('test@example.com')
  })

  it('test_order_not_found_email_mentions_help', () => {
    const html = buildOrderNotFoundHtml('CP-NONEXISTENT', 'test@example.com')
    expect(html).toContain('CP-NONEXISTENT')
    expect(html.toLowerCase()).toContain('not found')
  })

  it('test_order_details_email_contains_order_id_and_items', () => {
    const mockOrder: OrderLookupResult = {
      id: 'CP-12345',
      customerEmail: 'test@example.com',
      customerName: 'Alice',
      status: 'processing',
      items: [
        { name: 'Vintage Map Print', quantity: 2, price: 49.99 },
        { name: 'Framed Panorama', quantity: 1, price: 129.00 },
      ],
      total: 228.98,
      currency: 'USD',
      orderDate: '2026-04-01',
    }

    const html = buildOrderDetailsHtml(mockOrder)
    expect(html).toContain('CP-12345')
    expect(html).toContain('Alice')
    expect(html).toContain('Vintage Map Print')
    expect(html).toContain('processing')
    expect(html).toContain('228.98')
  })

  it('test_order_details_email_shows_tracking_info_when_available', () => {
    const mockOrder: OrderLookupResult = {
      id: 'CP-12345',
      customerEmail: 'test@example.com',
      customerName: 'Alice',
      status: 'shipped',
      trackingNumber: '1Z999AA10123456784',
      trackingCarrier: 'UPS',
      trackingUrl: 'https://ups.com/track/1Z999AA10123456784',
      items: [{ name: 'Map Print', quantity: 1, price: 49.99 }],
      total: 49.99,
      currency: 'USD',
      orderDate: '2026-04-01',
    }

    const html = buildOrderDetailsHtml(mockOrder)
    expect(html).toContain('shipped')
    expect(html).toContain('1Z999AA10123456784')
    expect(html).toContain('UPS')
  })
})

describe('Order Lookup — Status Display', () => {
  it('test_all_order_statuses_render_correctly', () => {
    const statuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled']
    for (const status of statuses) {
      const mockOrder: OrderLookupResult = {
        id: `CP-${status.slice(0, 3)}`,
        customerEmail: 'test@example.com',
        customerName: 'Tester',
        status,
        items: [{ name: 'Item', quantity: 1, price: 10 }],
        total: 10,
        currency: 'USD',
        orderDate: '2026-04-01',
      }
      const html = buildOrderDetailsHtml(mockOrder)
      expect(html).toContain(status)
    }
  })
})
