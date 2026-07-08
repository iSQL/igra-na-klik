import type { GluvoDobaNightActionType, GluvoDobaRoleId } from '@igra/shared';
import { GLUVO_DOBA_ROLES, GLUVO_DOBA_HINT_GROUPS } from '@igra/shared';

/**
 * Pure night-resolution pipeline for Gluvo doba. Deterministic order:
 *
 *   1. Todorac's block lands first (from his raw pick) — the blocked
 *      player's action is void for the night, including the Zduhać's
 *      passive intercept.
 *   2. Raskovnik frees the blocked player (if he wasn't blocked himself
 *      and picked the right person) — the action is restored.
 *   3. Vila's enchant redirects the (unblocked) enchanted actor's target
 *      to a random different valid living player. Block/unblock are
 *      already resolved by then and are exempt.
 *   4. Wolves' votes are tallied (skipped entirely on a configured
 *      peaceful first night); the top target is the victim, ties break
 *      randomly among the tied top.
 *   5. Morana freezes her own victim on her kill nights — a second,
 *      independent death.
 *   6. Zmaj's protection cancels a matching wolf and/or Morana kill.
 *   7. The Zduhać's one-time passive intercepts a still-standing WOLF kill
 *      (never Morana's) — publicly revealing him at dawn.
 *   8. Vračara's hint is generated for her post-redirect target; if she
 *      was blocked she learns only that the vision failed.
 *   9. Bauk's fear marks his target as unable to vote the next day.
 *  10. 'whisper' picks (Domaćin, Suđaja, Knez, Zduhać, Lesnik — and yes,
 *      Drekavac: the informant's whisper deliberately poisons the pool;
 *      Morana whispers on her off-nights) aggregate into the dawn "šapat
 *      sumnje" top list. Ghosts never whisper.
 *
 * Randomness enters only through redirects and tie-breaks; keeping the
 * whole thing a pure function of its inputs makes the trickiest game logic
 * reviewable and testable in isolation.
 */

export interface NightResolutionInput {
  roles: Map<string, GluvoDobaRoleId>;
  alive: Set<string>;
  /** Raw actorId -> targetId picks (pre-block, pre-redirect). */
  nightActions: Map<string, string>;
  lastProtectedId: string | null;
  night: number; // 1-based, for history entries
  /** Configured "no blood on the first night" rule is active tonight. */
  peacefulNight: boolean;
  /** Tonight is one of Morana's kill nights (even nights). */
  moranaKillNight: boolean;
  /** The Zduhać already spent his one-time intercept. */
  zduhacSaveUsed: boolean;
  nameOf: (playerId: string) => string;
}

export interface NightDeath {
  playerId: string;
  cause: 'wolves' | 'morana';
}

export interface NightResolutionOutcome {
  deaths: NightDeath[];
  /** The player whose action stayed blocked (null if none/freed). */
  blockedId: string | null;
  enchantedTonightId: string | null;
  newLastProtectedId: string | null;
  seerEntry: { night: number; targetName: string; hintText: string } | null;
  /** The Zduhać spent his intercept tonight (public reveal at dawn). */
  zduhacSavedBy: string | null;
  /** Bauk's victim — cannot vote on the following day. */
  mutedTodayId: string | null;
  whisperTop: { name: string; count: number }[];
}

function pickRandom<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

export function resolveNight(
  input: NightResolutionInput
): NightResolutionOutcome {
  const { roles, alive, nightActions, lastProtectedId, nameOf } = input;

  const actionTypeOf = (playerId: string): GluvoDobaNightActionType | null => {
    const role = roles.get(playerId);
    return role ? GLUVO_DOBA_ROLES[role].nightActionType : null;
  };
  const actorWith = (type: GluvoDobaNightActionType): string | null => {
    for (const actorId of nightActions.keys()) {
      if (actionTypeOf(actorId) === type) return actorId;
    }
    return null;
  };

  // 1. Todorac tramples — the blocked player's power is off tonight.
  const blockerId = actorWith('block');
  let blockedId = (blockerId ? nightActions.get(blockerId) : undefined) ?? null;

  // 2. Raskovnik's herb breaks the block (unless he was trampled himself).
  const raskovnikId = actorWith('unblock');
  if (
    blockedId !== null &&
    raskovnikId !== null &&
    raskovnikId !== blockedId &&
    nightActions.get(raskovnikId) === blockedId
  ) {
    blockedId = null;
  }

  const isBlocked = (playerId: string) => playerId === blockedId;

  // 3. Vila enchants (her own pick is never redirected — no self-target).
  const enchanterId = actorWith('enchant');
  const enchantActive = enchanterId !== null && !isBlocked(enchanterId);
  const enchantedTonightId = enchantActive
    ? nightActions.get(enchanterId!) ?? null
    : null;

  // Effective targets: blocked actors drop out; the enchanted actor's
  // target is scrambled (block/unblock are already resolved and exempt).
  const finalTargets = new Map<string, string>();
  for (const [actorId, targetId] of nightActions) {
    if (isBlocked(actorId)) continue;
    const actionType = actionTypeOf(actorId);
    if (actionType === 'block' || actionType === 'unblock') {
      finalTargets.set(actorId, targetId);
      continue;
    }
    if (actorId === enchantedTonightId && actorId !== enchanterId) {
      const pool = [...alive].filter((id) => {
        if (id === actorId || id === targetId) return false;
        // An enchanted Zmaj still can't land on last night's protectee.
        if (actionType === 'protect' && id === lastProtectedId) return false;
        return true;
      });
      finalTargets.set(actorId, pool.length > 0 ? pickRandom(pool) : targetId);
    } else {
      finalTargets.set(actorId, targetId);
    }
  }

  // 4. Wolves pick their victim by majority — unless tonight is bloodless.
  let wolfVictimId: string | null = null;
  if (!input.peacefulNight) {
    const wolfCounts = new Map<string, number>();
    for (const [actorId, targetId] of finalTargets) {
      if (actionTypeOf(actorId) === 'kill-vote') {
        wolfCounts.set(targetId, (wolfCounts.get(targetId) ?? 0) + 1);
      }
    }
    if (wolfCounts.size > 0) {
      const top = Math.max(...wolfCounts.values());
      const tied = [...wolfCounts.entries()]
        .filter(([, c]) => c === top)
        .map(([id]) => id);
      wolfVictimId = pickRandom(tied);
    }
  }

  // 5. Morana freezes on her kill nights.
  let moranaVictimId: string | null = null;
  const moranaId = actorWith('kill-solo');
  if (input.moranaKillNight && moranaId !== null) {
    moranaVictimId = finalTargets.get(moranaId) ?? null;
  }

  // 6. Zmaj's wing cancels a matching kill.
  const zmajId = actorWith('protect');
  const protectActive = zmajId !== null && !isBlocked(zmajId);
  const protectedId = protectActive
    ? finalTargets.get(zmajId!) ?? null
    : null;
  if (protectedId !== null) {
    if (wolfVictimId === protectedId) wolfVictimId = null;
    if (moranaVictimId === protectedId) moranaVictimId = null;
  }

  // 7. Zduhać's soul intercepts a still-standing wolf attack (once, and
  // only the wolves' — Morana's frost comes from another world).
  let zduhacSavedBy: string | null = null;
  if (wolfVictimId !== null && !input.zduhacSaveUsed) {
    for (const [id, role] of roles) {
      if (role !== 'zduhac') continue;
      if (alive.has(id) && !isBlocked(id)) {
        zduhacSavedBy = id;
        wolfVictimId = null;
      }
      break;
    }
  }

  // 8. Vračara's ambiguous vision of her (post-redirect) target.
  let seerEntry: NightResolutionOutcome['seerEntry'] = null;
  const seerId = actorWith('investigate');
  if (seerId !== null) {
    if (isBlocked(seerId)) {
      seerEntry = {
        night: input.night,
        targetName: nameOf(nightActions.get(seerId) ?? ''),
        hintText: 'Pregažena si u snu — vizija je propala.',
      };
    } else {
      const targetId = finalTargets.get(seerId);
      const targetRole = targetId ? roles.get(targetId) : undefined;
      const group = targetRole
        ? GLUVO_DOBA_HINT_GROUPS[GLUVO_DOBA_ROLES[targetRole].hintGroupId]
        : null;
      if (targetId && group) {
        seerEntry = {
          night: input.night,
          targetName: nameOf(targetId),
          hintText: group.text,
        };
      }
    }
  }

  // 9. Bauk scares his target out of tomorrow's vote.
  let mutedTodayId: string | null = null;
  const baukId = actorWith('fear');
  if (baukId !== null && !isBlocked(baukId)) {
    mutedTodayId = finalTargets.get(baukId) ?? null;
  }

  // 10. Suspicion whispers (Morana joins in on her off-nights).
  const whisperCounts = new Map<string, number>();
  for (const [actorId, targetId] of finalTargets) {
    const type = actionTypeOf(actorId);
    const whispers =
      type === 'whisper' ||
      (type === 'kill-solo' && !input.moranaKillNight);
    if (whispers) {
      whisperCounts.set(targetId, (whisperCounts.get(targetId) ?? 0) + 1);
    }
  }
  const whisperTop = [...whisperCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id, count]) => ({ name: nameOf(id), count }));

  const deaths: NightDeath[] = [];
  if (wolfVictimId !== null) {
    deaths.push({ playerId: wolfVictimId, cause: 'wolves' });
  }
  if (moranaVictimId !== null && moranaVictimId !== wolfVictimId) {
    deaths.push({ playerId: moranaVictimId, cause: 'morana' });
  }

  return {
    deaths,
    blockedId,
    enchantedTonightId,
    newLastProtectedId: protectedId,
    seerEntry,
    zduhacSavedBy,
    mutedTodayId,
    whisperTop,
  };
}
