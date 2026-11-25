import { KINDS } from "./parts";
import type { HarnessView, PartKind } from "./types";

/**
 * The library: every skill, tool, hook and memory, by kind.
 *
 * Each one is a piece: saved by itself, with versions of its own, and used by
 * any number of harnesses.
 */

/** The harnesses that use a piece. */
export function usersOf(harnesses: HarnessView[], pieceSlug: string): HarnessView[] {
  return harnesses.filter((h) => h.content.parts.some((p) => p.piece === pieceSlug));
}

/**
 * The open suggestions that wait for whoever can change a harness: those on
 * the harness itself, and those on the pieces made for it. A change to a part
 * is suggested on the part's piece, so the harness alone would show none.
 */
export function waitingOn(h: HarnessView): number {
  return h.openSuggestions + h.content.parts.reduce((n, p) => n + (p.piece && p.madeFor === h.slug ? (p.pieceSuggestions ?? 0) : 0), 0);
}

export type LibraryCounts = Record<PartKind, number> & { harnesses: number };

export function libraryCounts(harnesses: HarnessView[], pieces: HarnessView[] = []): LibraryCounts {
  const counts = { harnesses: harnesses.length, skill: 0, tool: 0, hook: 0, memory: 0 };
  for (const kind of KINDS) {
    counts[kind] = pieces.filter((p) => p.kind === kind).length;
  }
  return counts;
}
