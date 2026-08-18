import type { SpijunPhase, SpijunRole } from '../types/spijun.js';

/**
 * Špijun tutorial-mode guide content. Rendered ONLY when
 * `data.tutorialMode === true` — a normal game keeps a clean UI. Controller
 * hints are computed client-side from the player's own playerData (nothing
 * new crosses the wire — anti-tell holds).
 */

/** TV explainer per phase (host screen, tutorial only). */
export const SPIJUN_TUTORIAL_PHASE_TEXT: Partial<Record<SpijunPhase, string>> = {
  'reveal-role':
    'Svako na telefonu vidi lokaciju i svoju ulogu — osim špijuna, koji vidi samo da je špijun. Nikome ne pokazujte ekran!',
  discussion:
    'Pričajte uživo: postavljajte jedni drugima pitanja o lokaciji. Špijun blefira, ostali paze da pitanjima ne odaju previše. Na telefonu možete da pritisnete „Sumnjiv mi je…" — kad se skupi dovoljno glasova, kreće odbrana.',
  defense:
    'Optuženi ima kratko vreme da se odbrani. Slušajte pažljivo — glasanje sledi!',
  voting:
    'Tajno glasanje na telefonima: da li je optuženi špijun? Većina „DA" ga izbacuje.',
  'spy-guess':
    'Vreme je isteklo — špijun se otkriva i ima jednu šansu da pogodi lokaciju sa javne liste.',
  results:
    'Otkrivanje: lokacija, špijun i poeni. Špijun pogodio lokaciju +300 · ostali razotkrili špijuna +100 (pokretač optužbe još +200) · pogrešna optužba: špijun +200.',
};

/** Personalized phone hint per phase+role (tutorial only). */
export function spijunTutorialControllerHint(
  phase: SpijunPhase,
  role: SpijunRole
): string | null {
  if (role === 'spectator') return null;
  const spy = role === 'spy';
  switch (phase) {
    case 'reveal-role':
      return spy
        ? 'Ti si špijun! Ne znaš lokaciju — slušaj odgovore, blefiraj i pokušaj da je pogodiš. Niko ne sme da vidi tvoj ekran.'
        : 'Zapamti lokaciju i svoju ulogu. Odgovaraj kao ta osoba — ali ne previše precizno, da špijun ne pogodi lokaciju.';
    case 'discussion':
      return spy
        ? 'Precrtavaj lokacije koje si eliminisao — svi gledaju u telefon, pa te to ne odaje. Kad ostane samo jedna, „Znam lokaciju!" nosi više što ranije prekineš.'
        : 'Postavljaj pitanja i prati ko odgovara čudno. Ako sumnjaš, pritisni „Sumnjiv mi je…". Zaglavio si? Dugme za predlog pitanja je tu.';
    case 'defense':
      return 'Slušaj odbranu uživo — glasanje počinje odmah posle.';
    case 'voting':
      return spy
        ? 'Glasaj i ti — da ne štrčiš!'
        : 'Glasaj tajno: da li je optuženi špijun?';
    case 'spy-guess':
      return spy
        ? 'Sada ili nikada — izaberi lokaciju za koju misliš da je tajna!'
        : 'Špijun bira… drž\'te palčeve da promaši.';
    default:
      return null;
  }
}

/** "Tok igre" cheat lines for the "?" modal (tutorial only). */
export const SPIJUN_CHEAT_FLOW: string[] = [
  '1. Svi saznaju lokaciju i ulogu — špijun ne zna ništa.',
  '2. Razgovor uživo: pitanja i odgovori o lokaciji.',
  '3. „Sumnjiv mi je…" na telefonu — dovoljno glasova pokreće odbranu.',
  '4. Odbrana optuženog, pa tajno glasanje DA/NE.',
  '5. Pogrešna optužba? Špijun dobija poene i igra se nastavlja.',
  '6. Istekne li vreme, špijun se otkriva i pogađa lokaciju.',
  '7. Poeni: špijun pogodi +300 · ostali ga uhvate +100 (pokretač +200) · promašena optužba: špijun +200.',
];
