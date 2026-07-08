import type { GluvoDobaNightActionType, GluvoDobaRoleId } from '@igra/shared';
import { GLUVO_DOBA_ROLES, GLUVO_DOBA_HINT_GROUPS } from '@igra/shared';

/**
 * Pure night-resolution pipeline for Gluvo doba. Deterministic order:
 *
 *   1. Vila's enchant is read from her raw pick.
 *   2. Every OTHER actor who is enchanted gets their target redirected to a
 *      random different valid living player — whatever the action (wolf
 *      kill vote, protection, investigation, whisper). The one exemption is
 *      'ask-dead': the ghosts were already asked about the raw target while
 *      the night was still running, so redirecting it afterwards would
 *      rewrite a question that was already answered.
 *   3. Wolves' (post-redirect) votes are tallied; the top target is the
 *      victim, ties break randomly among the tied top.
 *   4. Zmaj's protection cancels the kill if it matches the victim.
 *   5. Vidovnjak's hint is generated for his post-redirect target.
 *   6. Zduhać's ghost tally is summed.
 *   7. 'whisper' picks (Domaćin, Suđaja — the powerless night actions)
 *      aggregate into the dawn "šapat sumnje" top list. Ghosts never
 *      whisper: they see every role, so a ghost-fed aggregate would leak
 *      the wolves.
 *
 * Randomness enters only through redirects and tie-breaks; keeping the
 * whole thing a pure function of its inputs makes the trickiest game logic
 * reviewable and testable in isolation.
 */

export interface NightResolutionInput {
  roles: Map<string, GluvoDobaRoleId>;
  alive: Set<string>;
  /** Raw actorId -> targetId picks (pre-redirect). */
  nightActions: Map<string, string>;
  lastProtectedId: string | null;
  ghostVotes: Map<string, 'da' | 'ne'>;
  zduhacTargetId: string | null;
  night: number; // 1-based, for history entries
  nameOf: (playerId: string) => string;
}

export interface NightResolutionOutcome {
  /** Player killed by the wolves this night, if any (post-protection). */
  wolfVictimId: string | null;
  enchantedTonightId: string | null;
  newLastProtectedId: string | null;
  seerEntry: { night: number; targetName: string; hintText: string } | null;
  zduhacEntry: {
    night: number;
    targetName: string;
    da: number;
    ne: number;
  } | null;
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

  // 1. Vila enchants (her own pick is never redirected — no self-target).
  let enchanterId: string | null = null;
  for (const actorId of nightActions.keys()) {
    if (actionTypeOf(actorId) === 'enchant') enchanterId = actorId;
  }
  const enchantedTonightId =
    (enchanterId ? nightActions.get(enchanterId) : undefined) ?? null;

  // 2. Redirect the enchanted actor's target.
  const finalTargets = new Map<string, string>();
  for (const [actorId, targetId] of nightActions) {
    const actionType = actionTypeOf(actorId);
    if (
      actorId === enchantedTonightId &&
      actorId !== enchanterId &&
      actionType !== 'ask-dead'
    ) {
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

  // 3. Wolves pick their victim by majority of submitted votes.
  const wolfCounts = new Map<string, number>();
  for (const [actorId, targetId] of finalTargets) {
    if (actionTypeOf(actorId) === 'kill-vote') {
      wolfCounts.set(targetId, (wolfCounts.get(targetId) ?? 0) + 1);
    }
  }
  let intendedVictimId: string | null = null;
  if (wolfCounts.size > 0) {
    const top = Math.max(...wolfCounts.values());
    const tied = [...wolfCounts.entries()]
      .filter(([, c]) => c === top)
      .map(([id]) => id);
    intendedVictimId = pickRandom(tied);
  }

  // 4. Zmaj's wing over the victim cancels the kill.
  let protectedId: string | null = null;
  for (const [actorId, targetId] of finalTargets) {
    if (actionTypeOf(actorId) === 'protect') protectedId = targetId;
  }
  const wolfVictimId =
    intendedVictimId !== null && intendedVictimId === protectedId
      ? null
      : intendedVictimId;

  // 5. Vidovnjak's ambiguous vision of his (post-redirect) target.
  let seerEntry: NightResolutionOutcome['seerEntry'] = null;
  for (const [actorId, targetId] of finalTargets) {
    if (actionTypeOf(actorId) !== 'investigate') continue;
    const targetRole = roles.get(targetId);
    const group = targetRole
      ? GLUVO_DOBA_HINT_GROUPS[GLUVO_DOBA_ROLES[targetRole].hintGroupId]
      : null;
    if (group) {
      seerEntry = {
        night: input.night,
        targetName: nameOf(targetId),
        hintText: group.text,
      };
    }
  }

  // 6. Zduhać hears the dead (dead wolves may have lied — that's the game).
  let zduhacEntry: NightResolutionOutcome['zduhacEntry'] = null;
  if (input.zduhacTargetId) {
    let da = 0;
    let ne = 0;
    for (const v of input.ghostVotes.values()) {
      if (v === 'da') da += 1;
      else ne += 1;
    }
    zduhacEntry = {
      night: input.night,
      targetName: nameOf(input.zduhacTargetId),
      da,
      ne,
    };
  }

  // 7. Suspicion whispers.
  const whisperCounts = new Map<string, number>();
  for (const [actorId, targetId] of finalTargets) {
    if (actionTypeOf(actorId) === 'whisper') {
      whisperCounts.set(targetId, (whisperCounts.get(targetId) ?? 0) + 1);
    }
  }
  const whisperTop = [...whisperCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id, count]) => ({ name: nameOf(id), count }));

  return {
    wolfVictimId,
    enchantedTonightId,
    newLastProtectedId: protectedId,
    seerEntry,
    zduhacEntry,
    whisperTop,
  };
}
