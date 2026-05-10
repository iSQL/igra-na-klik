import type { KoSamJaImportQuestion } from './ko-sam-ja-import.js';

/**
 * Built-in default question bank used when no custom pack is loaded.
 * Family-friendly only — NSFW play requires an explicit pack.
 */
export const KO_SAM_JA_DEFAULT_BANK: KoSamJaImportQuestion[] = [
  {
    shape: 'fixed',
    category: 'family',
    text: 'Omiljena boja igrača {subject}?',
    options: ['crvena', 'plava', 'zelena', 'žuta'],
  },
  {
    shape: 'fixed',
    category: 'family',
    text: '{subject} bi pre na odmor išao u…',
    options: ['planinu', 'more', 'grad', 'selo'],
  },
  {
    shape: 'fixed',
    category: 'family',
    text: 'Omiljeno doba dana igrača {subject}?',
    options: ['jutro', 'podne', 'veče', 'noć'],
  },
  {
    shape: 'fixed',
    category: 'family',
    text: '{subject} radije gleda…',
    options: ['filmove', 'serije', 'sport', 'dokumentarce'],
  },
  {
    shape: 'fixed',
    category: 'family',
    text: '{subject} radije pije…',
    options: ['kafu', 'čaj', 'sok', 'vodu'],
  },
  {
    shape: 'fixed',
    category: 'family',
    text: 'Omiljena životinja igrača {subject}?',
    options: ['pas', 'mačka', 'konj', 'delfin'],
  },
  {
    shape: 'fixed',
    category: 'family',
    text: '{subject} radije sluša…',
    options: ['pop', 'rok', 'narodnjake', 'klasiku'],
  },
  {
    shape: 'fixed',
    category: 'family',
    text: 'Omiljeno godišnje doba igrača {subject}?',
    options: ['proleće', 'leto', 'jesen', 'zima'],
  },
  {
    shape: 'peer',
    category: 'family',
    text: 'Sa kim bi {subject} radije išao na put, sa {peer1} ili {peer2}?',
  },
  {
    shape: 'peer',
    category: 'family',
    text: 'Ko zna bolje {subject}-a, {peer1} ili {peer2}?',
  },
  {
    shape: 'peer',
    category: 'family',
    text: 'Sa kim bi {subject} radije išao na koncert, sa {peer1} ili {peer2}?',
  },
  {
    shape: 'peer',
    category: 'family',
    text: 'Ko je više sličan igraču {subject} po karakteru, {peer1} ili {peer2}?',
  },
  {
    shape: 'free',
    category: 'family',
    text: 'Posao iz snova igrača {subject}?',
    maxLength: 50,
  },
  {
    shape: 'free',
    category: 'family',
    text: 'Najveći talenat igrača {subject} u jednoj reči?',
    maxLength: 30,
  },
  {
    shape: 'free',
    category: 'family',
    text: 'Šta bi {subject} poneo na pusto ostrvo?',
    maxLength: 40,
  },
  {
    shape: 'free',
    category: 'family',
    text: 'U jednoj reči — kakav je {subject}?',
    maxLength: 25,
  },
  {
    shape: 'pickN',
    category: 'family',
    text: 'Koga bi {subject} pre pozvao da planira mu rođendan?',
  },
];
