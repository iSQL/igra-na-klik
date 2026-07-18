// File-based logging for Grafana/Loki, mirroring the GradNaDlanu (zabari.net)
// setup: daily-rolling JSON log files under LOG_DIR that a Loki collector on
// the Coolify host tails. The server still logs to stdout (docker logs) exactly
// as before — this module ADDITIONALLY tees every console.* line into the
// rolling file, so no existing console.log call has to be rewritten.
//
// Coolify wiring (matches zabari.net): mount the host dir
//   /var/lib/coolify/storage/logs/igra-na-klik  ->  /storage/logs
// and Grafana reads the files from there. See docker-compose.yml.

import { createWriteStream, mkdirSync, readdirSync, unlinkSync, accessSync, constants, type WriteStream } from 'fs';
import path from 'path';
import util from 'util';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';

// Where the daily log files live. Prod defaults to the /storage/logs mount
// point; dev writes to a gitignored repo-root storage/logs folder so you can
// tail the same format locally. An explicit LOG_DIR always wins.
function readLogDir(): string {
  const v = process.env.LOG_DIR?.trim();
  if (v) return v;
  if (isProduction) return '/storage/logs';
  // dist/ and src/ are both packages/server/<x>, so ../../../ is the repo root.
  return path.resolve(__dirname, '../../../storage/logs');
}

// How many days of log files to keep. Older ones get unlinked on rotation.
function readRetentionDays(): number {
  const v = process.env.LOG_RETENTION_DAYS;
  if (!v) return 7;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return 7;
  return Math.floor(n);
}

// Resolved lazily in initFileLogging() — NOT at module load. ESM imports are
// hoisted, so a top-level read here would run before index.ts calls
// dotenv.config() and miss a dev .env LOG_DIR. (Coolify injects real env vars
// before Node starts, so prod is unaffected either way.)
let LOG_DIR = '';
let RETENTION_DAYS = 7;
const PREFIX = 'igra';

// UTC date stamp (YYYY-MM-DD) — rotation keyed on this so a file never spans
// two calendar days regardless of the server's timezone.
function dayStamp(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function fileFor(stamp: string): string {
  return path.join(LOG_DIR, `${PREFIX}${stamp}.log`);
}

/**
 * A daily-rolling append stream. Rotation is lazy (checked before each write),
 * so there's no timer to leak. On each rotation, files older than the
 * retention window are unlinked. Returns null if the directory can't be
 * written — the caller then degrades to stdout-only.
 */
function createRollingFileStream(): { write(line: string): void; close(): void } | null {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    // Fail loudly here (not on first write) if the dir isn't writable.
    accessSync(LOG_DIR, constants.W_OK);
  } catch (err) {
    return null;
  }

  let stamp = dayStamp();
  let stream: WriteStream = openStream(stamp);

  function openStream(s: string): WriteStream {
    const ws = createWriteStream(fileFor(s), { flags: 'a' });
    // Async write errors must not crash the process — report to the real
    // stderr and carry on (disk full, volume unmounted mid-run, etc.).
    ws.on('error', (e) => {
      originalConsole.error(`[log] write error: ${(e as Error).message}`);
    });
    return ws;
  }

  function prune(): void {
    try {
      const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
      for (const name of readdirSync(LOG_DIR)) {
        if (!name.startsWith(PREFIX) || !name.endsWith('.log')) continue;
        const s = name.slice(PREFIX.length, name.length - '.log'.length);
        const t = Date.parse(s);
        if (Number.isFinite(t) && t < cutoff) {
          try {
            unlinkSync(path.join(LOG_DIR, name));
          } catch {
            /* best effort */
          }
        }
      }
    } catch {
      /* best effort */
    }
  }

  function rotateIfNeeded(): void {
    const now = dayStamp();
    if (now === stamp) return;
    stream.end();
    stamp = now;
    stream = openStream(stamp);
    prune();
  }

  prune(); // drop stale files from previous runs at startup

  return {
    write(line: string) {
      rotateIfNeeded();
      stream.write(line);
    },
    close() {
      stream.end();
    },
  };
}

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

let fileSink: ReturnType<typeof createRollingFileStream> = null;

function writeRecord(level: string, args: unknown[]): void {
  if (!fileSink) return;
  const msg = util.format(...(args as [unknown, ...unknown[]]));
  const record = JSON.stringify({ time: new Date().toISOString(), level, msg }) + '\n';
  fileSink.write(record);
}

// ---------------------------------------------------------------------------
// Structured event logging
//
// For key lifecycle events (games starting/ending, rooms, capacity limits) we
// emit ONE JSON record with named fields instead of a free-text string, so
// Grafana/Loki can filter and aggregate on them (e.g. count game_started by
// `game`, alert on `server_full`). These go straight to the rolling file AND a
// compact readable line on stdout — they do NOT pass through the console tee,
// so there's no double-encoding.
// ---------------------------------------------------------------------------

type LogLevel = 'info' | 'warn' | 'error';
type LogFields = Record<string, unknown>;

function emitEvent(level: LogLevel, event: string, fields?: LogFields): void {
  const record = { time: new Date().toISOString(), level, event, ...fields };
  if (fileSink) fileSink.write(JSON.stringify(record) + '\n');
  const tail = fields && Object.keys(fields).length ? ' ' + JSON.stringify(fields) : '';
  const sink = level === 'error' ? originalConsole.error : level === 'warn' ? originalConsole.warn : originalConsole.log;
  sink(`[${event}]${tail}`);
}

export const logger = {
  info: (event: string, fields?: LogFields) => emitEvent('info', event, fields),
  warn: (event: string, fields?: LogFields) => emitEvent('warn', event, fields),
  error: (event: string, fields?: LogFields) => emitEvent('error', event, fields),
};

/**
 * Initialise file logging and tee console.* into the rolling file. Idempotent
 * and safe to call before anything else logs. If the log dir isn't writable it
 * degrades to stdout-only with a single warning — the server still boots.
 */
export function initFileLogging(): void {
  if (fileSink) return; // already initialised
  LOG_DIR = readLogDir();
  RETENTION_DAYS = readRetentionDays();
  fileSink = createRollingFileStream();
  if (!fileSink) {
    originalConsole.warn(`[log] file logging disabled (${LOG_DIR} not writable) — stdout only`);
    return;
  }

  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    writeRecord('info', args);
  };
  console.info = (...args: unknown[]) => {
    originalConsole.info(...args);
    writeRecord('info', args);
  };
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    writeRecord('warn', args);
  };
  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    writeRecord('error', args);
  };
  console.debug = (...args: unknown[]) => {
    originalConsole.debug(...args);
    if (!isProduction) writeRecord('debug', args);
  };

  originalConsole.log(`[log] file logging → ${LOG_DIR} (${PREFIX}${dayStamp()}.log, retention ${RETENTION_DAYS}d)`);

  // Flush on shutdown so the last lines aren't lost.
  const close = () => fileSink?.close();
  process.once('exit', close);
  process.once('SIGINT', () => {
    close();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    close();
    process.exit(0);
  });

  // Capture crashes in the log file — otherwise a fatal error only hits the
  // container's stdout and vanishes on restart, invisible in Grafana. An
  // uncaught exception leaves the process in an undefined state, so we log,
  // flush, and exit (restart: unless-stopped brings it back).
  process.on('uncaughtException', (err) => {
    logger.error('uncaught_exception', { message: err.message, stack: err.stack });
    close();
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    logger.error('unhandled_rejection', { message: err.message, stack: err.stack });
  });
}
