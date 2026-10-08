import type {
  PotegniBot,
  PotegniMode,
  PotegniPredmet,
  PotegniTezina,
} from '../types/povuci-potegni.js';

/** Koliko jedan tačan odgovor pomera čvor (od 100 do crte), pre deljenja sa brojem igrača u timu. */
export const POTEGNI_KORAK = 20;
/** Netačan odgovor daje protivniku ovaj deo sopstvenog koraka. */
export const POTEGNI_KAZNA_UDEO = 0.5;
/** Blokada posle netačnog odgovora. */
export const POTEGNI_BLOKADA_MS = 3000;
/** Koliko bot vuče po potezu (kao jedan igrač, bez deljenja). */
export const POTEGNI_BOT_KORAK = 12;
/** Razmak između botovih poteza. */
export const POTEGNI_BOT_MS: Record<PotegniBot, number> = {
  lak: 4200,
  srednji: 2800,
  tezak: 1800,
};
/** Izbor timova se sam zatvara posle ovoliko sekundi, ako niko ne pokrene. */
export const POTEGNI_TIMOVI_SEKUNDI = 60;

export const POTEGNI_TRAJANJA = [120, 180, 300] as const;
export const POTEGNI_TRAJANJE_DEFAULT = 180;
export const POTEGNI_PREDMETI: PotegniPredmet[] = ['matematika', 'fizika', 'hemija'];

export const POTEGNI_PREDMET_LABEL: Record<PotegniPredmet, string> = {
  matematika: '➗ Matematika',
  fizika: '⚡ Fizika',
  hemija: '⚗️ Hemija',
};
export const POTEGNI_TEZINA_LABEL: Record<PotegniTezina, string> = {
  osnovna: 'Osnovna škola',
  srednja: 'Srednja škola',
  mesovito: 'Mešovito',
};
export const POTEGNI_BOT_LABEL: Record<PotegniBot, string> = {
  lak: 'Lak',
  srednji: 'Srednji',
  tezak: 'Težak',
};

export function clampPotegniMode(raw: unknown): PotegniMode {
  return raw === 'solo' ? 'solo' : 'timovi';
}

export function clampPotegniTezina(raw: unknown): PotegniTezina {
  return raw === 'osnovna' || raw === 'mesovito' ? raw : 'srednja';
}

export function clampPotegniBot(raw: unknown): PotegniBot {
  return raw === 'lak' || raw === 'tezak' ? raw : 'srednji';
}

export function clampPotegniTrajanje(raw: unknown): number {
  return (POTEGNI_TRAJANJA as readonly number[]).includes(raw as number)
    ? (raw as number)
    : POTEGNI_TRAJANJE_DEFAULT;
}

/** Prazan ili neispravan izbor = sva tri predmeta (mešano). */
export function clampPotegniPredmeti(raw: unknown): PotegniPredmet[] {
  if (!Array.isArray(raw)) return [...POTEGNI_PREDMETI];
  const picked = POTEGNI_PREDMETI.filter((p) => raw.includes(p));
  return picked.length > 0 ? picked : [...POTEGNI_PREDMETI];
}

/** „Mešano · Srednja škola" — podnaslov na TV-u i telefonu. */
export function potegniOpis(predmeti: PotegniPredmet[], tezina: PotegniTezina): string {
  const predmet =
    predmeti.length === 1
      ? POTEGNI_PREDMET_LABEL[predmeti[0]].replace(/^\S+\s/, '')
      : predmeti.length === POTEGNI_PREDMETI.length
        ? 'Mešano'
        : predmeti.map((p) => POTEGNI_PREDMET_LABEL[p].replace(/^\S+\s/, '')).join(' + ');
  return `${predmet} · ${POTEGNI_TEZINA_LABEL[tezina]}`;
}

const RAZLOMCI: Record<number, string> = { 1: '1', 2: '½', 3: '⅓', 4: '¼', 5: '⅕', 6: '⅙', 8: '⅛' };

/** Korak tima kao razlomak: 4 igrača → „¼". */
export function potegniUdeo(n: number): string {
  return RAZLOMCI[n] ?? `1/${n}`;
}

/** Normalizuje unos sa tastature („20,5" → 20.5); NaN ako nije broj. */
export function parsePotegniBroj(raw: string): number {
  const s = raw.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

/** Broj za prikaz sa decimalnim zarezom: 58.5 → „58,5". */
export function formatPotegniBroj(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return String(r).replace('.', ',');
}
