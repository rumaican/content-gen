export class PinterestConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PinterestConfigError'
  }
}

export class PinterestAuthError extends Error {
  code: 'AUTH_REJECTED' | 'CHECKPOINT_REQUIRED'

  constructor(message: string, code: 'AUTH_REJECTED' | 'CHECKPOINT_REQUIRED' = 'AUTH_REJECTED') {
    super(message)
    this.name = 'PinterestAuthError'
    this.code = code
  }
}

export interface PinterestCredentials {
  email: string
  password: string
}

export interface PinterestSession {
  sessionId?: string
  accountId?: string
  cookies?: Array<{ name: string; value: string }>
  state?: Record<string, unknown>
}

export interface PinterestLoginTransport {
  login(credentials: PinterestCredentials): Promise<PinterestSession>
}

export interface PinterestLogger {
  error?: (message: string, meta?: Record<string, unknown>) => void
  warn?: (message: string, meta?: Record<string, unknown>) => void
  info?: (message: string, meta?: Record<string, unknown>) => void
}

export type PinterestAuthResult =
  | { ok: true; code: 'AUTHENTICATED'; message: string; session: PinterestSession }
  | { ok: false; code: 'CONFIG_ERROR' | 'AUTH_REJECTED' | 'CHECKPOINT_REQUIRED'; message: string; error: Error }

function safeValue(value?: string): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function getPinterestCredentials(env: NodeJS.ProcessEnv = process.env): PinterestCredentials {
  const email = safeValue(env.PINTEREST_EMAIL)
  const password = safeValue(env.PINTEREST_PASSWORD)
  const missing: string[] = []

  if (!email) missing.push('PINTEREST_EMAIL')
  if (!password) missing.push('PINTEREST_PASSWORD')

  if (missing.length > 0) {
    throw new PinterestConfigError(
      `Pinterest auth is not configured. Missing environment variables: ${missing.join(', ')}.`
    )
  }

  return { email, password }
}

export function redactSecret(input: string, credentials?: Partial<PinterestCredentials>): string {
  let output = input

  if (credentials?.email) {
    output = output.split(credentials.email).join('[REDACTED_EMAIL]')
  }

  if (credentials?.password) {
    output = output.split(credentials.password).join('[REDACTED_PASSWORD]')
  }

  return output
}

function getFailureCode(error: unknown): 'AUTH_REJECTED' | 'CHECKPOINT_REQUIRED' {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes('checkpoint') || message.includes('challenge')) {
    return 'CHECKPOINT_REQUIRED'
  }

  return 'AUTH_REJECTED'
}

export async function authenticatePinterest(options: {
  transport: PinterestLoginTransport
  logger?: PinterestLogger
  env?: NodeJS.ProcessEnv
}): Promise<PinterestAuthResult> {
  let credentials: PinterestCredentials

  try {
    credentials = getPinterestCredentials(options.env)
  } catch (error) {
    const configError = error instanceof Error ? error : new PinterestConfigError('Pinterest auth is not configured.')
    return {
      ok: false,
      code: 'CONFIG_ERROR',
      message: configError.message,
      error: configError,
    }
  }

  try {
    const session = await options.transport.login(credentials)

    return {
      ok: true,
      code: 'AUTHENTICATED',
      message: 'Pinterest login succeeded.',
      session,
    }
  } catch (error) {
    const failureCode = getFailureCode(error)
    const safeMessage = redactSecret(error instanceof Error ? error.message : String(error), credentials)
    const authError = new PinterestAuthError('Pinterest login failed. Check configured credentials or account status.', failureCode)

    options.logger?.error?.('Pinterest authentication failed', {
      code: failureCode,
      detail: safeMessage,
      email: '[REDACTED_EMAIL]',
      password: '[REDACTED_PASSWORD]',
    })

    return {
      ok: false,
      code: failureCode,
      message: authError.message,
      error: authError,
    }
  }
}
