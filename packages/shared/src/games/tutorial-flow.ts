// Tok probe (redizajn „Tok igre” 3a–3d) — zajednički okvir za tri igre sa
// tutorial modom (Gluvo doba, Zavet, Špijun): koraci probe (tačkice u
// zaglavlju), ime faze u koju vodi domaćinovo dugme, jedna rečenica koju
// domaćin čita naglas, i rezime na ekranu „Spremni ste!”. Sve je javno
// znanje o toku igre — nijedan tekst ne zavisi od nečije uloge. In-game
// sadržaj je namerno samo na srpskom (kao i ostatak ovih igara).

export interface TutorialFlow {
  /** Ordered steps of the proba; each covers one or more phases. */
  steps: { label: string; phases: string[] }[];
  /** Phase → name of the phase the host's button leads to. */
  nextLabel: Partial<Record<string, string>>;
  /** Phase → one sentence the host reads out loud. */
  readAloud: Partial<Record<string, string>>;
  /** ✓ lines on the "Spremni ste!" screen. */
  recap: string[];
}

export const TUTORIAL_FLOW: Record<string, TutorialFlow> = {
  'gluvo-doba': {
    steps: [
      { label: 'Uloge', phases: ['podela-uloga'] },
      { label: 'Noć', phases: ['noc', 'osveta'] },
      { label: 'Zora', phases: ['zora'] },
      { label: 'Dan', phases: ['diskusija', 'glasanje'] },
      { label: 'Presuda', phases: ['presuda', 'kraj'] },
    ],
    nextLabel: {
      'podela-uloga': 'Noć',
      noc: 'Zora',
      osveta: 'Zora',
      zora: 'Rasprava',
      diskusija: 'Glasanje',
      glasanje: 'Presuda',
      presuda: 'Otkrivanje uloga',
      kraj: 'Kraj probe',
    },
    readAloud: {
      'podela-uloga': 'Svako pročita svoju ulogu — i nikome ne pokazuje ekran.',
      noc: 'Selo spava. Noću Mrak bira žrtvu, a svi ostali nešto rade na telefonu.',
      osveta: 'Suđaja ne odlazi sama — bira koga vodi sa sobom.',
      zora: 'Svanulo je. Pogledajmo ko je noćas stradao.',
      diskusija: 'Spustite telefone. Ko vam je sumnjiv, i zašto?',
      glasanje: 'Glasajte na telefonima koga selo šalje na vešala.',
      presuda: 'Selo je odlučilo — da vidimo koga je pogodilo.',
      kraj: 'Sve uloge su otkrivene. Ko je koga lagao?',
    },
    recap: ['Noć: tajni izbor', 'Zora: ko je stradao', 'Dan: rasprava i vešala'],
  },
  spijun: {
    steps: [
      { label: 'Uloga', phases: ['reveal-role'] },
      { label: 'Rasprava', phases: ['discussion', 'defense'] },
      { label: 'Glasanje', phases: ['voting'] },
      { label: 'Otkrivanje', phases: ['spy-guess', 'results'] },
    ],
    nextLabel: {
      'reveal-role': 'Rasprava',
      discussion: 'Špijun pogađa',
      defense: 'Glasanje',
      voting: 'Rezultat',
      'spy-guess': 'Rezultat',
      results: 'Kraj probe',
    },
    readAloud: {
      'reveal-role': 'Svako pogleda lokaciju i ulogu. Jedan od nas je špijun i ne zna gde smo.',
      discussion: 'Pitajte jedni druge o lokaciji — ali tako da špijun ne pogodi gde smo.',
      defense: 'Optuženi ima reč. Slušajte pažljivo.',
      voting: 'Tajno glasanje: da li je optuženi špijun?',
      'spy-guess': 'Špijun se otkriva i ima jednu šansu da pogodi lokaciju.',
      results: 'Da vidimo gde smo bili i ko je bio špijun.',
    },
    recap: [
      'Uloga: lokacija ili špijun',
      'Rasprava: pitanja bez odavanja',
      'Glasanje i otkrivanje',
    ],
  },
  'bolji-zivot': {
    steps: [
      { label: 'Gledanje', phases: ['peeking'] },
      {
        label: 'Potezi',
        phases: [
          'await-draw',
          'holding',
          'power-select',
          'power-look',
          'peek-show',
          'racija-show',
          'reaction',
          'riska',
        ],
      },
      { label: 'Otkrivanje', phases: ['reveal'] },
      { label: 'Rezultat', phases: ['final-leaderboard'] },
    ],
    nextLabel: {
      peeking: 'Prvi potez',
      reveal: 'Rezultat',
      'final-leaderboard': 'Kraj probe',
    },
    readAloud: {
      peeking: 'Svako krišom pogleda dve svoje karte i zapamti ih.',
      'await-draw': 'Igrač na potezu vuče kartu, uzima sa otpada — ili viče „Zavet!”.',
      holding: 'Izvučenu kartu menja sa svojom ili je baca.',
      'power-select': 'Karta ima moć — igrač bira metu.',
      'racija-show': 'Grom! Svima se otkriva po jedna karta — pamtite.',
      reveal: 'Otkrivamo karte. Najmanje uroka pobeđuje.',
      'final-leaderboard': 'Ko ima najmanje uroka — taj je pobedio.',
    },
    recap: [
      'Pamćenje: gde su tvoje karte',
      'Potez: vuci, zameni ili baci',
      'Zavet: kad misliš da imaš najmanje',
    ],
  },
};

/** Which step of the proba `phase` belongs to (1-based), or null. */
export function tutorialStep(
  gameId: string,
  phase: string
): { step: number; total: number } | null {
  const flow = TUTORIAL_FLOW[gameId];
  if (!flow) return null;
  const i = flow.steps.findIndex((s) => s.phases.includes(phase));
  return i < 0 ? null : { step: i + 1, total: flow.steps.length };
}
