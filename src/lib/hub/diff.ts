import { oneLine } from "./safe-text";
import type { HarnessContent, ItemKind, Part } from "./types";

/**
 * Comparing two versions of a harness.
 *
 * A harness is compared field by field: its name, goal, description, prompt,
 * variables, each part, and the order of the parts. The same field list is
 * what suggestions are merged with, so "what changed" and "what a suggestion
 * changes" always mean the same thing.
 *
 * A part that is a piece is told apart by the slug of its piece, and is that
 * link and nothing else: the name stored with it is only what the piece was
 * called when the harness was last saved, and the piece's text has versions
 * of its own. Text still inside a harness, from before pieces, is told apart
 * by its name.
 */

/** The parts of a version that can change. */
export type Fields = { name: string; goal: string; description: string; content: HarnessContent; kind?: ItemKind };

const NAME = "name";
const GOAL = "goal";
const DESCRIPTION = "description";
const PROMPT = "prompt";
const VARIABLES = "variables";
const ORDER = "order";
const WHEN = "when";
const ICON = "icon";
const NOTES = "notes";
const SCHEDULE = "schedule";
const TESTED = "testedOn";
/** A part whose text is inside the harness, by its name. */
const PART = "part:";
/** A part that is a piece, by the piece's slug. */
const PIECE = "piece:";

/** What tells one part of a harness from the others. */
const idOf = (p: Part) => (p.piece ? PIECE + p.piece : PART + p.name);
const isPart = (key: string) => key.startsWith(PART) || key.startsWith(PIECE);
const partAt = (f: Fields, key: string) => f.content.parts.find((p) => idOf(p) === key);

/** A memory piece's team notes as one comparable value: left out, turned off, or the lines themselves. */
const notesValue = (f: Fields) => (f.content.notes === undefined ? "" : f.content.notes === null ? "\u0000off" : `on\n${f.content.notes}`);

/**
 * A part as one string that depends only on what it says, not on how the
 * object was built: the database and a fresh save order their keys differently.
 */
function partValue(p: Part): string {
  // A part that is a piece is that link: neither the piece's name nor its text is this harness's to change.
  if (p.piece) return JSON.stringify([p.kind, "piece", p.piece]);
  return JSON.stringify([p.kind, p.name, p.summary ?? "", p.body, p.icon ?? "", p.when ?? ""]);
}

function value(f: Fields, key: string): string | undefined {
  if (key === NAME) return f.name;
  if (key === GOAL) return f.goal;
  if (key === DESCRIPTION) return f.description;
  if (key === PROMPT) return f.content.prompt;
  if (key === VARIABLES) return JSON.stringify(f.content.variables.map((v) => [v.key, v.label, v.default || null]));
  if (key === ORDER) return JSON.stringify(f.content.parts.map(idOf));
  if (key === WHEN) return f.content.when ?? "";
  if (key === ICON) return f.content.icon ?? "";
  if (key === NOTES) return notesValue(f);
  if (key === SCHEDULE) return f.content.schedule ?? "";
  if (key === TESTED) return f.content.testedOn ?? "";
  const part = partAt(f, key);
  return part ? partValue(part) : undefined;
}

function keysOf(f: Fields): string[] {
  return [NAME, GOAL, DESCRIPTION, PROMPT, VARIABLES, SCHEDULE, TESTED, WHEN, ICON, NOTES, ...f.content.parts.map(idOf)];
}

/** The parts both versions have, in this version's order. */
function sharedOrder(f: Fields, other: Fields): Part[] {
  const there = new Set(other.content.parts.map(idOf));
  return f.content.parts.filter((p) => there.has(idOf(p)));
}

/** The fields that differ between two versions. */
export function changedKeys(a: Fields, b: Fields): string[] {
  // Only a harness has a goal. A shared piece saved with one before that was settled is not "changed" by losing it.
  const piece = [a.kind, b.kind].some((kind) => kind !== undefined && kind !== "harness");
  const keys = [...new Set([...keysOf(a), ...keysOf(b)])].filter((k) => !(piece && k === GOAL) && value(a, k) !== value(b, k));
  // Adding or removing a part is not a change of order; moving one is.
  if (sharedOrder(a, b).map(idOf).join("\n") !== sharedOrder(b, a).map(idOf).join("\n")) keys.push(ORDER);
  return keys;
}

/**
 * How a changed field is named to people: `part "Run log"`, `added part "X"`,
 * `variables`. Part names are typed by people, so they appear as one quoted
 * line and nothing else.
 */
export function labelOf(key: string, before: Fields, after: Fields): string {
  if (key === ORDER) return "order of parts";
  if (!isPart(key)) {
    // A shared piece has a text and a summary where a harness has a prompt and a description.
    const piece = (after.kind ?? before.kind ?? "harness") !== "harness";
    if (piece && key === PROMPT) return "text";
    if (piece && key === DESCRIPTION) return "summary";
    if (key === WHEN) return "when it applies";
    if (key === NOTES) return "team notes";
    if (key === TESTED) return "tested on";
    return key;
  }
  // A part is named the way the harness last read it: for a piece, the name it had then, or its slug.
  const part = partAt(after, key) ?? partAt(before, key);
  const name = JSON.stringify(oneLine(part?.name || part?.piece || key.slice(key.indexOf(":") + 1), 80));
  if (value(before, key) === undefined) return `added part ${name}`;
  if (value(after, key) === undefined) return `removed part ${name}`;
  return `part ${name}`;
}

export function describeChanges(before: Fields, after: Fields): string[] {
  return changedKeys(before, after).map((k) => labelOf(k, before, after));
}

/**
 * The same version with each linked part under the name given for its piece.
 * A link stores the name its piece had when the harness was last saved; a
 * record of what changed should call a part what people read it as today.
 */
export function withNames<T extends Fields>(f: T, names: Map<string, string>): T {
  return { ...f, content: { ...f.content, parts: f.content.parts.map((p) => (p.piece && names.has(p.piece) ? { ...p, name: names.get(p.piece) as string } : p)) } };
}

/**
 * The shared pieces a change would make a harness use that it does not use
 * yet. A diff shows such a part as a link only, so whoever decides on the
 * change is told to read the piece itself: its text would be followed here.
 */
export function addedLinks(before: Fields, after: Fields): string[] {
  const had = new Set(before.content.parts.flatMap((p) => (p.piece ? [p.piece] : [])));
  return [...new Set(after.content.parts.flatMap((p) => (p.piece && !had.has(p.piece) ? [p.piece] : [])))];
}

/**
 * Applies the changes from `base` to `proposed` on top of `latest`.
 *
 * Works when none of the fields the suggestion changes were changed in the
 * harness since the suggestion was made. Otherwise returns those fields, so
 * the owner can see why it cannot be merged as it is.
 */
export function mergeOnto(
  base: Fields,
  proposed: Fields,
  latest: Fields,
): { ok: true; result: Fields } | { ok: false; conflicts: string[] } {
  // Team notes are added by runs, never by a suggestion: they take no part in a merge.
  const keys = changedKeys(base, proposed).filter((k) => k !== NOTES);
  const conflicts = keys.filter((k) => value(latest, k) !== value(base, k));
  if (conflicts.length) return { ok: false, conflicts: conflicts.map((k) => labelOf(k, base, proposed)) };

  const parts: Part[] = [];
  for (const p of latest.content.parts) {
    if (!keys.includes(idOf(p))) parts.push(p);
    else {
      const next = partAt(proposed, idOf(p));
      if (next) parts.push(next); // changed; a missing one was removed
    }
  }
  // A part the suggestion added (or renamed, or put in another's place) goes where the proposal
  // has it: right after the nearest part before it that the result already holds.
  proposed.content.parts.forEach((p, i) => {
    if (!keys.includes(idOf(p)) || partAt(latest, idOf(p))) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const before = proposed.content.parts[j];
      // By what tells it apart; failing that by its name: a suggestion from before pieces names as text
      // a part that is a piece by now, and the piece kept the name the text had.
      let k = parts.findIndex((x) => idOf(x) === idOf(before));
      if (k === -1) k = parts.findIndex((x) => x.name === before.name);
      if (k !== -1) {
        at = k + 1;
        break;
      }
    }
    parts.splice(at, 0, p);
  });
  if (value(latest, ORDER) === value(base, ORDER)) {
    // The harness still has the parts it had, in the order it had them, so
    // every part here has a place in the proposal: use the proposal's order.
    // (A suggestion that moves parts always gets here: otherwise it conflicts.)
    const place = new Map(proposed.content.parts.map((p, i) => [idOf(p), i]));
    parts.sort((x, y) => (place.get(idOf(x)) ?? 0) - (place.get(idOf(y)) ?? 0));
  }

  return {
    ok: true,
    result: {
      name: keys.includes(NAME) ? proposed.name : latest.name,
      kind: latest.kind,
      goal: keys.includes(GOAL) ? proposed.goal : latest.goal,
      description: keys.includes(DESCRIPTION) ? proposed.description : latest.description,
      content: {
        prompt: keys.includes(PROMPT) ? proposed.content.prompt : latest.content.prompt,
        variables: keys.includes(VARIABLES) ? proposed.content.variables : latest.content.variables,
        parts,
        when: keys.includes(WHEN) ? proposed.content.when : latest.content.when,
        icon: keys.includes(ICON) ? proposed.content.icon : latest.content.icon,
        ...((keys.includes(SCHEDULE) ? proposed.content.schedule : latest.content.schedule) ? { schedule: keys.includes(SCHEDULE) ? proposed.content.schedule : latest.content.schedule } : {}),
        ...((keys.includes(TESTED) ? proposed.content.testedOn : latest.content.testedOn) ? { testedOn: keys.includes(TESTED) ? proposed.content.testedOn : latest.content.testedOn } : {}),
        // Team notes are never a suggestion's to change: the copy it carries is as old as the suggestion,
        // and lines added since would be lost. The latest notes always stay.
        ...(latest.content.notes !== undefined ? { notes: latest.content.notes } : {}),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Line diffs, for showing what changed in a piece of text
// ---------------------------------------------------------------------------

export type DiffLine = { op: " " | "-" | "+"; text: string };

const MAX_LINES = 600;
const GAP = "…";

/** Line-by-line diff (longest common subsequence), with `context` unchanged lines around each change. */
export function lineDiff(before: string, after: string, context = 2): DiffLine[] {
  const a = before === "" ? [] : before.split(/\r?\n/);
  const b = after === "" ? [] : after.split(/\r?\n/);
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [...a.map((text) => ({ op: "-" as const, text })), ...b.map((text) => ({ op: "+" as const, text }))];
  }
  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const all: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      all.push({ op: " ", text: a[i] });
      i++;
      j++;
    } else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      all.push({ op: "-", text: a[i++] }); // removed lines first, then what replaced them
    } else {
      all.push({ op: "+", text: b[j++] });
    }
  }
  // Keep the changed lines and their context; one gap line stands for each run that is left out.
  const out: DiffLine[] = [];
  let gap = false;
  all.forEach((line, n) => {
    const near = all.slice(Math.max(0, n - context), n + context + 1).some((x) => x.op !== " ");
    if (near) {
      if (gap && out.length) out.push({ op: " ", text: GAP });
      out.push(line);
      gap = false;
    } else gap = true;
  });
  return out;
}

/** The text of a field, for diffing. Parts show what they are, then their text; variables one per line. */
function textOf(f: Fields, key: string, other: Fields): string {
  if (key === NAME) return f.name;
  if (key === GOAL) return f.goal;
  if (key === DESCRIPTION) return f.description;
  if (key === PROMPT) return f.content.prompt;
  if (key === ORDER) return sharedOrder(f, other).map((p) => p.name || p.piece || "").join("\n");
  if (key === WHEN) return f.content.when ?? "";
  if (key === ICON) return f.content.icon ?? "";
  if (key === NOTES) return f.content.notes === null ? "(takes no team notes)" : (f.content.notes ?? "");
  if (key === SCHEDULE) return f.content.schedule ?? "(none)";
  if (key === TESTED) return f.content.testedOn ?? "(none)";
  if (key === VARIABLES) {
    return f.content.variables.map((v) => `${v.key}: ${v.label}${v.default ? ` (default: ${v.default})` : " (required)"}`).join("\n");
  }
  const part = partAt(f, key);
  if (!part) return "";
  if (part.piece) return `Kind: ${part.kind}\nPiece: ${part.piece}`;
  return [
    `Kind: ${part.kind}`,
    part.summary ? `Summary: ${part.summary}` : "",
    part.when ? `When: ${part.when}` : "",
    part.icon ? `Icon: ${part.icon}` : "",
    part.body,
  ]
    .filter(Boolean)
    .join("\n");
}

export type FieldDiff = { label: string; lines: DiffLine[] };

export function fieldDiffs(before: Fields, after: Fields): FieldDiff[] {
  return changedKeys(before, after).map((key) => ({
    label: labelOf(key, before, after),
    lines: lineDiff(textOf(before, key, after), textOf(after, key, before)),
  }));
}

/**
 * A diff as plain text for Claude, capped so it can never flood a reply.
 * `cut` says the text stops early, so the caller can say so in its own words.
 */
export function renderDiffs(diffs: FieldDiff[], max = 20_000): { text: string; cut: boolean } {
  if (diffs.length === 0) return { text: "No differences.", cut: false };
  let out = "";
  for (const d of diffs) {
    out += `=== ${d.label} ===\n${d.lines.map((l) => `${l.op} ${l.text}`).join("\n")}\n\n`;
    if (out.length > max) return { text: `${out.slice(0, max)}\n…`, cut: true };
  }
  return { text: out.trimEnd(), cut: false };
}
