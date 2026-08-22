import { recordQuizFeedback } from './quiz-feedback.js';

/**
 * Knjiženje prijava i ocena pitanja, za bilo koju igru koja vuče kviz pakete.
 *
 * Postoji da bi to bila jedna implementacija umesto tri: Kviz, KvizAtar i Vrući
 * krompir postavljaju ista pitanja iz istih paketa, pa i prijava „ovo je
 * netačno" mora da završi pod istim ključem — inače bi admin video prijave
 * samo iz jedne igre, a pitanje bi ostalo pogrešno u paketu.
 *
 * Ključ je stabilan i vezan za IZVOR (`pack:<id>:<index>`, `bank:<index>`), ne
 * za runtime id pitanja, jer se runtime id menja svaku partiju.
 */
export class QuizFeedbackTracker {
  /** Runtime id pitanja → stabilan ključ izvora. */
  private keys = new Map<string, string>();
  /** `<playerId>|<questionId>|<report|rating>` — jedan glas po igraču. */
  private seen = new Set<string>();

  /** Nova partija: mapiranja i glasovi iz prethodne ne važe. */
  reset(): void {
    this.keys.clear();
    this.seen.clear();
  }

  /** Pitanja iz jednog paketa, redosledom kojim stoje u manifestu. */
  registerPack(packId: string, questions: { id: string }[]): void {
    questions.forEach((q, i) => this.keys.set(q.id, `pack:${packId}:${i}`));
  }

  /** Ugrađena banka — nema paket, pa ide pod svoj prefiks. */
  registerBank(questions: { id: string }[]): void {
    questions.forEach((q, i) => this.keys.set(q.id, `bank:${i}`));
  }

  /** Da li se za ovaj runtime id uopšte zna gde da se prijava upiše. */
  knows(questionId: string): boolean {
    return this.keys.has(questionId);
  }

  /**
   * Obradi `quiz:feedback`: prijava kao netačno i/ili ocena 1–5 za pitanje
   * koje igrač identifikuje runtime id-jem.
   *
   * Id sme da bude i **ranije** pitanje iz iste partije, ne samo tekuće — na
   * telefonu se prijava često seti tek kad je ekran već otišao dalje, pa bi
   * uslov „samo trenutno pitanje" značio da se najgora pitanja nikad ne
   * prijave. Ništa se time ne otvara: mapiranje pokriva samo pitanja iz ove
   * partije, glas je i dalje jedan po igraču i po pitanju, a prijava ne dira
   * tok igre.
   *
   * Nepoznat ili zastareo id se tiho ignoriše (npr. pitanja uvezena iz fajla,
   * koja nemaju izvor u paketu).
   */
  handle(playerId: string, data: Record<string, unknown>): void {
    const questionId = typeof data.questionId === 'string' ? data.questionId : '';
    if (!questionId) return;
    const key = this.keys.get(questionId);
    if (!key) return;

    const report = data.report === true;
    const ratingRaw = data.rating;
    const rating =
      typeof ratingRaw === 'number' &&
      Number.isInteger(ratingRaw) &&
      ratingRaw >= 1 &&
      ratingRaw <= 5
        ? ratingRaw
        : undefined;

    const payload: { report?: boolean; rating?: number } = {};
    if (report && !this.seen.has(`${playerId}|${questionId}|report`)) {
      this.seen.add(`${playerId}|${questionId}|report`);
      payload.report = true;
    }
    if (rating !== undefined && !this.seen.has(`${playerId}|${questionId}|rating`)) {
      this.seen.add(`${playerId}|${questionId}|rating`);
      payload.rating = rating;
    }
    if (payload.report || payload.rating !== undefined) {
      recordQuizFeedback(key, payload);
    }
  }
}
