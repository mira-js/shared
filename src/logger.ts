// Structured JSON logger (ADR-021). Subpath-only (`@mira/shared-core/logger`):
// the root entry stays free of Node-only deps (ADR-019).
import pino from 'pino'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

// Mira's own destination type, so pino stays out of the public signature.
// Satisfied by process.stdout/process.stderr and by any `{ write(msg) {} }`.
export interface LogDestination {
  write(msg: string): void
}

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void
  info(msg: string, ctx?: Record<string, unknown>): void
  warn(msg: string, ctx?: Record<string, unknown>): void
  error(msg: string, ctx?: Record<string, unknown>): void
}

export interface CreateLoggerOptions {
  base?: Record<string, unknown>
  env?: Record<string, string | undefined>
  stdout?: LogDestination
  stderr?: LogDestination
}

const REDACT_KEYS = ['token', 'secret', 'authorization', 'password'] as const
const REDACT_PATHS = [...REDACT_KEYS, ...REDACT_KEYS.map((k) => `*.${k}`)]

const isDebugEnabled = (env: Record<string, string | undefined>): boolean =>
  env.NODE_ENV === 'development' || env.MIRA_DEBUG_LOGGING === 'true'

export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const env = opts.env ?? process.env
  const stdout = opts.stdout ?? process.stdout
  const stderr = opts.stderr ?? process.stderr

  const p = pino(
    {
      level: isDebugEnabled(env) ? 'debug' : 'info',
      base: opts.base ?? {},
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label: string) => ({ level: label }) },
      serializers: { err: pino.stdSerializers.err, error: pino.stdSerializers.err },
      redact: { paths: REDACT_PATHS },
    },
    // dedupe: true routes each line only to the highest-level matching stream,
    // so warn/error land on stderr only instead of on both streams.
    pino.multistream(
      [
        { level: 'debug', stream: stdout },
        { level: 'warn', stream: stderr },
      ],
      { dedupe: true },
    ),
  )

  // pino's second positional arg is a printf value, not merged fields, so
  // adapt Mira's (msg, ctx?) call signature to pino's (obj, msg).
  return {
    debug: (msg, ctx) => (ctx === undefined ? p.debug(msg) : p.debug(ctx, msg)),
    info: (msg, ctx) => (ctx === undefined ? p.info(msg) : p.info(ctx, msg)),
    warn: (msg, ctx) => (ctx === undefined ? p.warn(msg) : p.warn(ctx, msg)),
    error: (msg, ctx) => (ctx === undefined ? p.error(msg) : p.error(ctx, msg)),
  }
}

export const logger: Logger = createLogger()
