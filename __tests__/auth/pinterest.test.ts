import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Pinterest auth', () => {
  const REAL_ENV = { ...process.env }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...REAL_ENV }
  })

  afterEach(() => {
    process.env = REAL_ENV
    vi.restoreAllMocks()
  })

  it('returns_config_error_when_pinterest_email_missing', async () => {
    delete process.env.PINTEREST_EMAIL
    process.env.PINTEREST_PASSWORD = 'super-secret-password'

    const { authenticatePinterest, PinterestConfigError } = await import('../../src/auth/pinterest.js')

    const result = await authenticatePinterest({
      transport: {
        login: vi.fn(),
      },
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(PinterestConfigError)
    expect(result.message).toContain('PINTEREST_EMAIL')
    expect(result.message).not.toContain('super-secret-password')
  })

  it('returns_config_error_when_pinterest_password_missing', async () => {
    process.env.PINTEREST_EMAIL = 'creator@example.com'
    delete process.env.PINTEREST_PASSWORD

    const { authenticatePinterest, PinterestConfigError } = await import('../../src/auth/pinterest.js')

    const result = await authenticatePinterest({
      transport: {
        login: vi.fn(),
      },
    })

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(PinterestConfigError)
    expect(result.message).toContain('PINTEREST_PASSWORD')
    expect(result.message).not.toContain('creator@example.com')
  })

  it('returns_authenticated_result_when_login_succeeds', async () => {
    process.env.PINTEREST_EMAIL = 'creator@example.com'
    process.env.PINTEREST_PASSWORD = 'super-secret-password'

    const login = vi.fn().mockResolvedValue({
      sessionId: 'session-123',
      accountId: 'acct-123',
      cookies: [{ name: 'sid', value: 'cookie-value' }],
    })

    const { authenticatePinterest } = await import('../../src/auth/pinterest.js')

    const result = await authenticatePinterest({ transport: { login } })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected success result')
    expect(login).toHaveBeenCalledWith({
      email: 'creator@example.com',
      password: 'super-secret-password',
    })
    expect(result.session.sessionId).toBe('session-123')
    expect(result.session.accountId).toBe('acct-123')
  })

  it('returns_safe_failure_when_login_rejected', async () => {
    process.env.PINTEREST_EMAIL = 'creator@example.com'
    process.env.PINTEREST_PASSWORD = 'wrong-password'

    const login = vi.fn().mockRejectedValue(new Error('Pinterest rejected credentials for creator@example.com / wrong-password'))
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }

    const { authenticatePinterest } = await import('../../src/auth/pinterest.js')

    const result = await authenticatePinterest({
      transport: { login },
      logger,
    })

    expect(result.ok).toBe(false)
    expect(result.code).toBe('AUTH_REJECTED')
    expect(result.message).toContain('Pinterest login failed')
    expect(result.message).not.toContain('wrong-password')
    expect(result.message).not.toContain('creator@example.com')
    expect(logger.error).toHaveBeenCalledOnce()
    expect(result.error).toBeInstanceOf(Error)
  })

  it('does_not_log_secret_values_on_auth_failure', async () => {
    process.env.PINTEREST_EMAIL = 'creator@example.com'
    process.env.PINTEREST_PASSWORD = 'super-secret-password'

    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
    const login = vi.fn().mockRejectedValue(
      new Error('checkpoint for creator@example.com using password super-secret-password')
    )

    const { authenticatePinterest } = await import('../../src/auth/pinterest.js')

    await authenticatePinterest({
      transport: { login },
      logger,
    })

    const loggedPayload = JSON.stringify(logger.error.mock.calls[0] ?? [])
    expect(loggedPayload).not.toContain('creator@example.com')
    expect(loggedPayload).not.toContain('super-secret-password')
    expect(loggedPayload).toContain('[REDACTED_EMAIL]')
    expect(loggedPayload).toContain('[REDACTED_PASSWORD]')
  })
})
