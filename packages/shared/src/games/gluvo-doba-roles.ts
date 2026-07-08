import type { GluvoDobaRoleId, GluvoDobaTeam } from '../types/gluvo-doba.js';
import { shuffled } from '../utils/shuffle.js';

/**
 * Gluvo doba — role data tables. Everything role-specific that clients and
 * the server both need lives here so a new role is added by extending the
 * tables, not by sprinkling if-branches.
 */

/**
 * What a role's night pick actually does in the resolution pipeline.
 * 'whisper' is the powerless fake action — it feeds the anonymous dawn
 * "šapat sumnje" aggregate so every phone looks identically busy at night.
 */
export type GluvoDobaNightActionType =
  | 'kill-vote'
  | 'kill-solo'
  | 'protect'
  | 'investigate'
  | 'ask-dead'
  | 'block'
  | 'unblock'
  | 'fear'
  | 'enchant'
  | 'whisper';

export interface GluvoDobaRoleDef {
  id: GluvoDobaRoleId;
  name: string;
  team: GluvoDobaTeam;
  /** Role card text shown once at podela-uloga. */
  description: string;
  /** Prompt above the (visually identical) night target grid. */
  nightPrompt: string;
  nightActionType: GluvoDobaNightActionType;
  /** Server refuses targeting the same player two nights in a row. */
  noRepeatTarget: boolean;
  /** Vračara ambiguity group this role belongs to. */
  hintGroupId: string;
}

export const GLUVO_DOBA_TEAM_NAMES: Record<GluvoDobaTeam, string> = {
  vukodlaci: 'Sile Mraka',
  selo: 'Selo',
  neutralci: 'Neutralan',
};

export const GLUVO_DOBA_ROLES: Record<GluvoDobaRoleId, GluvoDobaRoleDef> = {
  vukodlak: {
    id: 'vukodlak',
    name: 'Vukodlak',
    team: 'vukodlaci',
    description:
      'Noću se pretvaraš u zver. Sa Silama Mraka biraš žrtvu — danju glumiš nedužnog seljanina. Mrak pobeđuje kad vas bude koliko i ostalih.',
    nightPrompt: 'Koga čopor noćas napada?',
    nightActionType: 'kill-vote',
    noRepeatTarget: false,
    hintGroupId: 'luta',
  },
  vampir: {
    id: 'vampir',
    name: 'Vampir',
    team: 'vukodlaci',
    description:
      'Krvopija koji sluša kuma. Vukodlak bira žrtvu, a ti je noću daviš. Ako Vukodlak strada, ti preuzimaš čopor i sam biraš metu. Igraš za Sile Mraka.',
    nightPrompt: 'Koga čopor noćas napada?',
    nightActionType: 'kill-vote',
    noRepeatTarget: false,
    hintGroupId: 'luta',
  },
  todorac: {
    id: 'todorac',
    name: 'Todorac',
    team: 'vukodlaci',
    description:
      'Mitski konjanik srastao sa konjem. Svake noći pregaziš jednog igrača — njegova moć te noći ne radi. Igraš za Sile Mraka.',
    nightPrompt: 'Koga Todorac noćas gazi?',
    nightActionType: 'block',
    noRepeatTarget: false,
    hintGroupId: 'luta',
  },
  drekavac: {
    id: 'drekavac',
    name: 'Drekavac',
    team: 'vukodlaci',
    description:
      'Dete koje plače u noći. Nemaš svoju moć, ali Vračari izgledaš kao nedužni seljanin — a tvoj šapat sumnje truje selo. Igraš za Sile Mraka.',
    nightPrompt: 'Koga sumnjičiš?',
    nightActionType: 'whisper',
    noRepeatTarget: false,
    hintGroupId: 'mirno', // the false scan — reads as a villager
  },
  bauk: {
    id: 'bauk',
    name: 'Bauk',
    team: 'vukodlaci',
    description:
      'Kriješ se u senci i plašiš selo. Noću biraš igrača koji od straha sutra ne sme da glasa. Igraš za Sile Mraka.',
    nightPrompt: 'Koga Bauk noćas plaši?',
    nightActionType: 'fear',
    noRepeatTarget: false,
    hintGroupId: 'strah',
  },
  zmaj: {
    id: 'zmaj',
    name: 'Zmaj',
    team: 'selo',
    description:
      'Čuvar sela. Svake noći raširiš krila nad jednim igračem i štitiš ga od smrti — ali ne istog dve noći zaredom.',
    nightPrompt: 'Koga Zmaj noćas čuva?',
    nightActionType: 'protect',
    noRepeatTarget: true,
    hintGroupId: 'mirno',
  },
  vidovnjak: {
    id: 'vidovnjak',
    name: 'Vračara',
    team: 'selo',
    description:
      'Svake noći zaviriš u nečiju dušu i dobiješ nagoveštaj — ali vizije su maglovite i mogu značiti više stvari.',
    nightPrompt: 'U čiju dušu noćas gledaš?',
    nightActionType: 'investigate',
    noRepeatTarget: false,
    hintGroupId: 'mirno',
  },
  zduhac: {
    id: 'zduhac',
    name: 'Zduhać',
    team: 'selo',
    description:
      'Tvoja duša noću leti nebom i čuva selo. Jednom po igri automatski presretneš napad vukodlaka i spaseš žrtvu — ali se tada tvoja uloga javno otkriva.',
    nightPrompt: 'Koga sumnjičiš?',
    nightActionType: 'whisper',
    noRepeatTarget: false,
    hintGroupId: 'strah',
  },
  sudjaja: {
    id: 'sudjaja',
    name: 'Suđaja',
    team: 'selo',
    description:
      'Ispredaš niti sudbine. Kad umreš — noću ili na vešalima — povlačiš jednu nit i vodiš jednog igrača sa sobom.',
    nightPrompt: 'Koga sumnjičiš?',
    nightActionType: 'whisper',
    noRepeatTarget: false,
    hintGroupId: 'sudbina',
  },
  knez: {
    id: 'knez',
    name: 'Knez',
    team: 'selo',
    description:
      'Seoski kmet. U bilo kom trenutku dana možeš javno da se otkriješ — od tog trenutka tvoj glas na vešanju vredi dvostruko.',
    nightPrompt: 'Koga sumnjičiš?',
    nightActionType: 'whisper',
    noRepeatTarget: false,
    hintGroupId: 'mirno',
  },
  raskovnik: {
    id: 'raskovnik',
    name: 'Raskovnik',
    team: 'selo',
    description:
      'Čuvaš mitsku travu koja otvara svaku bravu. Noću biraš igrača — ako ga je Todorac pregazio, oslobađaš ga blokade.',
    nightPrompt: 'Koga Raskovnik noćas oslobađa?',
    nightActionType: 'unblock',
    noRepeatTarget: false,
    hintGroupId: 'sudbina',
  },
  bajacica: {
    id: 'bajacica',
    name: 'Bajačica',
    team: 'selo',
    description:
      'Bajanjem prizivaš duhove. Svake noći pitaš mrtve za jednog igrača „da li je vukodlak?" — oni ti šapuću zbir odgovora. Ali pazi: mrtvi vukodlaci umeju da lažu.',
    nightPrompt: 'Za koga bajačica pita mrtve?',
    nightActionType: 'ask-dead',
    noRepeatTarget: false,
    hintGroupId: 'strah',
  },
  vila: {
    id: 'vila',
    name: 'Vila',
    team: 'selo',
    description:
      'Nestašni duh šume. Svake noći začaraš jednog igrača — ako te noći nekoga cilja, meta mu se pomeša. Ne istog dve noći zaredom.',
    nightPrompt: 'Koga Vila noćas začarava?',
    nightActionType: 'enchant',
    noRepeatTarget: true,
    hintGroupId: 'sudbina',
  },
  domacin: {
    id: 'domacin',
    name: 'Domaćin',
    team: 'selo',
    description:
      'Običan, pošten seljanin. Nemaš moći — ali tvoj šapat sumnje noću stiže do sela, a danju tvoj glas vredi koliko i svačiji.',
    nightPrompt: 'Koga sumnjičiš?',
    nightActionType: 'whisper',
    noRepeatTarget: false,
    hintGroupId: 'mirno',
  },
  lesnik: {
    id: 'lesnik',
    name: 'Lesnik',
    team: 'neutralci',
    description:
      'Šumski gospodar — igraš sam za sebe. Cilj ti je jedino da preživiš do kraja: ako dočekaš kraj živ, pobeđuješ uz pobednike.',
    nightPrompt: 'Koga sumnjičiš?',
    nightActionType: 'whisper',
    noRepeatTarget: false,
    hintGroupId: 'luta',
  },
  morana: {
    id: 'morana',
    name: 'Morana',
    team: 'neutralci',
    description:
      'Boginja smrti — igraš sama za sebe. Svake druge noći zamrzneš jednog igrača. Pobeđuješ ako ostaneš među poslednja dva živa.',
    nightPrompt: 'Koga Morana noćas ledi?',
    nightActionType: 'kill-solo',
    noRepeatTarget: false,
    hintGroupId: 'sudbina',
  },
};

/**
 * Vračara hint groups — deliberately ambiguous: each mixes teams so an
 * investigation narrows, but never convicts. Drekavac's group text omits
 * him on purpose: he reads as a clean villager (that IS his power).
 */
export const GLUVO_DOBA_HINT_GROUPS: Record<string, { text: string }> = {
  luta: { text: 'Noću luta selom… Vukodlak, Vampir, Todorac ili Lesnik.' },
  sudbina: {
    text: 'Dodiruje tuđe sudbine… Vila, Suđaja, Raskovnik ili Morana.',
  },
  mirno: { text: 'Spava mirno… Zmaj, Vračara, Knez ili Domaćin.' },
  strah: { text: 'Vazduh oko njega treperi… Bauk, Zduhać ili Bajačica.' },
};

export interface GluvoDobaCompositionOpts {
  /** Bajačica (medium) replaces one Domaćin (9+ only). */
  bajacica?: boolean;
}

/**
 * The full role deck for a player count, per the balance tables:
 *  - 6–8  "mala družina": Vukodlak + Vampir vs Vračara + Zmaj + villagers.
 *    No third parties, no multi-kill — every death stings.
 *  - 9–12 "srednja ekipa": dark grows a Todorac OR a Bauk (50/50); village
 *    gets Suđaja + Knez.
 *  - 13–15 "veliko selo": dark = core + Todorac + Drekavac; village adds
 *    Zduhać + Raskovnik.
 * The dark core is always a Vukodlak + a Vampir; bigger bands add
 * specialists on top.
 */
export function compositionFor(
  playerCount: number,
  opts: GluvoDobaCompositionOpts = {}
): GluvoDobaRoleId[] {
  // The dark core is a Vukodlak (the "kum" who picks the victim) and a
  // Vampir (who carries out the kill and inherits the pack if the Vukodlak
  // dies). Bigger bands add more dark specialists on top.
  const deck: GluvoDobaRoleId[] = [
    'vukodlak',
    'vampir',
    'vidovnjak',
    'zmaj',
  ];

  if (playerCount >= 13) {
    deck.push('todorac', 'drekavac');
    deck.push('sudjaja', 'knez', 'zduhac', 'raskovnik');
  } else if (playerCount >= 9) {
    deck.push(Math.random() < 0.5 ? 'todorac' : 'bauk');
    deck.push('sudjaja', 'knez');
  }

  // Lesnik, Morana and Vila are deliberately NOT part of the built-in
  // bands — they're available only through custom role packs. The Bajačica
  // remains a simple host toggle.
  if (opts.bajacica && playerCount >= 9) deck.push('bajacica');

  while (deck.length < playerCount) deck.push('domacin');
  // Defensive: never deal more cards than players (toggles at the low end
  // of a band can fill the deck exactly, but must not overflow it).
  return deck.slice(0, playerCount);
}

/** Deal the composition randomly across the given players. */
export function assignRoles(
  playerIds: string[],
  opts: GluvoDobaCompositionOpts = {}
): Map<string, GluvoDobaRoleId> {
  const ids = shuffled(playerIds);
  const dealt = shuffled(compositionFor(playerIds.length, opts));
  const roles = new Map<string, GluvoDobaRoleId>();
  ids.forEach((id, i) => roles.set(id, dealt[i]));
  return roles;
}
