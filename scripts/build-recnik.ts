/**
 * Gradi srpski rečnik za igre sa rečima:
 *
 *   npx tsx scripts/build-recnik.ts [minFreq]
 *
 * Postupak (sve offline, ništa od ovoga ne ide u produkciju):
 *   1. Skine frekvencijsku listu iz OpenSubtitles korpusa — odličan obuhvat,
 *      ali sadrži OCR greške, imena, ijekavicu i nasumične nizove slova.
 *   2. Skine hunspell rečnik za srpski (latinica) iz LibreOffice repozitorijuma.
 *   3. Provuče svaku reč iz korpusa kroz hunspell i zadrži samo prihvaćene.
 *
 * Zašto ovako, a ne hunspell direktno u serveru: `nspell` sa ovim rečnikom
 * troši ~430 MB heapa i 5s na učitavanje. Gotova lista je 2,5 MB na disku i
 * ~16 MB u memoriji, uz proveru u konstantnom vremenu.
 *
 * Licence oba izvora i licenca izvedene liste: vidi LICENSE.md (NOTICE).
 * Zahteva `nspell` (root devDependency) i mrežu pri prvom pokretanju.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — nspell nema tipove
import nspell from 'nspell';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.recnik-cache');
const OUT = join(ROOT, 'packages/server/assets/recnik/sr-recnik.txt');

const SOURCES = {
  frekvencije:
    'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/sr/sr_full.txt',
  dic: 'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/sr/sr-Latn.dic',
  aff: 'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/sr/sr-Latn.aff',
};

/** Samo srpska latinica; 2–16 slova (duže su gotovo uvek smeće iz korpusa). */
const VALIDNA_REC = /^[a-zčćđšž]{2,16}$/;

async function preuzmi(naziv: string, url: string): Promise<Buffer> {
  const putanja = join(CACHE, naziv);
  if (existsSync(putanja)) {
    console.log(`  ${naziv} — iz keša`);
    return readFileSync(putanja);
  }
  console.log(`  ${naziv} — preuzimam…`);
  const odgovor = await fetch(url);
  if (!odgovor.ok) {
    throw new Error(`Ne mogu da preuzmem ${url}: HTTP ${odgovor.status}`);
  }
  const buf = Buffer.from(await odgovor.arrayBuffer());
  writeFileSync(putanja, buf);
  return buf;
}

async function main(): Promise<void> {
  const minFreq = Number(process.argv[2] ?? 5);
  if (!Number.isFinite(minFreq) || minFreq < 1) {
    throw new Error('minFreq mora biti broj >= 1');
  }

  mkdirSync(CACHE, { recursive: true });
  console.log('Izvori:');
  const [frekvencije, dic, aff] = await Promise.all([
    preuzmi('sr_full.txt', SOURCES.frekvencije),
    preuzmi('sr-Latn.dic', SOURCES.dic),
    preuzmi('sr-Latn.aff', SOURCES.aff),
  ]);

  // 1) Korpus → kandidati.
  const kandidati: string[] = [];
  for (const linija of frekvencije.toString('utf8').split('\n')) {
    const razmak = linija.indexOf(' ');
    if (razmak < 1) continue;
    const rec = linija.slice(0, razmak);
    if (Number(linija.slice(razmak + 1)) < minFreq) continue;
    if (!VALIDNA_REC.test(rec)) continue;
    kandidati.push(rec);
  }
  console.log(`\nKorpus (učestalost >= ${minFreq}): ${kandidati.length} kandidata`);

  // 2) Hunspell kao filter kvaliteta.
  console.log('Učitavam hunspell rečnik (traje nekoliko sekundi, ~400 MB)…');
  const provera = nspell(aff, dic);
  const zadrzane = kandidati.filter((rec: string) => provera.correct(rec));
  zadrzane.sort();

  const procenat = ((zadrzane.length / kandidati.length) * 100).toFixed(0);
  console.log(`Hunspell prihvatio: ${zadrzane.length} (${procenat}%)`);

  mkdirSync(dirname(OUT), { recursive: true });
  const sadrzaj = zadrzane.join('\n');
  writeFileSync(OUT, sadrzaj, 'utf8');
  console.log(
    `\nUpisano: ${OUT}\n` +
      `  ${zadrzane.length} reči · ${(sadrzaj.length / 1e6).toFixed(2)} MB`
  );
  console.log(
    '\nKeš izvora je u .recnik-cache/ (gitignore-ovan) — obriši ga da bi se izvori ponovo preuzeli.'
  );
}

main().catch((greska) => {
  console.error(greska);
  process.exit(1);
});
