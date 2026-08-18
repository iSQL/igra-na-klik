// Oslobađa dev portove (3001 server, 5173 host, 5174 controller).
//
// Zašto: oba Vite configa koriste `strictPort: true`, a Express sluša na
// fiksnom 3001 — kad prethodni `npm run dev` ne ugasi svoje node procese,
// sledeći pada sa `EADDRINUSE`. Ovde je jedno mesto koje zna kako se na
// Windows-u i na POSIX-u nađe vlasnik porta, pa ga koriste i `predev`
// provera i sam server kad prijavi zauzet port.
//
// Upotreba:
//   node scripts/free-ports.mjs            # ubija ono što drži podrazumevane portove
//   node scripts/free-ports.mjs 3000 3001  # samo navedene portove
//   node scripts/free-ports.mjs --check    # samo prijavi, ništa ne ubija

import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

export const DEFAULT_PORTS = [3001, 5173, 5174];

const isWindows = process.platform === 'win32';

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // Nema pogodaka (lsof/netstat vraćaju nenulti kod) ili alat ne postoji.
    return '';
  }
}

/** PID-ovi procesa koji SLUŠAJU na datom portu (prazan niz = port je slobodan). */
export function listenerPids(port) {
  const pids = new Set();
  if (isWindows) {
    for (const line of run('netstat', ['-ano', '-p', 'TCP']).split('\n')) {
      if (!/\bLISTENING\b/.test(line)) continue;
      const cols = line.trim().split(/\s+/);
      const local = cols[1] ?? '';
      // Poklapa i 0.0.0.0:3001 i [::]:3001, ali ne 13001 ni :30011.
      if (!local.endsWith(`:${port}`)) continue;
      const pid = Number(cols[cols.length - 1]);
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
  } else {
    for (const raw of run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).split('\n')) {
      const pid = Number(raw.trim());
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
  }
  return [...pids];
}

/** Portovi iz liste na kojima nešto sluša. */
export function busyPorts(ports = DEFAULT_PORTS) {
  return ports.filter((p) => listenerPids(p).length > 0);
}

/** Komanda koju korisnik može da nalepi da oslobodi date portove. */
export function freeCommand(ports = DEFAULT_PORTS) {
  const same =
    ports.length === DEFAULT_PORTS.length &&
    ports.every((p, i) => p === DEFAULT_PORTS[i]);
  return same ? 'npm run free-ports' : `npm run free-ports -- ${ports.join(' ')}`;
}

function kill(pid) {
  try {
    if (isWindows) {
      execFileSync('taskkill', ['/PID', String(pid), '/F', '/T'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
    return true;
  } catch {
    return false;
  }
}

function main(argv) {
  const checkOnly = argv.includes('--check');
  const ports = argv
    .filter((a) => /^\d+$/.test(a))
    .map(Number)
    .filter((p) => p > 0 && p < 65536);
  const targets = ports.length > 0 ? ports : DEFAULT_PORTS;

  if (checkOnly) {
    const busy = busyPorts(targets);
    if (busy.length === 0) {
      console.log(`free-ports: slobodni su ${targets.join(', ')}`);
      return 0;
    }
    console.log(`\n  ⚠ Zauzeti portovi: ${busy.join(', ')} — verovatno stari dev proces.`);
    console.log(`     Ugasi ga sa:  ${freeCommand(busy)}\n`);
    return 0;
  }

  let failed = false;
  for (const port of targets) {
    const pids = listenerPids(port);
    if (pids.length === 0) {
      console.log(`Port ${port}: slobodan`);
      continue;
    }
    for (const pid of pids) {
      if (kill(pid)) {
        console.log(`Port ${port}: ugašen PID ${pid}`);
      } else {
        console.log(`Port ${port}: NEUSPELO gašenje PID ${pid} (možda traži admin prava)`);
        failed = true;
      }
    }
  }

  const still = busyPorts(targets);
  if (still.length > 0) {
    console.log(`\nJoš uvek zauzeto: ${still.join(', ')}`);
    return 1;
  }
  console.log('\nSvi traženi portovi su slobodni.');
  return failed ? 1 : 0;
}

// Pokrenut direktno (a ne importovan iz dev-clean.mjs) → radi posao.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
