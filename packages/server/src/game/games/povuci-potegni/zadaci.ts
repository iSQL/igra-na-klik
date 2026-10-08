import type { PotegniPredmet, PotegniTezina } from '@igra/shared';
import { formatPotegniBroj } from '@igra/shared';

/**
 * Generator zadataka za Povuci-potegni. Sve se pravi na licu mesta, pa nema
 * paketa ni ponavljanja posle par minuta. Brojevi su birani tako da rezultat
 * bude ceo (ili sa jednom-dve decimale) i pozitivan — tastatura na telefonu
 * nema minus.
 *
 * Odgovor ostaje ovde: telefon dobija samo `tekst`/`podtekst`/`jedinica` i,
 * kod izbora, izmešane `opcije`.
 */
export interface GenZadatak {
  predmet: PotegniPredmet;
  tekst: string;
  podtekst?: string;
  jedinica?: string;
  opcije?: string[];
  /** Broj za tastaturu, ili tačna ponuda (string) za izbor. */
  odgovor: number | string;
}

type Nivo = 'osnovna' | 'srednja';
type Rnd = () => number;
type Gen = (r: Rnd) => GenZadatak;

const int = (r: Rnd, a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const pick = <T,>(r: Rnd, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
const broj = formatPotegniBroj;

function shuffle<T>(r: Rnd, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Izbor: tačan + tri različita mamca, izmešano. */
function izbor(
  r: Rnd,
  predmet: PotegniPredmet,
  tekst: string,
  tacno: string,
  mamci: readonly string[],
  podtekst?: string
): GenZadatak {
  const ostali = shuffle(r, [...new Set(mamci)].filter((m) => m !== tacno)).slice(0, 3);
  return { predmet, tekst, podtekst, opcije: shuffle(r, [tacno, ...ostali]), odgovor: tacno };
}

/** Brojčani mamci oko tačnog rezultata (za izbor kod brojeva). */
function blizu(r: Rnd, n: number, korak = 1): string[] {
  const set = new Set<number>();
  const pomaci = shuffle(r, [-3, -2, -1, 1, 2, 3, 10, -10]);
  for (const p of pomaci) {
    const v = n + p * korak;
    if (v > 0 && v !== n) set.add(v);
    if (set.size >= 3) break;
  }
  return [...set].map(broj);
}

// --- Matematika ------------------------------------------------------------

const MAT_OSNOVNA: Gen[] = [
  (r) => {
    const a = int(r, 6, 12), b = int(r, 3, 12);
    return { predmet: 'matematika', tekst: `${a} × ${b} = ?`, odgovor: a * b };
  },
  (r) => {
    const a = int(r, 120, 480), b = int(r, 105, 470);
    return { predmet: 'matematika', tekst: `${a} + ${b} = ?`, odgovor: a + b };
  },
  (r) => {
    const a = int(r, 300, 900), b = int(r, 45, a - 50);
    return { predmet: 'matematika', tekst: `${a} − ${b} = ?`, odgovor: a - b };
  },
  (r) => {
    const b = int(r, 3, 9), q = int(r, 4, 15);
    return { predmet: 'matematika', tekst: `${b * q} : ${b} = ?`, odgovor: q };
  },
  (r) => {
    const a = int(r, 2, 20), b = int(r, 2, 9), c = int(r, 2, 9);
    return { predmet: 'matematika', tekst: `${a} + ${b} × ${c} = ?`, odgovor: a + b * c };
  },
  (r) => {
    const x = int(r, 3, 40), a = int(r, 5, 60);
    return { predmet: 'matematika', tekst: `x + ${a} = ${x + a}`, podtekst: 'Koliko je x?', odgovor: x };
  },
  (r) => {
    const x = int(r, 2, 12), a = int(r, 3, 9);
    return { predmet: 'matematika', tekst: `${a} · x = ${a * x}`, podtekst: 'Koliko je x?', odgovor: x };
  },
  (r) => {
    const a = int(r, 4, 15);
    return { predmet: 'matematika', tekst: `Koliko je ${a}²?`, odgovor: a * a };
  },
  (r) => {
    const p = pick(r, [10, 20, 25, 50, 75] as const);
    const n = int(r, 2, 16) * (p === 25 || p === 75 ? 4 : p === 50 ? 2 : 10);
    return { predmet: 'matematika', tekst: `Koliko je ${p}% od ${n}?`, odgovor: (p * n) / 100 };
  },
  (r) => {
    const a = int(r, 3, 15), b = int(r, 2, 12);
    return {
      predmet: 'matematika',
      tekst: `Pravougaonik ${a} × ${b} cm.`,
      podtekst: 'Kolika mu je površina?',
      jedinica: 'cm²',
      odgovor: a * b,
    };
  },
  (r) => {
    const a = int(r, 3, 20), b = int(r, 3, 20);
    return {
      predmet: 'matematika',
      tekst: `Pravougaonik ${a} × ${b} cm.`,
      podtekst: 'Koliki mu je obim?',
      jedinica: 'cm',
      odgovor: 2 * (a + b),
    };
  },
  (r) => {
    const n = pick(r, [2, 3, 4, 5, 6, 8, 10] as const);
    const d = pick(r, [2, 4, 5] as const);
    // n/d zapisano decimalno — biramo samo konačne razlomke.
    const v = n / d;
    return izbor(r, 'matematika', `Koliko je ${n}/${d} decimalno?`, broj(v), blizu(r, v, 0.5));
  },
];

const MAT_SREDNJA: Gen[] = [
  (r) => {
    const x = int(r, 2, 12), a = int(r, 2, 9), b = int(r, 1, 30);
    return {
      predmet: 'matematika',
      tekst: `${a}x + ${b} = ${a * x + b}`,
      podtekst: 'Koliko je x?',
      odgovor: x,
    };
  },
  (r) => {
    const a = int(r, 2, 6), b = int(r, 2, 20), k = int(r, 1, 12);
    return {
      predmet: 'matematika',
      tekst: `${a}(x − ${b}) = ${a * k}`,
      podtekst: 'Koliko je x?',
      odgovor: b + k,
    };
  },
  (r) => {
    const n = int(r, 5, 10);
    return { predmet: 'matematika', tekst: `Koliko je 2^${n}?`, odgovor: 2 ** n };
  },
  (r) => {
    const a = int(r, 11, 25);
    return { predmet: 'matematika', tekst: `√${a * a} = ?`, odgovor: a };
  },
  (r) => {
    const p = pick(r, [12, 15, 35, 45, 60, 80] as const);
    const n = int(r, 1, 9) * 20;
    return { predmet: 'matematika', tekst: `Koliko je ${p}% od ${n}?`, odgovor: (p * n) / 100 };
  },
  (r) => {
    let x1 = int(r, 1, 9), x2 = int(r, 1, 9);
    if (x1 === x2) x2 += 1;
    const veci = Math.max(x1, x2);
    const s = x1 + x2, p = x1 * x2;
    return {
      predmet: 'matematika',
      tekst: `x² − ${s}x + ${p} = 0`,
      podtekst: 'Koliki je veći koren?',
      odgovor: veci,
    };
  },
  (r) => {
    const a1 = int(r, 2, 20), d = int(r, 3, 9), n = int(r, 6, 12);
    return {
      predmet: 'matematika',
      tekst: `${a1}, ${a1 + d}, ${a1 + 2 * d}, ${a1 + 3 * d}, …`,
      podtekst: `Koji je ${n}. član niza?`,
      odgovor: a1 + (n - 1) * d,
    };
  },
  (r) => {
    const b = pick(r, [2, 3, 5] as const);
    const n = b === 2 ? int(r, 3, 9) : b === 3 ? int(r, 2, 5) : int(r, 2, 4);
    return { predmet: 'matematika', tekst: `log${sub(b)} ${b ** n} = ?`, odgovor: n };
  },
  (r) => {
    const [a, b] = pick(r, [[3, 4], [6, 8], [5, 12], [9, 12], [8, 15], [12, 16]] as const);
    return {
      predmet: 'matematika',
      tekst: `Katete pravouglog trougla su ${a} i ${b}.`,
      podtekst: 'Kolika je hipotenuza?',
      odgovor: Math.hypot(a, b),
    };
  },
  (r) => {
    const [tekst, tacno, mamci] = pick(r, [
      ['1/2 + 1/3 = ?', '5/6', ['2/5', '1/6', '2/3', '3/5']],
      ['3/4 − 1/2 = ?', '1/4', ['1/2', '2/4', '1/8', '3/8']],
      ['2/3 · 3/4 = ?', '1/2', ['5/7', '6/7', '2/3', '3/8']],
      ['1/4 + 2/3 = ?', '11/12', ['3/7', '3/12', '5/6', '7/12']],
      ['5/6 − 1/3 = ?', '1/2', ['4/3', '2/3', '1/6', '4/6']],
      ['(2/5) : (1/5) = ?', '2', ['2/25', '1/2', '5', '10']],
    ] as const);
    return izbor(r, 'matematika', tekst, tacno, mamci);
  },
  (r) => {
    const a = int(r, 2, 9);
    return {
      predmet: 'matematika',
      tekst: `Kocka ivice ${a} cm.`,
      podtekst: 'Kolika joj je zapremina?',
      jedinica: 'cm³',
      odgovor: a ** 3,
    };
  },
  (r) => {
    const x = int(r, 2, 9);
    const k = int(r, 2, 5);
    return {
      predmet: 'matematika',
      tekst: `f(x) = ${k}x² − x`,
      podtekst: `Koliko je f(${x})?`,
      odgovor: k * x * x - x,
    };
  },
];

function sub(n: number): string {
  return String(n)
    .split('')
    .map((c) => '₀₁₂₃₄₅₆₇₈₉'[Number(c)])
    .join('');
}

// --- Fizika ----------------------------------------------------------------

const JEDINICE: readonly (readonly [string, string, readonly string[]])[] = [
  ['Jedinica za silu?', 'N (njutn)', ['J (džul)', 'W (vat)', 'Pa (paskal)', 'kg']],
  ['Jedinica za rad i energiju?', 'J (džul)', ['N (njutn)', 'W (vat)', 'V (volt)', 'Pa (paskal)']],
  ['Jedinica za snagu?', 'W (vat)', ['J (džul)', 'N (njutn)', 'A (amper)', 'Hz (herc)']],
  ['Jedinica za pritisak?', 'Pa (paskal)', ['N (njutn)', 'J (džul)', 'W (vat)', 'm/s²']],
  ['Jedinica za električni otpor?', 'Ω (om)', ['V (volt)', 'A (amper)', 'W (vat)', 'C (kulon)']],
  ['Jedinica za frekvenciju?', 'Hz (herc)', ['s (sekunda)', 'W (vat)', 'm/s', 'J (džul)']],
  ['Jedinica za jačinu struje?', 'A (amper)', ['V (volt)', 'Ω (om)', 'W (vat)', 'C (kulon)']],
];

const FIZ_OSNOVNA: Gen[] = [
  (r) => {
    const v = int(r, 3, 25), t = int(r, 2, 12);
    return {
      predmet: 'fizika',
      tekst: `Auto pređe ${v * t} m za ${t} s.`,
      podtekst: 'Kolika mu je brzina?',
      jedinica: 'm/s',
      odgovor: v,
    };
  },
  (r) => {
    const v = int(r, 2, 15), t = int(r, 3, 20);
    return {
      predmet: 'fizika',
      tekst: `Biciklista ide ${v} m/s tokom ${t} s.`,
      podtekst: 'Koliki put pređe?',
      jedinica: 'm',
      odgovor: v * t,
    };
  },
  (r) => {
    const v = int(r, 40, 120), t = int(r, 2, 5);
    return {
      predmet: 'fizika',
      tekst: `Voz ide ${v} km/h.`,
      podtekst: `Koliko kilometara pređe za ${t} h?`,
      jedinica: 'km',
      odgovor: v * t,
    };
  },
  (r) => {
    const kmh = pick(r, [18, 36, 54, 72, 90, 108] as const);
    return {
      predmet: 'fizika',
      tekst: `${kmh} km/h = ? m/s`,
      jedinica: 'm/s',
      odgovor: kmh / 3.6,
    };
  },
  (r) => {
    const m = int(r, 2, 40);
    return {
      predmet: 'fizika',
      tekst: `Telo mase ${m} kg (g = 10 m/s²).`,
      podtekst: 'Kolika mu je težina?',
      jedinica: 'N',
      odgovor: m * 10,
    };
  },
  (r) => {
    const rho = pick(r, [2, 3, 4, 5, 8] as const), v = int(r, 2, 12);
    return {
      predmet: 'fizika',
      tekst: `Masa ${rho * v} g, zapremina ${v} cm³.`,
      podtekst: 'Kolika je gustina?',
      jedinica: 'g/cm³',
      odgovor: rho,
    };
  },
  (r) => {
    const kg = int(r, 2, 9) + pick(r, [0, 0.5, 0.25] as const);
    return { predmet: 'fizika', tekst: `${broj(kg)} kg = ? g`, jedinica: 'g', odgovor: kg * 1000 };
  },
  (r) => {
    const [tekst, tacno, mamci] = pick(r, JEDINICE);
    return izbor(r, 'fizika', tekst, tacno, mamci);
  },
  (r) => {
    const [tekst, tacno, mamci] = pick(r, [
      ['Na kojoj temperaturi voda ključa (na nivou mora)?', '100 °C', ['90 °C', '0 °C', '120 °C', '80 °C']],
      ['Na kojoj temperaturi se voda ledi?', '0 °C', ['4 °C', '−10 °C', '10 °C', '100 °C']],
      ['Šta meri termometar?', 'Temperaturu', ['Pritisak', 'Masu', 'Brzinu', 'Struju']],
      ['Šta meri dinamometar?', 'Silu', ['Masu', 'Struju', 'Vreme', 'Temperaturu']],
      ['Koliko sekundi ima jedan sat?', '3600', ['360', '600', '6000', '1440']],
    ] as const);
    return izbor(r, 'fizika', tekst, tacno, mamci);
  },
];

const FIZ_SREDNJA: Gen[] = [
  (r) => {
    const m = int(r, 2, 12), a = int(r, 2, 9);
    return {
      predmet: 'fizika',
      tekst: `F = m · a. Masa ${m} kg, ubrzanje ${a} m/s².`,
      podtekst: 'Kolika je sila?',
      jedinica: 'N',
      odgovor: m * a,
    };
  },
  (r) => {
    const i = int(r, 2, 6), rr = pick(r, [2, 4, 5, 10, 20] as const);
    return {
      predmet: 'fizika',
      tekst: `Napon ${i * rr} V, otpor ${rr} Ω.`,
      podtekst: 'Kolika je struja?',
      jedinica: 'A',
      odgovor: i,
    };
  },
  (r) => {
    const i = int(r, 2, 10), rr = int(r, 3, 20);
    return {
      predmet: 'fizika',
      tekst: `Struja ${i} A teče kroz otpor ${rr} Ω.`,
      podtekst: 'Koliki je napon?',
      jedinica: 'V',
      odgovor: i * rr,
    };
  },
  (r) => {
    const u = pick(r, [12, 24, 110, 230] as const), i = int(r, 2, 10);
    return {
      predmet: 'fizika',
      tekst: `Uređaj na ${u} V vuče ${i} A.`,
      podtekst: 'Kolika mu je snaga?',
      jedinica: 'W',
      odgovor: u * i,
    };
  },
  (r) => {
    const f = int(r, 5, 50), s = int(r, 2, 20);
    return {
      predmet: 'fizika',
      tekst: `Sila ${f} N pomeri telo za ${s} m.`,
      podtekst: 'Koliki je rad?',
      jedinica: 'J',
      odgovor: f * s,
    };
  },
  (r) => {
    const m = int(r, 1, 10) * 2, v = int(r, 2, 10);
    return {
      predmet: 'fizika',
      tekst: `Telo mase ${m} kg ide brzinom ${v} m/s.`,
      podtekst: 'Kolika mu je kinetička energija?',
      jedinica: 'J',
      odgovor: (m * v * v) / 2,
    };
  },
  (r) => {
    const m = int(r, 2, 10), h = int(r, 2, 15);
    return {
      predmet: 'fizika',
      tekst: `Telo mase ${m} kg je na visini ${h} m (g = 10 m/s²).`,
      podtekst: 'Kolika mu je potencijalna energija?',
      jedinica: 'J',
      odgovor: m * 10 * h,
    };
  },
  (r) => {
    const a = int(r, 2, 6), t = int(r, 2, 10), v0 = int(r, 0, 10);
    return {
      predmet: 'fizika',
      tekst: `Brzina poraste sa ${v0} na ${v0 + a * t} m/s za ${t} s.`,
      podtekst: 'Koliko je ubrzanje?',
      jedinica: 'm/s²',
      odgovor: a,
    };
  },
  (r) => {
    const t = int(r, 1, 6);
    return {
      predmet: 'fizika',
      tekst: `Kamen slobodno pada ${t} s (g = 10 m/s²).`,
      podtekst: 'Kolika mu je brzina?',
      jedinica: 'm/s',
      odgovor: 10 * t,
    };
  },
  (r) => {
    const s = pick(r, [2, 4, 5, 10] as const), p = int(r, 3, 30);
    return {
      predmet: 'fizika',
      tekst: `Sila ${p * s} N deluje na površinu ${s} m².`,
      podtekst: 'Koliki je pritisak?',
      jedinica: 'Pa',
      odgovor: p,
    };
  },
  (r) => {
    const r1 = int(r, 2, 30), r2 = int(r, 2, 30);
    return {
      predmet: 'fizika',
      tekst: `Otpori ${r1} Ω i ${r2} Ω vezani su redno.`,
      podtekst: 'Koliki je ukupan otpor?',
      jedinica: 'Ω',
      odgovor: r1 + r2,
    };
  },
  (r) => {
    const rr = int(r, 2, 20) * 2;
    return {
      predmet: 'fizika',
      tekst: `Dva otpora od po ${rr} Ω vezana su paralelno.`,
      podtekst: 'Koliki je ukupan otpor?',
      jedinica: 'Ω',
      odgovor: rr / 2,
    };
  },
  (r) => {
    const f = pick(r, [2, 4, 5, 10, 20, 50] as const);
    return {
      predmet: 'fizika',
      tekst: `Frekvencija talasa je ${f} Hz.`,
      podtekst: 'Koliki je period?',
      jedinica: 's',
      odgovor: 1 / f,
    };
  },
  (r) => {
    const [tekst, tacno, mamci] = pick(r, JEDINICE);
    return izbor(r, 'fizika', tekst, tacno, mamci);
  },
];

// --- Hemija ----------------------------------------------------------------

const ELEMENTI: readonly (readonly [string, string, number])[] = [
  ['vodonik', 'H', 1],
  ['helijum', 'He', 2],
  ['litijum', 'Li', 3],
  ['ugljenik', 'C', 6],
  ['azot', 'N', 7],
  ['kiseonik', 'O', 8],
  ['fluor', 'F', 9],
  ['neon', 'Ne', 10],
  ['natrijum', 'Na', 11],
  ['magnezijum', 'Mg', 12],
  ['aluminijum', 'Al', 13],
  ['silicijum', 'Si', 14],
  ['fosfor', 'P', 15],
  ['sumpor', 'S', 16],
  ['hlor', 'Cl', 17],
  ['kalijum', 'K', 19],
  ['kalcijum', 'Ca', 20],
  ['gvožđe', 'Fe', 26],
  ['bakar', 'Cu', 29],
  ['cink', 'Zn', 30],
  ['srebro', 'Ag', 47],
  ['zlato', 'Au', 79],
  ['živa', 'Hg', 80],
  ['olovo', 'Pb', 82],
];
/** Mamci za simbole — lažni, ali uverljivi. */
const LAZNI_SIMBOLI = ['So', 'Sr', 'Gv', 'Zl', 'Ki', 'Hl', 'Ug', 'Az', 'Ka', 'Na', 'K', 'N', 'Co', 'Cr', 'Ar'];

/** Molekuli sa brojem atoma i molarnom masom (H 1, C 12, N 14, O 16, Na 23, Mg 24, S 32, Cl 35,5, K 39, Ca 40, Fe 56). */
const MOLEKULI: readonly (readonly [string, number, number])[] = [
  ['H₂O', 3, 18],
  ['CO₂', 3, 44],
  ['NaCl', 2, 58.5],
  ['CH₄', 5, 16],
  ['NH₃', 4, 17],
  ['H₂SO₄', 7, 98],
  ['CaCO₃', 5, 100],
  ['HCl', 2, 36.5],
  ['NaOH', 3, 40],
  ['KOH', 3, 56],
  ['MgO', 2, 40],
  ['C₂H₆', 8, 30],
  ['O₂', 2, 32],
  ['N₂', 2, 28],
  ['HNO₃', 5, 63],
  ['C₆H₁₂O₆', 24, 180],
  ['Fe₂O₃', 5, 160],
  ['CaO', 2, 56],
  ['SO₂', 3, 64],
  ['C₂H₅OH', 9, 46],
];

const HEM_OSNOVNA: Gen[] = [
  (r) => {
    const [ime, simbol] = pick(r, ELEMENTI);
    const mamci = [...ELEMENTI.map((e) => e[1]), ...LAZNI_SIMBOLI].filter(
      (s) => s !== simbol && s[0] === simbol[0]
    );
    const dopuna = LAZNI_SIMBOLI.filter((s) => s !== simbol);
    return izbor(r, 'hemija', `Hemijski simbol za ${ime}?`, simbol, [
      ...shuffle(r, mamci).slice(0, 3),
      ...shuffle(r, dopuna),
    ].slice(0, 6));
  },
  (r) => {
    const [ime, simbol] = pick(r, ELEMENTI);
    const mamci = ELEMENTI.filter((e) => e[1] !== simbol).map((e) => e[0]);
    const tacno = ime[0].toUpperCase() + ime.slice(1);
    return izbor(
      r,
      'hemija',
      `Koji element ima simbol ${simbol}?`,
      tacno,
      mamci.map((m) => m[0].toUpperCase() + m.slice(1))
    );
  },
  (r) => {
    const [ime, , z] = pick(r, ELEMENTI.filter((e) => e[2] <= 20));
    return { predmet: 'hemija', tekst: `Koliki je redni broj elementa ${ime}?`, odgovor: z };
  },
  (r) => {
    const [formula, atomi] = pick(r, MOLEKULI);
    return { predmet: 'hemija', tekst: `Koliko atoma ima molekul ${formula}?`, odgovor: atomi };
  },
  (r) => {
    const [tekst, tacno, mamci] = pick(r, [
      ['pH neutralne vode?', '7', ['0', '14', '1', '5']],
      ['Rastvor sa pH = 2 je…', 'Kiseo', ['Bazan', 'Neutralan', 'Slan']],
      ['Rastvor sa pH = 12 je…', 'Bazan', ['Kiseo', 'Neutralan', 'Sladak']],
      ['Formula vode?', 'H₂O', ['HO₂', 'H₂O₂', 'OH', 'H₃O']],
      ['Formula kuhinjske soli?', 'NaCl', ['KCl', 'NaOH', 'CaCO₃', 'Na₂O']],
      ['Koji gas biljke oslobađaju pri fotosintezi?', 'Kiseonik', ['Ugljen-dioksid', 'Azot', 'Vodonik']],
      ['Koji gas najviše ima u vazduhu?', 'Azot', ['Kiseonik', 'Ugljen-dioksid', 'Argon']],
      ['Koji je najlakši element?', 'Vodonik', ['Helijum', 'Litijum', 'Kiseonik']],
      ['Koji metal je tečan na sobnoj temperaturi?', 'Živa', ['Olovo', 'Gvožđe', 'Natrijum']],
      ['Koliko elektrona staje u prvu ljusku?', '2', ['8', '1', '18']],
    ] as const);
    return izbor(r, 'hemija', tekst, tacno, mamci);
  },
];

const HEM_SREDNJA: Gen[] = [
  (r) => {
    const [formula, , m] = pick(r, MOLEKULI);
    return {
      predmet: 'hemija',
      tekst: `Molarna masa ${formula}?`,
      podtekst: 'H 1 · C 12 · N 14 · O 16 · Na 23 · Mg 24 · S 32 · Cl 35,5 · K 39 · Ca 40 · Fe 56',
      jedinica: 'g/mol',
      odgovor: m,
    };
  },
  (r) => {
    const [formula, , m] = pick(r, MOLEKULI.filter((x) => Number.isInteger(x[2])));
    const n = pick(r, [0.5, 2, 3, 4, 5] as const);
    return {
      predmet: 'hemija',
      tekst: `Koliko mola je ${broj(n * m)} g ${formula}?`,
      podtekst: `M(${formula}) = ${broj(m)} g/mol`,
      jedinica: 'mol',
      odgovor: n,
    };
  },
  (r) => {
    const [formula, , m] = pick(r, MOLEKULI.filter((x) => Number.isInteger(x[2])));
    const n = int(r, 2, 5);
    return {
      predmet: 'hemija',
      tekst: `Kolika je masa ${n} mol ${formula}?`,
      podtekst: `M(${formula}) = ${broj(m)} g/mol`,
      jedinica: 'g',
      odgovor: n * m,
    };
  },
  (r) => {
    const [simbol, z, a] = pick(r, IZOTOPI);
    const ime = ELEMENTI.find((e) => e[1] === simbol)?.[0] ?? simbol;
    return {
      predmet: 'hemija',
      tekst: `Koliko neutrona ima ${sup(a)}${simbol} (${ime}, Z = ${z})?`,
      odgovor: a - z,
    };
  },
  (r) => {
    const [tekst, tacno, mamci, podtekst] = pick(r, [
      ['Izjednači: __ H₂ + O₂ → 2 H₂O', '2', ['1', '3', '4'], 'Koliki je koeficijent ispred H₂?'],
      ['Izjednači: N₂ + __ H₂ → 2 NH₃', '3', ['1', '2', '6'], 'Koliki je koeficijent ispred H₂?'],
      ['Izjednači: 2 Na + Cl₂ → __ NaCl', '2', ['1', '3', '4'], 'Koliki je koeficijent ispred NaCl?'],
      ['Izjednači: CH₄ + __ O₂ → CO₂ + 2 H₂O', '2', ['1', '3', '4'], 'Koliki je koeficijent ispred O₂?'],
      ['Izjednači: __ Al + 3 O₂ → 2 Al₂O₃', '4', ['2', '3', '6'], 'Koliki je koeficijent ispred Al?'],
      ['Izjednači: 2 KClO₃ → 2 KCl + __ O₂', '3', ['1', '2', '6'], 'Koliki je koeficijent ispred O₂?'],
    ] as const);
    return izbor(r, 'hemija', tekst, tacno, mamci, podtekst);
  },
  (r) => {
    const [tekst, tacno, mamci] = pick(r, [
      ['Oksidacioni broj S u H₂SO₄?', '+6', ['+4', '+2', '−2']],
      ['Oksidacioni broj N u HNO₃?', '+5', ['+3', '−3', '+1']],
      ['Oksidacioni broj C u CO₂?', '+4', ['+2', '−4', '0']],
      ['Oksidacioni broj O u H₂O₂?', '−1', ['−2', '+1', '0']],
      ['Oksidacioni broj Fe u Fe₂O₃?', '+3', ['+2', '+6', '0']],
      ['Oksidacioni broj Mn u KMnO₄?', '+7', ['+4', '+2', '+6']],
      ['Koliko valentnih elektrona ima kiseonik?', '6', ['2', '8', '4']],
      ['Koliko valentnih elektrona ima natrijum?', '1', ['11', '2', '7']],
      ['Kojoj grupi pripada hlor?', 'Halogeni', ['Plemeniti gasovi', 'Alkalni metali', 'Zemnoalkalni metali']],
      ['Kakva je veza u molekulu NaCl?', 'Jonska', ['Kovalentna', 'Metalna', 'Vodonična']],
      ['Opšta formula alkana?', 'CₙH₂ₙ₊₂', ['CₙH₂ₙ', 'CₙH₂ₙ₋₂', 'CₙHₙ']],
      ['Funkcionalna grupa alkohola?', '−OH', ['−COOH', '−CHO', '−NH₂']],
    ] as const);
    return izbor(r, 'hemija', tekst, tacno, mamci);
  },
  (r) => {
    const c = pick(r, [0.1, 0.2, 0.5, 1, 2] as const), v = pick(r, [0.5, 1, 2, 4] as const);
    return {
      predmet: 'hemija',
      tekst: `Koliko mola supstance ima u ${broj(v)} L rastvora koncentracije ${broj(c)} mol/L?`,
      jedinica: 'mol',
      odgovor: Math.round(c * v * 1000) / 1000,
    };
  },
];

/** Najčešći izotop: simbol, Z, A. */
const IZOTOPI: readonly (readonly [string, number, number])[] = [
  ['C', 6, 12],
  ['N', 7, 14],
  ['O', 8, 16],
  ['F', 9, 19],
  ['Ne', 10, 20],
  ['Na', 11, 23],
  ['Mg', 12, 24],
  ['Al', 13, 27],
  ['P', 15, 31],
  ['S', 16, 32],
  ['Cl', 17, 35],
  ['K', 19, 39],
  ['Ca', 20, 40],
  ['Fe', 26, 56],
];

function sup(n: number): string {
  return String(n)
    .split('')
    .map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(c)])
    .join('');
}

const BANKA: Record<PotegniPredmet, Record<Nivo, Gen[]>> = {
  matematika: { osnovna: MAT_OSNOVNA, srednja: MAT_SREDNJA },
  fizika: { osnovna: FIZ_OSNOVNA, srednja: FIZ_SREDNJA },
  hemija: { osnovna: HEM_OSNOVNA, srednja: HEM_SREDNJA },
};

/**
 * Novi zadatak. `izbegni` je tekst prethodnog zadatka istog igrača — da isti
 * tekst ne izađe dvaput zaredom (mali generatori umeju da se ponove).
 */
export function napraviZadatak(
  predmeti: PotegniPredmet[],
  tezina: PotegniTezina,
  izbegni?: string,
  r: Rnd = Math.random
): GenZadatak {
  for (let i = 0; i < 6; i++) {
    const predmet = pick(r, predmeti);
    const nivo: Nivo = tezina === 'mesovito' ? (r() < 0.5 ? 'osnovna' : 'srednja') : tezina;
    const z = pick(r, BANKA[predmet][nivo])(r);
    if (z.tekst + (z.podtekst ?? '') !== izbegni) return z;
  }
  return pick(r, BANKA[predmeti[0]].osnovna)(r);
}

/** Svi generatori — za harnes koji proverava da su odgovori ispravni. */
export const SVI_GENERATORI: { predmet: PotegniPredmet; nivo: Nivo; gen: Gen }[] = (
  Object.entries(BANKA) as [PotegniPredmet, Record<Nivo, Gen[]>][]
).flatMap(([predmet, nivoi]) =>
  (Object.entries(nivoi) as [Nivo, Gen[]][]).flatMap(([nivo, gens]) =>
    gens.map((gen) => ({ predmet, nivo, gen }))
  )
);
