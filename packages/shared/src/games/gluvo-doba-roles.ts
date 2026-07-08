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
  | 'protect'
  | 'investigate'
  | 'ask-dead'
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
  /** Vidovnjak ambiguity group this role belongs to. */
  hintGroupId: string;
}

// Roles are NOT revealed when a player dies — the village has to reason from
// whispers and investigations. Flip to true for a Town-of-Salem-style game.
export const REVEAL_ROLE_ON_DEATH = false;

export const GLUVO_DOBA_ROLES: Record<GluvoDobaRoleId, GluvoDobaRoleDef> = {
  vukodlak: {
    id: 'vukodlak',
    name: 'Vukodlak',
    team: 'vukodlaci',
    description:
      'Noću se pretvaraš u zver. Sa čoporom biraš žrtvu — danju glumiš nedužnog seljanina. Pobedi kad vukodlaka bude koliko i ostalih.',
    nightPrompt: 'Koga čopor noćas napada?',
    nightActionType: 'kill-vote',
    noRepeatTarget: false,
    hintGroupId: 'luta',
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
    name: 'Vidovnjak',
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
      'Tvoj duh noću napušta telo i razgovara sa mrtvima. Pitaj ih za jednog igrača — ali pazi, mrtvi vukodlaci umeju da lažu.',
    nightPrompt: 'Za koga pitaš mrtve?',
    nightActionType: 'ask-dead',
    noRepeatTarget: false,
    hintGroupId: 'luta',
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
};

/**
 * Vidovnjak hint groups — deliberately ambiguous: each mixes wolf and
 * village roles so an investigation narrows, but never convicts.
 */
export const GLUVO_DOBA_HINT_GROUPS: Record<string, { text: string }> = {
  luta: { text: 'Noću luta selom… Vukodlak ili Zduhać.' },
  sudbina: { text: 'Dodiruje tuđe sudbine… Vila ili Suđaja.' },
  mirno: { text: 'Spava mirno… Zmaj, Vidovnjak ili Domaćin.' },
};

/** 6–8 players → 2 wolves, 9–11 → 3, 12+ → 4. */
export function wolfCountFor(playerCount: number): number {
  if (playerCount >= 12) return 4;
  if (playerCount >= 9) return 3;
  return 2;
}

// Special village roles beyond the guaranteed Vidovnjak + Zmaj; a random
// subset joins each game so no two games have the same role mix.
const OPTIONAL_TOWN_ROLES: GluvoDobaRoleId[] = ['zduhac', 'sudjaja', 'vila'];

/**
 * Deal roles for a fresh game. Wolves by player count; Vidovnjak and Zmaj
 * always in; 1–3 optional roles depending on how many villagers remain;
 * everyone else is a Domaćin.
 */
export function assignRoles(
  playerIds: string[]
): Map<string, GluvoDobaRoleId> {
  const wolves = wolfCountFor(playerIds.length);
  const townCount = playerIds.length - wolves;

  const townRoles: GluvoDobaRoleId[] = ['vidovnjak', 'zmaj'];
  const optionalCount = townCount >= 7 ? 3 : townCount >= 5 ? 2 : 1;
  townRoles.push(...shuffled(OPTIONAL_TOWN_ROLES).slice(0, optionalCount));
  while (townRoles.length < townCount) townRoles.push('domacin');

  const deck: GluvoDobaRoleId[] = [
    ...Array<GluvoDobaRoleId>(wolves).fill('vukodlak'),
    ...townRoles,
  ];

  const ids = shuffled(playerIds);
  const dealt = shuffled(deck);
  const roles = new Map<string, GluvoDobaRoleId>();
  ids.forEach((id, i) => roles.set(id, dealt[i]));
  return roles;
}
