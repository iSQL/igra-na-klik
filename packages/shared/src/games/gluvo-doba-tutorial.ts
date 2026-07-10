// Tutorial mod za "Gluvo doba" — tekstovi vodiča (fazni opisi za TV,
// personalizovani hintovi za telefon, crtice o toku igre za "?" modal).
// Prikazuju se SAMO kad je igra pokrenuta sa gluvoDobaTutorial flagom —
// obična partija ima čist UI. NIJE u srodstvu sa GLUVO_DOBA_HINT_GROUPS
// (to je mehanika Vračarinog skena). In-game sadržaj je namerno samo na
// srpskom (kao i ostatak igre).

import type { GluvoDobaPhase } from '../types/gluvo-doba.js';

/** Opšti opis faze za TV — šta se upravo dešava u selu. */
export const GLUVO_TUTORIAL_PHASE_TEXT: Partial<Record<GluvoDobaPhase, string>> = {
  'podela-uloga':
    'Svako na svom telefonu dobija TAJNU ulogu: vukodlaci znaju jedni za druge, selo ne zna ništa. Pročitajte opis i ne pokazujte ekran nikome!',
  noc:
    'Selo spava. Svi gledaju u telefone — ekrani izgledaju identično, pa niko ne može da provali ulogu preko ramena. Vukodlaci biraju žrtvu, specijalci koriste moći, ostali šalju anonimni „šapat sumnje“.',
  osveta:
    'Suđaja je pala — ali ne odlazi sama! Bira jednog igrača koga povlači sa sobom.',
  zora:
    'Zora. Selo saznaje ko je stradao tokom noći i vidi vrh „šapata sumnje“. Zapamtite ko se kako ponašao!',
  diskusija:
    'Rasprava UŽIVO, bez telefona: ko laže? Ko je bio sumnjivo miran? Vukodlaci glume nevinost — selo traži nedoslednosti.',
  glasanje:
    'Glasa se na telefonima: koga selo šalje na vešala? Može i uzdržano — ali vukodlaci uvek glasaju…',
  presuda:
    'Presuda! Selo vidi rezultat glasanja. Da li je pogođen vukodlak — ili je stradao nevin?',
  kraj:
    'Kraj igre — sve uloge se otkrivaju. Pogledajte ko vas je celu partiju lagao u lice.',
};

/**
 * Personalizovani hint za telefon — šta baš TI sada treba da radiš.
 * Računa se klijentski iz podataka koje kontroler IONAKO ima
 * (GluvoDobaControllerData) — ništa novo ne prolazi kroz shared hostData.
 */
export function gluvoTutorialControllerHint(
  phase: GluvoDobaPhase,
  opts: {
    alive: boolean;
    canAct: boolean;
    hasActed: boolean;
    muted: boolean;
    isGhost: boolean;
    isAvenger?: boolean;
    /**
     * ANTI-LEAK: tokom noćne osvete (osvetaPublic=false) selo ne sme da
     * sazna da je Suđaja pala — hint tada ostaje neutralan "noć se
     * produžava". Prosledi host.osvetaPublic.
     */
    osvetaPublic?: boolean;
  }
): string | null {
  // Pala Suđaja je duh, ali u osveti IGRA — njen hint ima prednost.
  if (phase === 'osveta' && opts.isAvenger) {
    return 'Ti si Suđaja — ne odlaziš sama! Izaberi koga povlačiš sa sobom.';
  }
  if (opts.isGhost && phase !== 'kraj') {
    return 'Mrtav si — ali duh vidi SVE uloge. Ne otkrivaj ništa živima! Ako te Bajačica pozove, odgovori na njeno pitanje.';
  }
  switch (phase) {
    case 'podela-uloga':
      return 'Pročitaj svoju ulogu i DOBRO zapamti opis — kartica se više neće prikazati ovako krupno. Ekran ne pokazuješ nikome, ni najboljem prijatelju.';
    case 'noc':
      if (opts.canAct && !opts.hasActed)
        return 'Tvoj red za noćnu akciju — izaberi metu. Bez brige: svi ekrani izgledaju isto, niko ne zna da li „radiš nešto“ ili samo šapućeš.';
      if (opts.canAct && opts.hasActed)
        return 'Odigrano — sačekaj da i ostali završe. Drži telefon kao i svi drugi, ništa ne komentariši.';
      return 'Nemaš noćnu moć — pošalji „šapat sumnje“ na igrača kome ne veruješ. Dva najšaputanija se javno vide u zoru.';
    case 'osveta':
      if (opts.isAvenger)
        return 'Ti si Suđaja — ne odlaziš sama! Izaberi koga povlačiš sa sobom.';
      return opts.osvetaPublic
        ? 'Suđaja bira koga vodi sa sobom — može i tebe. Čekaj…'
        : 'Noć se produžava — neko u mraku još odlučuje. Čekaj…';
    case 'zora':
      return 'Pogledaj ko je stradao i šta kažu šapati. Poveži sa sinoćnim ponašanjem — ko je bio „prebrz“, ko preterano miran?';
    case 'diskusija':
      return 'Spusti telefon i pričaj UŽIVO. Ne otkrivaj svoju ulogu olako — i pazi: ko preglasno optužuje, često nešto krije.';
    case 'glasanje':
      if (opts.muted)
        return 'Bauk te je noćas prestravio — danas NE glasaš. Selo to vidi, iskoristi raspravu da utičeš rečima.';
      return 'Glasaj koga selo šalje na vešala — ili budi uzdržan ako nisi siguran. Nerešeno = niko ne strada.';
    case 'presuda':
      return 'Rezultat je tu. Zapamti KO je za koga glasao po raspravi — obrasci glasanja odaju čopor.';
    case 'kraj':
      return 'Sve karte na sto — pogledaj ko je bio ko i šta si (ni)si provalio.';
    default:
      return null;
  }
}

/**
 * Crtice o toku igre — u tutorial modu stoje na vrhu "?" modala,
 * iznad liste uloga u partiji.
 */
export const GLUVO_CHEAT_FLOW: string[] = [
  'Tok: Noć → Zora → Diskusija → Glasanje → Presuda → nova Noć… dok jedna strana ne pobedi.',
  'Noću vukodlaci biraju žrtvu, specijalci koriste moći, a svi ostali šalju anonimni „šapat sumnje“ (top 2 se vide u zoru).',
  'Danju se raspravlja uživo, pa se na telefonima glasa koga selo šalje na vešala (može i uzdržano).',
  'Selo pobeđuje kad padne cela mračna strana; vukodlaci kad ih bude koliko i preostalog sela.',
  'Tvoja uloga je TAJNA do kraja — ekran ne pokazuješ nikome, a mrtvi ne otkrivaju šta znaju.',
];
