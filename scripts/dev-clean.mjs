// Briše host/controller dist/ pre `npm run dev`.
//
// Zašto uopšte postoji: Express bira režim po tome da li
// `packages/<pkg>/dist/index.html` postoji — ako postoji, servira taj
// statički bandl i uopšte ne proksira na Vite. Posle jednog `npm run build`
// `localhost:3001/play/` zauvek servira zamrznut kod, Vite radi u prazno, a
// izgleda kao da izmene "ne rade". Ovaj korak čini to nemogućim: dev uvek
// kreće iz stanja u kom dist ne postoji.
//
// Bandl se vraća običnim `npm run build` (dist/ je gitignore-ovan).

import { existsSync, rmSync } from 'fs';
import { busyPorts, freeCommand, DEFAULT_PORTS } from './free-ports.mjs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

for (const pkg of ['host', 'controller']) {
  const dir = path.join(root, 'packages', pkg, 'dist');
  if (!existsSync(dir)) continue;
  rmSync(dir, { recursive: true, force: true });
  console.log(`dev-clean: uklonjen packages/${pkg}/dist (dev ide preko Vite-a)`);
}

// Zauzet port je druga česta smrt `npm run dev`-a (Express na 3001, oba Vite-a
// sa strictPort). Ovde se samo prijavi i ponudi komanda — ubijanje tuđih
// procesa bez pitanja nije posao pre-dev koraka.
const busy = busyPorts(DEFAULT_PORTS);
if (busy.length > 0) {
  console.log(`
  ⚠ Zauzeti dev portovi: ${busy.join(', ')} — verovatno stari dev proces.`);
  console.log(`     Ugasi ga pa probaj opet:  ${freeCommand(busy)}
`);
}
