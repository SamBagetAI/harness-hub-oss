import type { Member } from "./members";
import { day, emailText, oneLine, quoted } from "./safe-text";
import type { HarnessSummary } from "./types";

/**
 * Turning what a person says ("Ada's morning inbox brief") into a harness.
 *
 * The catalog is small, so this is word matching, not a search engine. What
 * matters more than ranking is honesty about doubt: Claude is told "run it"
 * only when one harness matched every meaningful word. In every other case it
 * is told what exists and to ask the person, because loading the wrong
 * person's harness is worse than asking one question.
 */

/** Words that say nothing about which harness is meant. */
const FILLER = new Set([
  "a", "an", "the", "my", "our", "your", "me", "i", "we", "it", "is", "that", "this",
  "for", "from", "of", "on", "in", "to", "and", "or", "with", "by",
  "run", "load", "find", "show", "get", "list", "start", "use", "please", "what", "which", "do", "have",
  "routine", "routines", "harness", "harnesses", "agent", "agents", "hub", "account", "saved",
]);

function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // "Zoë" -> "Zoe"
    .toLowerCase()
    .replace(/['’]s\b/g, "") // "Ada's" -> "ada"
    .split(/[^\p{L}\p{N}@.]+/u)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
}

/** Short words must match exactly ("x"); longer ones may match the start of a word ("morn"). */
function startsOrEquals(queryWord: string, haystack: string[]): boolean {
  return haystack.some((w) => (queryWord.length >= 3 ? w.startsWith(queryWord) : w === queryWord));
}

function ownerWords(h: HarnessSummary): string[] {
  return words(`${h.owner.name} ${h.owner.email} ${h.owner.email.split("@")[0]}`);
}

/** Name, slug and owner identify a harness. */
function identityWords(h: HarnessSummary): string[] {
  return [...words(`${h.name} ${h.slug.replace(/-/g, " ")}`), ...ownerWords(h)];
}

function newestFirst(all: HarnessSummary[]): HarnessSummary[] {
  const time = (h: HarnessSummary) => Date.parse(h.savedAt) || 0;
  return [...all].sort((a, b) => time(b) - time(a));
}

export type SearchResult = {
  /** Whether the person gave any meaningful words or an owner. False means a plain "list everything". */
  asked: boolean;
  /** False when nothing matched and the full list is returned instead. */
  matched: boolean;
  /** The owner the person named, when nobody by that name has saved a harness. */
  ownerMissed: string | null;
  /** Meaningful query words that the best result did not match. */
  unmatched: string[];
  /**
   * True only when exactly one harness matched everything the person said, by
   * its name, slug or owner. A match on a word in the description alone is
   * never enough to tell Claude to go ahead.
   */
  confident: boolean;
  harnesses: HarnessSummary[];
};

export function searchHarnesses(all: HarnessSummary[], query?: string, owner?: string): SearchResult {
  const everything = newestFirst(all);
  const queryWords = [...new Set(words(query ?? ""))].filter((w) => !FILLER.has(w));
  const ownerQuery = [...new Set(words(owner ?? ""))];
  const asked = queryWords.length > 0 || ownerQuery.length > 0;

  if (!asked) {
    return { asked, matched: true, ownerMissed: null, unmatched: [], confident: false, harnesses: everything };
  }

  // A slug written out whole settles it: "Run the harness morning-inbox-brief"
  // means that one, even when a copy named after it matches the same words.
  // Only slugs with a hyphen count, so an everyday word is never taken for one.
  const typed = (query ?? "").toLowerCase().split(/[^a-z0-9-]+/).filter((t) => t.includes("-"));
  const bySlug = everything.filter((h) => typed.includes(h.slug));
  if (bySlug.length === 1 && (ownerQuery.length === 0 || ownerQuery.some((w) => startsOrEquals(w, ownerWords(bySlug[0]))))) {
    return { asked, matched: true, ownerMissed: null, unmatched: [], confident: true, harnesses: bySlug };
  }

  const scored = everything.map((h) => {
    const identity = identityWords(h);
    const description = words(`${h.goal} ${h.description}`);
    // A word in the name, slug or owner identifies the harness. A word that is
    // only in the goal or the description counts for less, and only as a whole word.
    const strong = queryWords.filter((w) => startsOrEquals(w, identity));
    const weak = queryWords.filter((w) => !strong.includes(w) && description.includes(w));
    const byOwner = ownerQuery.some((w) => startsOrEquals(w, ownerWords(h)));
    return { h, strong, weak, byOwner };
  });

  const ownerMatchedSomeone = scored.some((s) => s.byOwner);
  const ownerMissed = ownerQuery.length > 0 && !ownerMatchedSomeone ? oneLine(owner ?? "", 80) : null;

  const candidates = scored
    // A named owner who has harnesses narrows the search to theirs.
    .filter((s) => (ownerMatchedSomeone ? s.byOwner : true))
    .filter((s) => {
      if (queryWords.length === 0) return s.byOwner;
      return s.strong.length > 0 || s.weak.length * 2 >= queryWords.length;
    })
    .sort((a, b) => b.strong.length * 3 + b.weak.length - (a.strong.length * 3 + a.weak.length));

  if (candidates.length === 0) {
    return { asked, matched: false, ownerMissed, unmatched: queryWords, confident: false, harnesses: everything };
  }

  // Harnesses whose name, slug or owner match every word push out the ones
  // that match only some. Without this, "Ada's morning inbox brief" would stop
  // being a clear match the day Ada saves a second harness, because both
  // match "Ada". Words found only in a goal or description do not count
  // here: a harness that merely mentions the words must not hide the one named.
  const complete = candidates.filter((s) => queryWords.every((w) => s.strong.includes(w)));
  const shown = complete.length > 0 ? complete : candidates;

  const best = shown[0];
  const unmatched = queryWords.filter((w) => !best.strong.includes(w) && !best.weak.includes(w));
  const identified = best.strong.length > 0 || (queryWords.length === 0 && best.byOwner);
  const confident = shown.length === 1 && identified && unmatched.length === 0 && ownerMissed === null;
  return { asked, matched: true, ownerMissed, unmatched, confident, harnesses: shown.map((c) => c.h) };
}

function line(h: HarnessSummary, more = ""): string {
  // One line on what it is: its goal, or for older harnesses what it does.
  const description = oneLine(h.goal || h.description, 200);
  const copy = h.copiedFrom ? ` · copy of ${h.copiedFrom}` : "";
  const seen = h.visibility === "private" ? " · private" : "";
  const waiting = h.openSuggestions ? ` · ${h.openSuggestions} open suggestion${h.openSuggestions === 1 ? "" : "s"}` : "";
  const kind = h.kind === "harness" ? "" : ` · ${h.kind}`;
  return `- ${h.slug}${kind} · ${quoted(h.name, 120)} · owner ${quoted(h.owner.name, 80)} <${emailText(h.owner.email)}> · v${h.version} · saved ${day(h.savedAt)}${seen}${copy}${more}${waiting}${description ? ` · ${JSON.stringify(description)}` : ""}`;
}

/**
 * `what` says what was searched: harnesses, or the pieces they are built from.
 * `more` adds a fact the Hub knows about a result to its line, for a piece: where it is used.
 */
export function renderSearch(member: Member, result: SearchResult, what: "harness" | "piece" = "harness", more?: (h: HarnessSummary) => string): string {
  const one = what === "harness" ? "harness" : "piece";
  const many = what === "harness" ? "harnesses" : "pieces";
  const load = what === "harness" ? "harness_hub_get_harness" : "harness_hub_get_piece";
  const lines: string[] = [`Signed in to Harness Hub as ${emailText(member.email)}.`, ""];
  const count = result.harnesses.length;

  if (count === 0) {
    lines.push(`Harness Hub has no ${many} yet.`);
    return lines.join("\n");
  }

  const harnesses = `${count} ${count === 1 ? one : many}`;
  const everything = "Here is everything in Harness Hub:";
  const notByThem = result.ownerMissed
    ? `No ${one} is owned by anyone matching ${quoted(result.ownerMissed, 80)}. `
    : "";

  if (!result.asked) {
    lines.push(`${harnesses} in Harness Hub:`);
  } else if (!result.matched) {
    lines.push(`${notByThem || `No ${one} matched those words. `}${what === "harness" ? everything : "Here are all the pieces of that kind:"}`);
  } else if (result.ownerMissed) {
    lines.push(`${notByThem}Closest by the other words:`);
  } else if (result.unmatched.length > 0) {
    lines.push(`Closest ${count === 1 ? one : many} (nothing matched ${result.unmatched.map((w) => quoted(w, 40)).join(", ")}):`);
  } else {
    lines.push(`${harnesses} found:`);
  }

  for (const h of result.harnesses) lines.push(line(h, more?.(h)));

  lines.push("");
  const verb = what === "harness" ? "run" : "read";
  if (result.confident) {
    lines.push(`To ${verb} it, call ${load} with its slug.`);
  } else if (!result.asked) {
    lines.push(`To ${verb} one, call ${load} with its slug.`);
  } else {
    lines.push(
      `This may not be what the person asked for. Tell them what exists and who owns it, and ask which one they mean before calling ${load}.`,
    );
  }
  if (what === "piece") {
    lines.push("To use a piece in a harness: harness_hub_save on the harness, with add_part and piece set to the piece's slug. To change a piece: harness_hub_save with the piece's own slug.");
  }
  return lines.join("\n");
}
