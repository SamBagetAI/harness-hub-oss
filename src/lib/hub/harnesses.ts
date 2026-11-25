import { describeChanges, type Fields, mergeOnto, withNames } from "./diff";
import type { Member } from "./members";
import { oneLine, personText, quoted, SLUG, VARIABLE_KEY } from "./safe-text";
import type { HarnessContent, HarnessView, ItemKind, Part, PartKind, Person, Suggestion, Variable } from "./types";
import { canSee, type Visibility } from "./visibility";
import { contentOf, db, HARNESSES, isCount, ROLES, type Row, seesSql, type Sql, SUGGESTIONS, VERSIONS } from "./db";
import { findHarness, findStored, KINDS, LATEST, NOTES_ONLY, pieceNames, piecesBySlug, PRIVATE_PIECE, TAKEN_OVER, toView, VIEW, writersOf } from "./read";
import { convertOldParts, ensureReady } from "./setup";
import { headOf, madeSlug } from "./slugs";

/**
 * The store. Pages and the connector ask it, in this file and the four next to it, and never the database directly.
 *
 * An item is a harness or a piece: a skill, tool, hook or memory. Both live in
 * the same tables and follow the same rules: a row holds what does not change
 * between versions (slug, kind, owner); every save adds a version row;
 * versions are never edited or deleted, and the latest one is the item as
 * people run it. A suggestion is a change someone proposed: it becomes a
 * version only when the owner or an editor merges it.
 *
 * A harness is built from pieces. It holds its prompt, its variables and an
 * ordered list of links, and reads the latest text of each piece when it is
 * loaded. Text that arrives inside a harness is made into pieces for it, so
 * every skill, tool, hook and memory can be found, loaded, saved and
 * suggested on by itself.
 *
 * This file saves, edits and suggests. The rest of the store sits next to it:
 * db.ts (tables and connection), setup.ts (getting the database ready),
 * read.ts (reading items and versions) and slugs.ts (slugs made from names).
 * Setup and this file call each other, and so do setup and read.ts: only from
 * inside functions, at run time, so the import cycle is safe.
 */

/** Who may change an item directly: its owner and its editors. For a piece made for a harness, also whoever can change that harness. */
export function canEdit(h: Pick<HarnessView, "owner" | "editors">, member: Member): boolean {
  return h.owner.email === member.email || h.editors.some((e) => e.email === member.email);
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

/** What a save or a suggestion changes. Fields left out keep their current value. */
export type Edit = {
  name?: string;
  /** What the agent is for, in one sentence. Harnesses only. */
  goal?: string;
  /** What it does. For a piece: its one-line summary. */
  description?: string;
  /** The prompt. For a piece: its text. */
  prompt?: string;
  variables?: Variable[];
  /** Harnesses only: when it is meant to run, in one line. null takes it away. */
  schedule?: string | null;
  /** Harnesses only: the models it works well on, in its owner's words, in one line. null takes it away. */
  testedOn?: string | null;
  /** Replaces all parts. */
  parts?: Part[];
  /**
   * Changes one part and leaves the others alone. The part is named by its
   * name, or by the slug of the piece behind it. A new name, text, summary,
   * timing or icon is a change to the piece itself: see textForPieces.
   * `pieceVersion` is the version of the piece that change was written on.
   * `piece` puts another piece in the part's place. `ownCopy` makes the
   * harness its own copy of the piece, with whatever else is sent as changes
   * to that copy, and leaves the original as it is.
   * For `when` and `icon`, null takes the value away.
   */
  updatePart?: {
    name: string;
    body?: string;
    summary?: string;
    newName?: string;
    when?: Part["when"] | null;
    icon?: Part["icon"] | null;
    piece?: string;
    pieceVersion?: number;
    ownCopy?: boolean;
  };
  /** Adds one part: a link to a piece (give `piece`), or text that becomes a piece made for this harness. */
  addPart?: Part;
  /** Removes the part with this name, or the part whose piece has this slug. The piece itself stays. */
  removePart?: string;
  /** Hook pieces only. Null takes the value away. */
  when?: Part["when"] | null;
  /** Tool pieces only. Null takes the value away. */
  icon?: Part["icon"] | null;
  /**
   * Memory pieces only. true lets runs leave team notes in it: the lines it had before come back.
   * false stops that and puts the lines aside. "empty" keeps it taking notes and starts again with none.
   */
  teamNotes?: boolean | "empty";
};

export type SaveInput = Edit & {
  slug: string;
  /** One line on what changed. Required: it is the version's label. */
  note: string;
  /** When creating: a harness (the default) or a piece of this kind. */
  kind?: ItemKind;
  /** When creating: start from this item's latest version. */
  copyOf?: string;
  /** The version the change was written on. A save is refused when the item has moved on since. */
  basedOn?: number;
  /** When creating: who sees it. A new item is private unless this says team. Changed later with setVisibility. */
  visibility?: Visibility;
};

export type SaveResult =
  | {
      ok: true;
      created: boolean;
      harness: HarnessView;
      changed: string[];
      /** Something the person should know about what the save did to other items. */
      note?: string;
      /** The pieces this save made, by slug: one for each part that arrived as text. */
      made?: string[];
      /** True when the save changed a piece and left the harness itself at its version. */
      pieceOnly?: boolean;
    }
  | { ok: false; message: string };

/** The whole of a harness as an agent receives it must stay well under Claude Code's result cap. This is the size it is saved at. */
export const MAX_TEXT = 60_000;

/**
 * Past this, the connector refuses to load a harness. Measured like MAX_TEXT: the prompt and the text of the
 * pieces with their team notes, not the run rules and headings the Hub adds around them.
 */
export const LOAD_LIMIT = 80_000;

/** The length of a loaded harness, measured like the limits: its prompt and its parts' text with their team notes. */
export function loadSize(h: Pick<HarnessView, "content">): number {
  return h.content.prompt.length + h.content.parts.reduce((n, p) => n + p.body.length + (p.notes?.length ?? 0), 0);
}
/** A piece is one part among others in every harness that uses it, so it stays much smaller. */
const MAX_PIECE = 20_000;

/** The length of a piece as a harness carries it: its text, and its team notes when it takes any. */
const pieceLength = (content: HarnessContent) => content.prompt.length + (typeof content.notes === "string" ? content.notes.length : 0);
/** Suggestions hold a full copy of the item, so an item takes a limited number of open ones. */
const MAX_OPEN_SUGGESTIONS = 20;
const MAX_COMMENTS = 50;
const MAX_EDITORS = 20;

/** Shapes that look like credentials. The Hub stores text only, never secrets. */
export const SECRET = /\b(sk-[A-Za-z0-9_-]{20,}|sk_(live|test)_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[0-9A-Z]{16})\b|\b(auth_token|ct0)=[A-Za-z0-9%]{16,}/;

export const LOOKS_SECRET = "This text contains what looks like a password, token or cookie. Harness Hub stores text only: remove it.";

/**
 * Lines the Hub itself writes when an agent loads a harness: around the whole
 * text, around a teammate's piece, around a memory's team notes. They are
 * never part of anyone's text. Stored as text they would stand outside the
 * real, freshly tagged lines of a later load, and what sits between them
 * (a teammate's words, the team's notes) would pass for the owner's own.
 */
const HUB_LINE = /^[\s\u200b\u200c\u200d\ufeff]*(HARNESS TEXT|TEAM MEMORY|TEAMMATE'S PIECE) [0-9a-f]{8} (BEGINS|ENDS)\b/m;
const HAS_HUB_LINE =
  "This text holds a line that Harness Hub itself writes when a harness is loaded: it starts with HARNESS TEXT, TEAMMATE'S PIECE or TEAM MEMORY, then a tag. Such lines are not part of the text. Send the text without them, and without the team notes that sit between two TEAM MEMORY lines.";

/**
 * A part's own text, from what an agent read under its heading. A teammate's
 * piece arrives between two tagged lines, and a memory's team notes follow
 * its text between two more. An agent that sends a part back as it read it
 * sends those too, so they are taken off: the notes with their two lines, and
 * the two lines around a teammate's piece, but only when they wrap the whole
 * text, as a load prints them. Tagged lines anywhere else stay, and the text
 * is then refused for them: a teammate's piece pasted into someone's own text
 * must never be stored as their words.
 */
export function ownTextOf(sent: string): string {
  const out: string[] = [];
  let notes: string | null = null; // inside a block of team notes: its tag
  for (const line of lf(sent).split("\n")) {
    const hub = line.match(/^(TEAM MEMORY) ([0-9a-f]{8}) (BEGINS|ENDS)\b/);
    if (notes !== null) {
      if (hub && hub[3] === "ENDS" && hub[2] === notes) notes = null;
    } else if (hub && hub[3] === "BEGINS") notes = hub[2];
    else out.push(line);
  }
  // A block of notes that never closes: what follows may be the sender's own words. Nothing is cut;
  // the text is left as it came, and is then refused for the line it holds.
  if (notes !== null) return lf(sent);
  const filled = out.flatMap((line, at) => (line.trim() ? [at] : []));
  const fence = (at: number | undefined) => (at === undefined ? null : out[at].match(/^TEAMMATE'S PIECE ([0-9a-f]{8}) (BEGINS|ENDS)\b/));
  const first = fence(filled[0]);
  const last = fence(filled[filled.length - 1]);
  if (filled.length >= 2 && first && last && first[2] === "BEGINS" && last[2] === "ENDS" && first[1] === last[1]) {
    return [...out.slice(0, filled[0]), ...out.slice(filled[0] + 1, filled[filled.length - 1]), ...out.slice(filled[filled.length - 1] + 1)].join("\n");
  }
  return out.join("\n");
}

const WHENS = ["start", "before_tool", "after_tool", "end"];
const ICONS = ["browser", "code", "send", "connector"];
const PART_KINDS = ["skill", "tool", "hook", "memory"];

function check(f: Fields, kind: ItemKind, was?: Fields, copy = false): string | null {
  const { content, name, goal, description } = f;
  if (!name.trim() || name.length > 80) return "The name must be 1 to 80 characters.";

  if (kind !== "harness") {
    if (description.length > 200) return "The summary must be at most 200 characters.";
    if (!content.prompt.trim()) return `A ${kind} needs its text.`;
    if (content.notes !== undefined && kind !== "memory") return "Only a memory takes team notes.";
    // A piece saved before this limit may be longer. It can still be renamed or cut, never made longer.
    // A copy is a new piece, and keeps to the limit whatever the length of the one it copies.
    const length = pieceLength(content);
    if (length > MAX_PIECE && !(was && !copy && length <= pieceLength(was.content))) {
      const what = typeof content.notes === "string" && content.notes ? "With its team notes it" : "The text";
      return `${what} would be ${length.toLocaleString("en-US")} characters; a piece holds at most ${MAX_PIECE.toLocaleString("en-US")}. Shorten it.`;
    }
    if (content.variables.length || content.parts.length) return "A piece is one text: it has no variables and no parts of its own.";
    if (content.when && (kind !== "hook" || !WHENS.includes(content.when))) return "Only a hook says when it applies: at the start, before a tool, after a tool or at the end.";
    if (content.icon && (kind !== "tool" || !ICONS.includes(content.icon))) return "Only a tool has an icon.";
    // Looked for in text this save brings, not in what was stored before: a line of team notes or a new name
    // must not be refused over a text nobody sent.
    if (content.prompt !== was?.content.prompt && HUB_LINE.test(content.prompt)) return HAS_HUB_LINE;
    return SECRET.test([name, goal, description, content.prompt, content.notes ?? ""].join("\n")) ? LOOKS_SECRET : null;
  }

  if (goal.length > 200) return "The goal must be one sentence of at most 200 characters.";
  if ((content.schedule ?? "").length > 200) return "The schedule must be one line of at most 200 characters, for example: At 06:44, Sunday through Thursday.";
  if ((content.testedOn ?? "").length > 200) return "Tested on must be one line of at most 200 characters, for example: Opus 5.5 in Claude; GPT-5 in Codex.";
  if (description.length > 300) return "The description must be at most 300 characters.";
  if (content.variables.length > 30) return "A harness can have at most 30 variables.";
  const keys = content.variables.map((v) => v.key);
  for (const v of content.variables) {
    if (!VARIABLE_KEY.test(v.key)) return `Variable name ${JSON.stringify(v.key)} must be lower-case letters, digits and underscores.`;
    if (v.label.length > 200 || (v.default ?? "").length > 200) return `The label and the default of ${v.key} must be at most 200 characters each.`;
  }
  if (new Set(keys).size !== keys.length) return "Two variables have the same name.";
  if (content.parts.length > 40) return "A harness can have at most 40 parts.";
  // A part that is a piece is told apart by its piece's slug, and goes by its piece's name. Only text that is
  // still inside the harness needs a name of its own here, and two such texts cannot share one.
  if (content.parts.some((p) => !p.name.trim() && !p.piece)) return "Every part needs a name.";
  const names = content.parts.filter((p) => !p.piece).map((p) => p.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "Two parts have the same name. Part names must be unique within a harness.";
  const stored = new Map((was?.content.parts ?? []).filter((p) => !p.piece).map((p) => [p.name, p.body]));
  const brought = [content.prompt === was?.content.prompt ? "" : content.prompt, ...content.parts.filter((p) => !p.piece && stored.get(p.name) !== p.body).map((p) => p.body)];
  if (HUB_LINE.test(brought.join("\n"))) return HAS_HUB_LINE;
  for (const p of content.parts) {
    if (!PART_KINDS.includes(p.kind)) return `${quoted(p.name, 80)} must be a skill, a tool, a hook or a memory.`;
    if (p.name.length > 80) return "A part's name must be at most 80 characters.";
    if ((p.summary ?? "").length > 200) return `The summary of ${quoted(p.name, 80)} must be at most 200 characters.`;
    if (p.when && !WHENS.includes(p.when)) return `${quoted(p.name, 80)} has an unknown "when".`;
    if (p.icon && !ICONS.includes(p.icon)) return `${quoted(p.name, 80)} has an unknown icon.`;
    if (p.piece && !SLUG.test(p.piece)) return `${quoted(p.name, 80)} points at a piece with an invalid slug.`;
  }
  const size = content.prompt.length + content.parts.reduce((n, p) => n + p.body.length, 0);
  if (size > MAX_TEXT) {
    return `The harness would be ${size.toLocaleString("en-US")} characters; the limit is ${MAX_TEXT.toLocaleString("en-US")}. Shorten the prompt or a part.`;
  }
  // Every text field a person can fill, not only the long ones.
  const all = [
    name,
    goal,
    description,
    content.schedule ?? "",
    content.testedOn ?? "",
    content.prompt,
    ...content.parts.flatMap((p) => [p.name, p.summary ?? "", p.body]),
    ...content.variables.flatMap((v) => [v.label, v.default ?? ""]),
  ].join("\n");
  if (SECRET.test(all)) return "This text contains what looks like a password, token or cookie. Harness Hub stores text only: remove it and turn it into a variable.";
  return null;
}

/** Notes, titles and comments are stored and shown too, so they get the same check as harness text. */
function checkNote(note: string, what = "Every save needs a note"): string | null {
  if (!note.trim() || note.length > 200) return `${what} of 1 to 200 characters saying what changed.`;
  return SECRET.test(note) ? LOOKS_SECRET : null;
}

/** Names are labels: one line, no stray spaces. They are typed by people and end up in sentences the Hub writes. */
const label = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * A browser sends the line breaks of a text box as CR LF. Stored text uses LF
 * alone, so a line that was not touched stays the same line in every version.
 */
const lf = (text: string) => text.replace(/\r\n?/g, "\n");

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A field that an edit can leave alone (undefined), set, or take away (null). */
const keep = <T>(next: T | null | undefined, was: T | undefined): T | undefined => (next === null ? undefined : (next ?? was));

/** A part as it is stored: the link to its piece, never the piece's text. Text that just arrived is kept until its piece is made. */
function storedPart(p: Part): Part {
  if (p.piece) return { kind: p.kind, name: label(p.name ?? ""), body: "", piece: p.piece.trim().toLowerCase() };
  return {
    kind: p.kind,
    name: label(p.name ?? ""),
    ...(p.summary ? { summary: p.summary } : {}),
    body: lf(p.body ?? ""),
    ...(p.icon ? { icon: p.icon } : {}),
    ...(p.when ? { when: p.when } : {}),
  };
}

/** Another piece in a part's place comes alone: a name or text sent with it would not say which of the two pieces it is for. */
const PIECE_ALONE = (name: string) =>
  `Send piece alone to put another piece in the place of ${quoted(name, 80)}. Nothing was saved. A new name or text sent with it would not say which of the two pieces it is for: change a piece by its own slug.`;

/** Applies an edit to a version, or says why it cannot be applied. */
export function applyEdit(
  slug: string,
  base: Fields | undefined,
  edit: Edit,
  kind: ItemKind,
  copy = false,
  /** Pieces the person saving cannot see: a refusal that lists the parts names none of them. */
  hidden: Set<string> = new Set(),
): Fields | string {
  // A piece named by its slug comes as it is. Text sent with the slug would be lost without a word, so it is refused:
  // for a piece this harness already uses, splitPieceEdits has taken such text for what it is, a change to the piece.
  const withText = [...(edit.parts ?? []), ...(edit.addPart ? [edit.addPart] : [])].find((p) => p.piece && (p.body ?? "").trim());
  if (withText) {
    return `The piece ${withText.piece} was sent with text of its own. Nothing was saved. To use the piece as it is, send its slug alone. To change it, save the piece itself: harness_hub_save with the slug ${withText.piece}.`;
  }
  let parts = (edit.parts ?? base?.content.parts ?? []).map(storedPart);
  const none = (name: string) =>
    `${slug} has no part named ${quoted(name, 80)}. Its parts are: ${parts.map((p) => (p.piece && hidden.has(p.piece) ? quoted(PRIVATE_PIECE, 80) : `${quoted(p.name, 80)}${p.piece ? ` (piece ${p.piece})` : ""}`)).join(", ") || "none"}.`;
  // A part is found by the slug of its piece, then by its name when its text is inside the harness, and last by
  // the name its piece had when the harness was saved. The name a piece has now is looked up in splitPieceEdits.
  const find = (name: string) => {
    const wanted = name.trim().toLowerCase();
    const byName = parts.findIndex((p) => !p.piece && sameName(p.name, name));
    const bySlug = parts.findIndex((p) => p.piece === wanted);
    if (bySlug !== -1) return bySlug;
    return byName !== -1 ? byName : parts.findIndex((p) => sameName(p.name, name));
  };

  if (edit.updatePart) {
    const u = edit.updatePart;
    const at = find(u.name);
    if (at === -1) return none(u.name);
    const target = parts[at];
    const ownCopy = Boolean(target.piece && u.ownCopy);
    const changes = u.body !== undefined || u.summary !== undefined || u.newName !== undefined || u.when !== undefined || u.icon !== undefined;
    // The harness's own copy of a piece: the copy's text takes the link's place here, and becomes a piece made for this harness.
    if (ownCopy && !u.body?.trim()) return `The piece ${target.piece} could not be read, so no copy of it was made.`;
    if (u.piece !== undefined && !ownCopy && changes) return PIECE_ALONE(target.name);
    if (target.piece && !ownCopy && changes) {
      return `${quoted(target.name, 80)} is the piece ${target.piece}, with versions of its own. Change it there: its slug is ${target.piece}.`;
    }
    parts = parts.map((p, i) => {
      if (i !== at) return p;
      if (ownCopy) return storedPart({ kind: p.kind, name: u.newName ?? p.name, summary: u.summary, body: u.body ?? "", when: u.when ?? undefined, icon: u.icon ?? undefined });
      // Another piece takes this part's place, in the same position.
      if (u.piece !== undefined) return storedPart({ kind: p.kind, name: "", body: "", piece: u.piece });
      return storedPart({
        ...p,
        body: u.body ?? p.body,
        summary: u.summary ?? p.summary,
        name: u.newName ?? p.name,
        when: keep(u.when, p.when),
        icon: keep(u.icon, p.icon),
      });
    });
  }
  if (edit.removePart !== undefined) {
    const at = find(edit.removePart);
    if (at === -1) return none(edit.removePart);
    parts = parts.filter((_, i) => i !== at);
  }
  if (edit.addPart) parts = [...parts, storedPart(edit.addPart)];

  const when = keep(edit.when, base?.content.when);
  const icon = keep(edit.icon, base?.content.icon);
  const schedule = kind === "harness" ? keep(edit.schedule === undefined ? undefined : edit.schedule === null ? null : label(edit.schedule) || null, base?.content.schedule) : undefined;
  const testedOn = kind === "harness" ? keep(edit.testedOn === undefined ? undefined : edit.testedOn === null ? null : label(edit.testedOn) || null, base?.content.testedOn) : undefined;
  // A memory piece says whether it takes team notes. A new one takes none unless asked. An edit never
  // carries the notes themselves: they stay as they are, turned on they start empty, turned off they are put aside.
  const had = base?.content.notes;
  const notes =
    kind !== "memory" ? undefined : edit.teamNotes === "empty" ? "" : edit.teamNotes === true ? (typeof had === "string" ? had : "") : edit.teamNotes === false ? null : base ? had : null;
  const next: Fields = {
    kind,
    name: edit.name !== undefined ? label(edit.name) : (base?.name ?? ""),
    // Only a harness has a goal. A piece never stores one, whatever was sent.
    goal: kind === "harness" ? label(edit.goal ?? base?.goal ?? "") : "",
    description: edit.description ?? base?.description ?? "",
    content: {
      prompt: edit.prompt !== undefined ? lf(edit.prompt) : (base?.content.prompt ?? ""),
      variables: edit.variables ?? base?.content.variables ?? [],
      parts,
      ...(when ? { when } : {}),
      ...(icon ? { icon } : {}),
      ...(schedule ? { schedule } : {}),
      ...(testedOn ? { testedOn } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
  };
  return check(next, kind, base, copy) ?? next;
}

const linksOf = (parts: Part[]) => parts.map((p) => p.piece).filter((s): s is string => Boolean(s));

/** A piece that a save is about to make: enough to count it, to name it and to store it. */
type Planned = {
  slug: string;
  kind: PartKind;
  name: string;
  description: string;
  content: HarnessContent;
  size: number;
  copiedFrom?: string;
  /** The date of its first version, for text that is older than the piece: a part moved out of a harness from before pieces. */
  at?: string;
  /** Who its first version is signed by, when not the person saving: a copy of a teammate's words, sent by nobody. */
  by?: Person;
};

/**
 * A part that becomes the harness's own copy of a piece: which piece, whether that piece takes team notes, and
 * whose words the copy is when its text was not sent: a save that does not send the text takes nothing over.
 */
type CopyOf = { slug: string; takesNotes: boolean; writtenBy?: Person };

/** The length of a harness as an agent receives it: its prompt plus the text of its pieces, including the ones about to be made. */
function sizeWith(f: Fields, pieces: Map<string, HarnessView>, making?: Map<string, Planned>, grown?: Map<string, number>): number {
  return (
    f.content.prompt.length +
    f.content.parts.reduce((n, p) => {
      if (!p.piece) return n + p.body.length;
      const made = making?.get(p.piece);
      if (made) return n + made.size;
      const now = grown?.get(p.piece);
      if (now !== undefined) return n + now;
      const piece = pieces.get(p.piece);
      return n + (piece ? pieceLength(piece.content) : 0);
    }, 0)
  );
}

/**
 * Parts must point at a real piece, or at one this save is about to make. The
 * link takes the piece's kind and the name the piece has now: that name is
 * stored for the record only, since a part is told apart by its piece's slug.
 * This is also where the size limit counts the pieces' text. `was` is the
 * version the change is made on, when there is one.
 */
async function settleLinks(
  f: Fields,
  was?: Fields,
  planned: Planned[] = [],
  /** Who is saving, and who sees the harness: a piece is linked only if they see it, and a team harness uses only team pieces. */
  seen: { viewer: Member | null; harness: string; visibility: Visibility } = { viewer: null, harness: "", visibility: "team" },
  /** A piece this same save is about to change, with the length it will have: the harness is measured with it. */
  grown?: Map<string, number>,
): Promise<Fields | string> {
  if (!f.content.parts.some((p) => p.piece)) return f;
  const making = new Map(planned.map((p) => [p.slug, p]));
  const pieces = await piecesBySlug([...new Set([...linksOf(f.content.parts), ...linksOf(was?.content.parts ?? [])])].filter((s) => !making.has(s)));
  const had = new Set(linksOf(was?.content.parts ?? []));
  const parts: Part[] = [];
  const used = new Set<string>();
  const none = (slug: string) => `There is no piece with the slug ${quoted(slug, 80)}. A part is a skill, a tool, a hook or a memory: harness_hub_search with a kind lists them.`;
  for (const p of f.content.parts) {
    if (!p.piece) {
      parts.push(p);
      continue;
    }
    const stored = pieces.get(p.piece);
    // A private piece the saver cannot see is not there for them. One the harness already used stays: taking someone's
    // view of a piece away must not stop the harness from being saved.
    if (stored && !had.has(stored.slug) && !canSee(stored, seen.viewer)) return none(p.piece);
    // Everyone who sees a team harness runs it, so each of its pieces must be one they can read.
    if (stored && seen.visibility === "team" && stored.visibility === "private") {
      return `The piece ${stored.slug} is private, and ${seen.harness || "this harness"} is seen by the whole team, who could not read it. Nothing was saved. ${personText(stored.owner)} can share the piece with the team on its page, or this harness can be made private first.`;
    }
    const piece = making.get(p.piece) ?? stored;
    // Only pieces are looked up, so the slug of a harness finds nothing here either.
    if (!piece) return none(p.piece);
    if (used.has(piece.slug)) return `The piece ${piece.slug} is in this harness twice. A harness uses a piece once.`;
    used.add(piece.slug);
    parts.push({ kind: piece.kind as PartKind, name: piece.name, body: "", piece: piece.slug });
  }
  // A piece this save makes goes by the name it was given: no part the harness already has may be read under it.
  for (const made of planned) {
    const taken = parts.find((p) => p.piece !== made.slug && sameName(p.name, made.name));
    if (taken) return `Another part of this harness is already named ${quoted(made.name, 80)}${taken.piece ? `: the piece ${taken.piece}` : ""}. Nothing was saved. Choose another name.`;
  }
  const size = sizeWith(f, pieces, making, grown);
  // The limit holds when a harness is saved. A piece can grow afterwards, and
  // nobody's harness may stop it: one harness padded to the limit would
  // otherwise freeze the piece for everyone. So a harness can be found past the
  // limit, and a save that adds nothing must still go through, or it could never be shortened.
  if (size > MAX_TEXT && !(was && size <= sizeWith(was, pieces))) {
    return `With its pieces the harness would be ${size.toLocaleString("en-US")} characters; the limit is ${MAX_TEXT.toLocaleString("en-US")}.`;
  }
  return { ...f, content: { ...f.content, parts } };
}

/**
 * Every part is a piece. Text that arrives inside a harness (pasted with a
 * save, written on its page, or left there by a version from before pieces)
 * is made into a piece for that harness, and the harness keeps the link.
 *
 * This only plans: it says which pieces to make and returns the harness with
 * links in their place. Nothing is written until the harness's version is, in
 * the same transaction. The slug carries the harness's own, so a part named
 * "Run log" never takes a name that reads as a piece meant for everyone.
 * A part with no text cannot be a piece and stays as it is.
 *
 * `had` is the version the text may already have been in: text that was there
 * is let in at its length, new text keeps to the limit of a piece. `copies`
 * names the parts that are the harness's own copy of an existing piece.
 */
export async function planPieces(harness: string, f: Fields, had?: Fields, copies?: Map<string, CopyOf>): Promise<{ fields: Fields; planned: Planned[] } | string> {
  if (!f.content.parts.some((p) => !p.piece && p.body.trim())) return { fields: f, planned: [] };
  // Slugs have no character that means anything to LIKE, so the start of the harness's slug can be used as it is.
  const taken = new Set(((await db().query(`SELECT slug FROM ${HARNESSES} WHERE slug LIKE $1`, [`${headOf(harness)}-%`])) as Row[]).map((r) => String(r.slug)));
  const before = new Map((had?.content.parts ?? []).filter((p) => !p.piece).map((p) => [p.name.trim().toLowerCase(), p.body.length]));
  const planned: Planned[] = [];
  const parts: Part[] = [];
  for (const p of f.content.parts) {
    if (p.piece || !p.body.trim()) {
      parts.push(p);
      continue;
    }
    if (p.body.length > MAX_PIECE && !(p.body.length <= (before.get(p.name.trim().toLowerCase()) ?? -1))) {
      return `The part ${quoted(p.name, 80)} is ${p.body.length.toLocaleString("en-US")} characters; a piece holds at most ${MAX_PIECE.toLocaleString("en-US")}. Shorten it, or split it in two.`;
    }
    const slug = madeSlug(harness, p.name, taken);
    if (!slug) return `No free slug is left for the part ${quoted(p.name, 80)}. Give it another name.`;
    taken.add(slug);
    const copy = copies?.get(p.name.trim().toLowerCase());
    planned.push({
      slug,
      kind: p.kind,
      name: p.name,
      description: p.summary ?? "",
      size: p.body.length,
      ...(copy ? { copiedFrom: copy.slug } : {}),
      ...(copy?.writtenBy ? { by: copy.writtenBy } : {}),
      content: {
        prompt: p.body,
        variables: [],
        parts: [],
        // A piece keeps only what its kind has: a timing for a hook, an icon for a tool.
        ...(p.kind === "hook" && p.when ? { when: p.when } : {}),
        ...(p.kind === "tool" && p.icon ? { icon: p.icon } : {}),
        // A memory made from a harness's own text is its owner's text. It takes no team notes unless its owner
        // turns them on. A copy of a memory that takes them takes them too, and starts with none.
        ...(p.kind === "memory" ? { notes: copy?.takesNotes ? "" : null } : {}),
      },
    });
    parts.push({ kind: p.kind, name: p.name, body: "", piece: slug });
  }
  return { fields: { ...f, content: { ...f.content, parts } }, planned };
}

/**
 * The statements that store planned pieces, to run in the same transaction
 * as the harness version that links them. A piece made for a harness belongs
 * to that harness's owner, whoever is saving: an editor never walks away with it.
 */
export function pieceStatements(sql: Sql, harness: string, owner: Person, by: Member, planned: Planned[], visibility: Visibility = "team") {
  // A piece made for a harness is seen by whoever sees the harness: a team harness's pieces are team pieces.
  return planned.flatMap((p) => [
    sql.query(`INSERT INTO ${HARNESSES} (slug, owner_email, owner_name, kind, made_for, copied_from, visibility) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
      p.slug,
      owner.email,
      owner.name,
      p.kind,
      harness,
      p.copiedFrom ?? null,
      visibility,
    ]),
    sql.query(
      `INSERT INTO ${VERSIONS} (slug, number, name, goal, description, note, content, saved_by_email, saved_by_name, changes, saved_at)
       VALUES ($1, 1, $2, '', $3, $4, $5::jsonb, $6, $7, $8, COALESCE($9::timestamptz, now()))`,
      [
        p.slug,
        p.name,
        p.description,
        oneLine(p.copiedFrom ? `Copy of ${p.copiedFrom}, made for ${harness}` : `Made for ${harness}`, 200),
        JSON.stringify(p.content),
        (p.by ?? by).email,
        (p.by ?? by).name,
        p.copiedFrom ? `copy of ${p.copiedFrom}` : "first version",
        p.at ?? null,
      ],
    ),
  ]);
}

/**
 * Harnesses named in an answer to this person: the ones they see by slug, the others only counted. A private
 * harness must not be learnt about from a message about a piece it uses.
 */
function namedFor(viewer: Member | null, users: HarnessView[], line: (h: HarnessView) => string = (h) => h.slug): string {
  const shown = users.filter((u) => canSee(u, viewer)).map(line);
  const more = users.length - shown.length;
  return [...shown, ...(more ? [`${more} other harness${more === 1 ? "" : "es"}`] : [])].join(", ");
}

/** The harnesses that use a piece, in their latest version, leaving one out. */
async function usersOfPiece(piece: string, except = ""): Promise<HarnessView[]> {
  const rows = (await db().query(
    `${VIEW} WHERE ${LATEST} AND h.kind = 'harness' AND h.archived_at IS NULL AND h.slug <> $2 AND v.content->'parts' @> $1::jsonb ORDER BY h.slug`,
    [JSON.stringify([{ piece }]), except],
  )) as Row[];
  return rows.map(toView);
}

/**
 * A piece that grew may have taken a harness that uses it past the
 * size a harness is saved at. Nothing stops the piece, or one harness padded
 * to the limit would freeze it for everyone. This only says which harnesses
 * are past it now, so the person who saved the piece can tell their owners.
 */
async function nowPastLimit(piece: HarnessView, viewer: Member | null): Promise<string> {
  const users = (
    (await db().query(`${VIEW} WHERE ${LATEST} AND h.kind = 'harness' AND h.archived_at IS NULL AND v.content->'parts' @> $1::jsonb`, [
      JSON.stringify([{ piece: piece.slug }]),
    ])) as Row[]
  ).map(toView);
  if (users.length === 0) return "";
  const pieces = await piecesBySlug([...new Set(users.flatMap((u) => linksOf(u.content.parts)))]);
  const over = users.map((u) => ({ u, size: sizeWith(u, pieces) })).filter((x) => x.size > MAX_TEXT);
  if (over.length === 0) return "";
  const list = (xs: typeof over) =>
    namedFor(
      viewer,
      xs.map((x) => x.u),
      (u) => `${u.slug} (${(xs.find((x) => x.u === u)?.size ?? 0).toLocaleString("en-US")} characters, owner ${personText(u.owner)})`,
    );
  const refused = over.filter((x) => x.size > LOAD_LIMIT);
  const loads = over.filter((x) => x.size <= LOAD_LIMIT);
  const lines: string[] = [];
  if (loads.length) {
    const one = loads.length === 1;
    lines.push(
      `With this, ${list(loads)} ${one ? "is" : "are"} past the ${MAX_TEXT.toLocaleString("en-US")} characters a harness is saved at. ${one ? "It still loads, and can" : "They still load, and can"} only be saved shorter: tell ${one ? "its owner" : "their owners"}.`,
    );
  }
  if (refused.length) {
    const one = refused.length === 1;
    lines.push(
      `With this, ${list(refused)} ${one ? "is" : "are"} past the ${LOAD_LIMIT.toLocaleString("en-US")} characters an agent can load: ${one ? "it no longer loads, and every run of it is refused" : "they no longer load, and every run of them is refused"} until ${one ? "it is" : "they are"} shorter. Tell ${one ? "its owner" : "their owners"}, or shorten this piece.`,
    );
  }
  return lines.join(" ");
}

/**
 * Adds a version on top of version `onTopOf` (0 for a new item).
 *
 * The text being saved was worked out from that version. If the item has
 * moved on since, nothing is inserted and no row comes back, so a save can
 * never quietly undo one that landed a moment before it. The number is worked
 * out in the same statement, and the primary key refuses a duplicate.
 */
export function insertVersion(slug: string, f: Fields, note: string, by: Member, changes: string, onTopOf: number) {
  return db().query(
    `INSERT INTO ${VERSIONS} (slug, number, name, description, note, content, saved_by_email, saved_by_name, changes, goal)
     SELECT $1, COALESCE(max(number), 0) + 1, $2, $3, $4, $5::jsonb, $6, $7, $8, $10
     FROM ${VERSIONS} WHERE slug = $1
     HAVING COALESCE(max(number), 0) = $9::int
     RETURNING number`,
    [slug, f.name, f.description, note, JSON.stringify(f.content), by.email, by.name, changes, onTopOf, f.goal],
  );
}

/**
 * The same insert, for a transaction that writes other rows with it: the
 * pieces a save makes, a new item's own row. When the item has moved on it
 * fails (a division by zero) instead of inserting nothing, so everything
 * written with it is undone and nothing is left half made.
 */
export function insertVersionOrFail(slug: string, f: Fields, note: string, by: Member, changes: string, onTopOf: number) {
  return db().query(
    `WITH added AS (
       INSERT INTO ${VERSIONS} (slug, number, name, description, note, content, saved_by_email, saved_by_name, changes, goal)
       SELECT $1, COALESCE(max(number), 0) + 1, $2, $3, $4, $5::jsonb, $6, $7, $8, $10
       FROM ${VERSIONS} WHERE slug = $1
       HAVING COALESCE(max(number), 0) = $9::int
       RETURNING number
     )
     SELECT (SELECT number FROM added) AS number, 1 / (SELECT count(*) FROM added) AS inserted`,
    [slug, f.name, f.description, note, JSON.stringify(f.content), by.email, by.name, changes, onTopOf, f.goal],
  );
}

/** Postgres's code for "this key already exists": two writers picked the same slug or version number. */
const isDuplicate = (error: unknown) => (error as { code?: string } | null)?.code === "23505";

/** A save that came second: its slug or version number was taken, or the version it was written on is no longer the latest. */
export const lostRace = (error: unknown) => ["23505", "22012", "40001"].includes((error as { code?: string } | null)?.code ?? "");

/** Writes that touch who sees what run serializable: two that each checked the other's rows cannot both land. */
const SERIALIZABLE = { isolationLevel: "Serializable" } as const;

/**
 * Runs a serializable transaction, again when Postgres could not serialize it (40001). That error can come from two
 * writes that only touched nearby rows, so the same statements are tried a few times: the checks inside them are
 * made again each time, and a real conflict still fails them.
 */
async function serialized<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== "40001" || attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.random() * 30));
    }
  }
}

/**
 * Statements that fail (a division by zero) when who sees a harness changed since the save read it, or when a team
 * harness would use a private piece. Run inside the save's own transaction, they close the gap between the checks
 * made before it and the write: a piece made private, or a harness shared, at that same moment.
 */
function visibilityGuards(sql: Sql, harness: string, visibility: Visibility, links: string[], exists: boolean) {
  return [
    ...(exists ? [sql.query(`SELECT 1 / (CASE WHEN (SELECT visibility FROM ${HARNESSES} WHERE slug = $1) IS DISTINCT FROM $2 THEN 0 ELSE 1 END) AS same_visibility`, [harness, visibility])] : []),
    ...(visibility === "team" && links.length
      ? [sql.query(`SELECT 1 / (CASE WHEN EXISTS (SELECT 1 FROM ${HARNESSES} WHERE slug = ANY($1::text[]) AND visibility = 'private') THEN 0 ELSE 1 END) AS team_pieces`, [links])]
      : []),
  ];
}

function movedOn(slug: string): string {
  return `${slug} was changed a moment ago, so nothing was saved. Load it again and retry.`;
}

/** A change written on an older version would undo what was saved since: whole texts are replaced, not lines. */
function writtenOnOlder(h: HarnessView, basedOn: number): string {
  return `${h.slug} is at version ${h.latest} now, and this change was written on version ${basedOn}. Nothing was saved. Open the latest version, then make the change again.`;
}

function notOwner(h: HarnessView): string {
  return `Only ${personText(h.owner)}${h.editors.length ? " and its editors" : ""} can change ${h.slug}. Suggest the change with harness_hub_suggest_change, or save your own copy with harness_hub_copy.`;
}

const isArchived = (h: HarnessView) => `${h.slug} is archived. ${personText(h.owner)} can restore it on its page.`;

/**
 * Saves a new version. A slug that does not exist yet creates the item with
 * the caller as owner; an existing one takes a new version from its owner or
 * one of its editors. Fields left out keep their current value.
 */
export async function saveHarness(member: Member, input: SaveInput): Promise<SaveResult> {
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG.test(slug)) {
    return { ok: false, message: "The slug must be lower-case letters, digits and hyphens, for example morning-inbox-brief." };
  }
  const noteProblem = checkNote(input.note);
  if (noteProblem) return { ok: false, message: noteProblem };
  const current = await findStored(slug);
  // A private item this person cannot see is not theirs to learn about: its slug is only taken.
  if (current && !canSee(current, member)) return { ok: false, message: `${slug} is taken. Choose another slug.` };
  if (input.visibility !== undefined && input.visibility !== "team" && input.visibility !== "private") {
    return { ok: false, message: "Visibility is team or private." };
  }

  // A copy onto a taken slug is a naming problem, whoever owns that slug.
  if (current && input.copyOf) {
    return { ok: false, message: `${slug} already exists. A copy needs a slug that is not taken yet.` };
  }
  if (current && !canEdit(current, member)) return { ok: false, message: notOwner(current) };
  if (current?.archived) return { ok: false, message: isArchived(current) };
  if (current && input.kind && input.kind !== current.kind) {
    return { ok: false, message: `${slug} is a ${current.kind}. Its kind cannot change.` };
  }
  if (current && input.basedOn !== undefined && input.basedOn !== current.latest) {
    return { ok: false, message: writtenOnOlder(current, input.basedOn) };
  }
  // A save that carries what only a harness has was meant to create a harness. On the slug of a piece it would
  // otherwise write the harness's name and prompt over the piece, for every harness that uses it.
  if (current && current.kind !== "harness" && [input.goal, input.variables, input.parts, input.addPart, input.updatePart, input.removePart].some((x) => x !== undefined)) {
    return {
      ok: false,
      message: `${slug} is taken: it is a ${current.kind}, a piece, not a harness. Nothing was saved. To create a harness, choose another slug. To change this ${current.kind}, send only its name, its summary (description) or its text (prompt).`,
    };
  }

  let base: Fields | undefined = current;
  let kind: ItemKind = current?.kind ?? input.kind ?? "harness";
  let copiedFrom: string | null = null;
  if (!current && input.copyOf) {
    const source = await findStored(input.copyOf);
    if (!source || !canSee(source, member)) return { ok: false, message: `There is nothing with the slug ${JSON.stringify(input.copyOf)} to copy.` };
    // A copy of a memory is a new memory: it takes team notes if the original does, and starts with none.
    base = typeof source.content.notes === "string" ? { ...source, content: { ...source.content, notes: "" } } : source;
    kind = source.kind;
    copiedFrom = source.slug;
  }
  if (!KINDS.includes(kind)) return { ok: false, message: "The kind must be harness, skill, tool, hook or memory." };
  if (input.teamNotes !== undefined && kind !== "memory") return { ok: false, message: "Only a memory piece takes team notes." };
  // Emptying is for a memory that takes notes. On one that takes none it would turn them on, which nobody asked for.
  if (input.teamNotes === "empty" && typeof current?.content.notes !== "string") {
    return { ok: false, message: `${slug} takes no team notes, so there is nothing to empty. To let runs leave notes in it, turn team notes on.` };
  }
  if (!base && kind === "harness" && (input.name === undefined || input.prompt === undefined || !input.goal?.trim())) {
    return { ok: false, message: `${slug} does not exist yet. To create it, give a name, a goal (one sentence on what the agent is for) and a prompt, and a description of what it does.` };
  }
  if (!base && kind !== "harness" && (input.name === undefined || input.prompt === undefined)) {
    return { ok: false, message: `${slug} does not exist yet. To create this ${kind}, give a name and its text, and a one-line summary.` };
  }

  // Who sees it: what it is, or for a new item what was asked, private unless it said team.
  const visibility: Visibility = current?.visibility ?? input.visibility ?? "private";
  // Pieces of this harness the person saving cannot see: no refusal names them.
  const hidden = new Set(
    kind === "harness" && current ? [...(await piecesBySlug(linksOf(current.content.parts)))].filter(([, p]) => !canSee(p, member)).map(([s]) => s) : [],
  );
  const seen = { viewer: member, harness: slug, visibility };

  // Text sent for a part that is already a piece is settled first: the link is kept, or the change is saved on the piece, or refused.
  let edit: Edit = input;
  let pieceNote = "";
  let copies: Map<string, CopyOf> | undefined;
  if (kind === "harness" && current) {
    // What is left for the harness itself is tried before a piece is saved, so a save that names a part
    // that is not there, or breaks a rule of the harness, changes nothing at all.
    const sent = await textForPieces(member, current, edit, input.note.trim(), input.basedOn !== undefined, async (rest, restCopies, grown) => {
      const tried = applyEdit(slug, base, rest, kind, false, hidden);
      if (typeof tried === "string") return tried;
      const planned = await planPieces(slug, tried, current, restCopies);
      if (typeof planned === "string") return planned;
      const settled = await settleLinks(planned.fields, current, planned.planned, seen, grown);
      return typeof settled === "string" ? settled : null;
    });
    if (typeof sent === "string") return { ok: false, message: sent };
    edit = sent.edit;
    copies = sent.copies;
    pieceNote = sent.saved ?? "";
  } else if (kind === "harness" && base) {
    // A copy that changes something in the same save. It uses the original's pieces, and creating it changes none of them.
    const split = await splitPieceEdits(base, edit, member);
    if (split.problem) return { ok: false, message: split.problem };
    if (split.pieceEdits.length) {
      const list = split.pieceEdits.map((e) => `${quoted(e.label, 80)} (piece ${e.piece.slug})`).join(", ");
      return {
        ok: false,
        message: `A copy uses the same pieces as the original, and what was sent differs from them: ${list}. Nothing was saved. Make the copy first, then change a part in it with update_part and own_copy set to true: the copy then gets its own copy of that piece.`,
      };
    }
    edit = split.edit;
    copies = split.copies;
  }
  // Once a piece has been saved on the way, a later refusal has to say so.
  const fail = (message: string): SaveResult => ({ ok: false, message: pieceNote ? `${pieceNote} The rest of the change was not saved: ${message}` : message });
  let notesNote = "";

  const applied = applyEdit(slug, base, edit, kind, copiedFrom !== null, hidden);
  if (typeof applied === "string") return fail(applied);
  // Team notes turned on again come back as they were when they were turned off: nothing a run left is lost by the switch.
  if (kind === "memory" && current && input.teamNotes === true && typeof current.content.notes !== "string") {
    const rows = (await db().query(
      `SELECT content->>'notes' AS notes FROM ${VERSIONS} WHERE slug = $1 AND jsonb_typeof(content->'notes') = 'string' ORDER BY number DESC LIMIT 1`,
      [slug],
    )) as Row[];
    const had = rows[0]?.notes ? String(rows[0].notes) : "";
    // They come back when they still fit beside the text. Otherwise it starts with none, and says so.
    if (had && applied.content.prompt.length + had.length <= MAX_PIECE) applied.content.notes = had;
    else if (had) notesNote = `The team notes it had before no longer fit beside its text, so it starts with none. They stay in its earlier versions.`;
  }
  // Parts that arrive as text become pieces made for this harness. Nothing is written yet.
  const plan = kind === "harness" ? await planPieces(slug, applied, current, copies) : { fields: applied, planned: [] as Planned[] };
  if (typeof plan === "string") return fail(plan);
  // The size a save may keep is measured against the current version. A copy is a new item: it keeps to the limits,
  // whatever size the item it copies has grown to.
  const next = await settleLinks(plan.fields, current, plan.planned, seen);
  if (typeof next === "string") return fail(next);

  const changed = current ? await described(current, next, member) : [];
  // A piece whose text, name or timing was last set by someone who can no longer change it stays theirs wherever
  // it is used, until someone who can change it vouches for it. Sending its text as it stands does that: the same
  // words, signed by a new person. A save that does not send the text takes nothing over.
  const takenOver =
    current !== undefined &&
    kind !== "harness" &&
    input.prompt !== undefined &&
    next.content.prompt === current.content.prompt &&
    writersOf(current).some((person) => !canEdit(current, person));
  if (current && changed.length === 0 && !takenOver) {
    // The change was to a piece, and the harness itself has nothing new: it stays at its version.
    const same = pieceNote ? await findHarness(member, slug) : undefined;
    if (same) return { ok: true, created: false, harness: same, changed: [], note: pieceNote, pieceOnly: true };
    return { ok: false, message: `Nothing changed: ${slug} is still at version ${current.latest}. No new version was saved.` };
  }
  if (takenOver) changed.push(TAKEN_OVER);
  const changes = current ? changed.join(", ") : copiedFrom ? `copy of ${copiedFrom}` : "first version";

  // A copy of a piece whose text was not sent is still the words of whoever set them: the copy's first version is
  // signed by them, and its new owner takes it over by sending its text as it stands.
  const source = copiedFrom && kind !== "harness" && input.prompt === undefined ? await findStored(copiedFrom) : undefined;
  const signer = (source && writersOf(source).find((person) => person.email !== member.email)) || member;
  // One transaction: the item's own row when it is new, the pieces made for it, and its version.
  // If the version does not land, none of it does.
  const sql = db();
  const linked = kind === "harness" ? linksOf(next.content.parts).filter((s) => !plan.planned.some((p) => p.slug === s)) : [];
  try {
    await serialized(() => sql.transaction([
      ...(kind === "harness" ? visibilityGuards(sql, slug, visibility, linked, current !== undefined) : []),
      ...(current
        ? []
        : [
            sql.query(`INSERT INTO ${HARNESSES} (slug, owner_email, owner_name, copied_from, kind, visibility) VALUES ($1, $2, $3, $4, $5, $6)`, [
              slug,
              member.email,
              member.name,
              copiedFrom,
              kind,
              visibility,
            ]),
          ]),
      ...pieceStatements(sql, slug, current?.owner ?? member, member, plan.planned, visibility),
      insertVersionOrFail(slug, next, input.note.trim(), signer, changes, current?.latest ?? 0),
    ], SERIALIZABLE));
  } catch (error) {
    if (!lostRace(error)) throw error;
    return fail(current ? movedOn(slug) : `${slug} was taken a moment ago. Choose another slug.`);
  }
  const saved = await findHarness(member, slug);
  if (!saved) return fail("The save did not go through. Nothing was changed.");
  const grew = current !== undefined && kind !== "harness" && pieceLength(next.content) > pieceLength(current.content);
  const note = [pieceNote, notesNote, grew ? await nowPastLimit(saved, member) : ""].filter(Boolean).join(" ");
  return {
    ok: true,
    created: !current,
    harness: saved,
    changed,
    ...(note ? { note } : {}),
    ...(plan.planned.length ? { made: plan.planned.map((p) => p.slug) } : {}),
  };
}

/** A change to a piece that arrived through a harness that uses it. */
export type PieceEdit = {
  /** The name the part goes by: its piece's name. */
  label: string;
  piece: HarnessView;
  name?: string;
  prompt?: string;
  description?: string;
  when?: Part["when"] | null;
  icon?: Part["icon"] | null;
  /** The version of the piece the change was written on, when the sender said. */
  onVersion?: number;
  /** How it arrived: with update_part, which names one part, or in the whole list of parts sent back. */
  via: "update" | "list";
};

const sameText = (a: string, b: string) => lf(a).trim() === lf(b).trim();

/** A name as it was before the Hub put it in quotes, when it is one: what JSON.stringify printed, read back. */
function unquoted(name: string): string {
  try {
    const read: unknown = JSON.parse(name);
    return typeof read === "string" ? read : name;
  } catch {
    return name;
  }
}

/**
 * What a save sent about parts that are already pieces.
 *
 * A harness links its pieces: their name and their text are not the harness's
 * to hold. An agent that loaded a harness and saves it back sends every part
 * with its text. Where that text is the piece's own, the link is kept and
 * nothing is made. Where it differs, it is a change to the piece, and this
 * returns it apart from what is left for the harness itself. What the Hub
 * wrote around the text when it was loaded is taken off first (ownTextOf).
 *
 * A part is found by its piece's slug, or by the name its piece has now,
 * which is the one people and agents read. What is left for the harness names
 * the part by its piece's slug.
 *
 * With `ownCopy`, nothing changes in the piece: the part becomes text again,
 * the piece's own with whatever was sent on top, and the save makes a piece
 * of it for this harness. `copies` says which parts those are.
 *
 * `problem` is set when what was sent cannot be told apart or carried out:
 * the save is then refused whole.
 */
async function splitPieceEdits(
  harness: Fields,
  edit: Edit,
  /** Who is saving or suggesting. A piece they cannot see is not there for them: nothing is compared with it or copied from it. */
  viewer: Member | null,
  /** Who can change the harness, for a save on it: it says whose words a copied text stays, and lets update_part take a piece over. */
  here?: Set<string>,
): Promise<{ edit: Edit; pieceEdits: PieceEdit[]; copies: Map<string, CopyOf>; problem?: string }> {
  const all = harness.content.parts;
  const links = all.filter((p) => p.piece);
  const u = edit.updatePart;
  const copies = new Map<string, CopyOf>();
  const named = u !== undefined || edit.removePart !== undefined || (edit.parts ?? []).length > 0;
  if (links.length === 0 || !named) return { edit, pieceEdits: [], copies };

  const pieces = await piecesBySlug([...new Set(linksOf(links))]);
  for (const [slug, piece] of pieces) if (!canSee(piece, viewer)) pieces.delete(slug);
  /** The name a part is read under: its piece's name now. */
  const nameNow = (part: Part) => (part.piece ? (pieces.get(part.piece)?.name ?? part.name) : part.name);
  let problem: string | undefined;
  /**
   * The part a name stands for. A piece's slug first: it is exact. Then the name a piece has now, the one
   * people and agents read. Then the name of a part whose text is still inside the harness. Last, the name
   * a piece had when the harness was saved, for someone who read it before the piece was renamed.
   */
  const lookUp = (name: string): Part | undefined => {
    const wanted = name.trim().toLowerCase();
    if (!wanted) return undefined;
    const bySlug = links.find((l) => l.piece === wanted);
    if (bySlug) return bySlug;
    const byName = links.filter((l) => sameName(nameNow(l), name));
    if (byName.length > 1) {
      problem ??= `Two parts are named ${quoted(name, 80)}: the pieces ${byName.map((l) => l.piece).join(" and ")}. Nothing was saved. Name the part by the slug of its piece.`;
      return undefined;
    }
    return byName[0] ?? all.find((p) => !p.piece && sameName(p.name, name)) ?? links.find((l) => sameName(l.name, name));
  };
  // The heading of a teammate's piece prints its name in quotes. Someone who sends that name back as printed means that part.
  const partFor = (name: string): Part | undefined => lookUp(name) ?? (problem === undefined && /^".*"$/.test(name.trim()) ? lookUp(unquoted(name.trim())) : undefined);

  const pieceEdits: PieceEdit[] = [];
  /** What differs between the piece and what was sent for it. A field that was not sent, or says the same, is no change. */
  const differing = (
    piece: HarnessView,
    sent: { newName?: string; body?: string; summary?: string; when?: Part["when"] | null; icon?: Part["icon"] | null },
    via: PieceEdit["via"],
    onVersion?: number,
  ) => {
    const change: PieceEdit = { label: piece.name, piece, onVersion, via };
    const body = sent.body === undefined ? undefined : ownTextOf(sent.body);
    if (sent.newName !== undefined && label(sent.newName) && label(sent.newName) !== piece.name) change.name = label(sent.newName);
    if (body !== undefined && body.trim() && !sameText(body, piece.content.prompt)) change.prompt = body;
    // The text as it stands, named on its own with update_part, by someone saving the harness: it takes the piece
    // over when someone who can no longer change it last set what an agent reads of it. Saved on the piece, which
    // checks who may.
    else if (via === "update" && here && body !== undefined && body.trim() && writersOf(piece).some((person) => !canEdit(piece, person))) change.prompt = body;
    if (sent.summary !== undefined && sent.summary.trim() !== piece.description.trim()) change.description = sent.summary;
    if (piece.kind === "hook" && sent.when !== undefined && (sent.when ?? undefined) !== piece.content.when) change.when = sent.when;
    if (piece.kind === "tool" && sent.icon !== undefined && (sent.icon ?? undefined) !== piece.content.icon) change.icon = sent.icon;
    if ([change.name, change.prompt, change.description, change.when, change.icon].some((x) => x !== undefined)) pieceEdits.push(change);
  };

  let next: Edit = edit;
  // A name that a piece and a part still inside the harness both go by cannot say which of the two is meant.
  const shared = (name: string) => {
    const piece = links.find((l) => sameName(nameNow(l), name));
    if (piece && all.some((p) => !p.piece && sameName(p.name, name))) {
      problem ??= `Two parts are named ${quoted(name, 80)}: the piece ${piece.piece}, and a part with no piece of its own yet. Nothing was saved. Name the piece by its slug. To change the other one, take it out and add it again under another name.`;
    }
  };
  if (u) {
    shared(u.name);
    const target = partFor(u.name);
    const piece = target?.piece ? pieces.get(target.piece) : undefined;
    const changes = u.body !== undefined || u.summary !== undefined || u.newName !== undefined || u.when !== undefined || u.icon !== undefined;
    if (target && u.piece !== undefined && !u.ownCopy && changes) {
      problem ??= PIECE_ALONE(nameNow(target));
    } else if (target?.piece && !piece) {
      // The piece is gone. The part is named by its slug so that the refusal can say which.
      next = { ...next, updatePart: { ...u, name: target.piece } };
    } else if (target?.piece && piece && u.ownCopy) {
      const name = label(u.newName ?? "") || piece.name;
      const body = u.body?.trim() ? ownTextOf(u.body) : "";
      // With no text sent, the copy is the piece's words as they stand: still the words of whoever set them.
      const writtenBy = body.trim() || !here ? undefined : writersOf(piece).find((person) => !here.has(person.email));
      copies.set(name.toLowerCase(), { slug: piece.slug, takesNotes: typeof piece.content.notes === "string", ...(writtenBy ? { writtenBy } : {}) });
      next = {
        ...next,
        updatePart: {
          name: piece.slug,
          ownCopy: true,
          newName: name,
          body: body.trim() ? body : piece.content.prompt,
          summary: u.summary ?? piece.description,
          when: u.when !== undefined ? u.when : piece.content.when,
          icon: u.icon !== undefined ? u.icon : piece.content.icon,
        },
      };
    } else if (target?.piece && piece) {
      differing(piece, u, "update", u.pieceVersion);
      // What is left for the harness itself: another piece in this one's place.
      next = { ...next, updatePart: u.piece !== undefined ? { name: piece.slug, piece: u.piece } : undefined };
    }
  }
  if (edit.removePart !== undefined) {
    shared(edit.removePart);
    const target = partFor(edit.removePart);
    if (target?.piece) next = { ...next, removePart: target.piece };
  }
  if (edit.parts) {
    const sent = edit.parts.map((p) => {
      // By its slug, a piece this harness already uses; by its name, the part that is read under it.
      const link = p.piece ? links.find((l) => l.piece === (p.piece as string).trim().toLowerCase()) : partFor(p.name ?? "");
      const piece = link?.piece ? pieces.get(link.piece) : undefined;
      if (!link?.piece || !piece) return p;
      differing(piece, p, "list", p.pieceVersion);
      return { kind: link.kind, name: link.name, body: "", piece: link.piece };
    });
    // Text that is, word for word, a piece this harness uses and the list no longer names: it is that piece, sent
    // back under a name the Hub does not know. Made into a piece, it would copy what may be a teammate's words
    // into the owner's own, and drop the link. So the list is refused, and says which piece that text is.
    const listed = new Set(sent.flatMap((p) => (p.piece ? [p.piece] : [])));
    for (const p of sent) {
      if (p.piece || !(p.body ?? "").trim()) continue;
      const same = links.find((l) => !listed.has(l.piece as string) && pieces.has(l.piece as string) && sameText(ownTextOf(p.body), (pieces.get(l.piece as string) as HarnessView).content.prompt));
      if (same) {
        problem ??= `The text sent as ${quoted(p.name ?? "", 80)} is, word for word, the piece ${same.piece}, which this harness uses under the name ${quoted(nameNow(same), 80)}. Nothing was saved. Send that part by its slug (piece: ${same.piece}). To give the harness its own copy of it, use update_part with own_copy set to true.`;
      }
    }
    next = { ...next, parts: sent };
  }
  // A part renamed here goes by its new name here: no other part of this harness may already be read under it.
  for (const e of pieceEdits) {
    const taken = e.name === undefined ? undefined : all.find((p) => p.piece !== e.piece.slug && sameName(nameNow(p), e.name as string));
    if (taken) problem ??= `Another part of this harness is already named ${quoted(e.name as string, 80)}${taken.piece ? `: the piece ${taken.piece}` : ""}. Nothing was saved. Choose another name.`;
  }
  return { edit: next, pieceEdits, copies, ...(problem ? { problem } : {}) };
}

/**
 * Settles a save's changes to pieces before the harness itself is saved.
 *
 * A piece made for a harness is that harness's own: whoever can change the
 * harness changes the piece through it, as editing a part has always worked,
 * and every other harness that uses the piece follows. A piece the harness
 * only borrows is changed through it when nobody else's harness uses it;
 * otherwise the change is refused, naming the piece, who else uses it, and
 * the ways on: save the piece by its slug, suggest the change to its owner,
 * or give the harness its own copy. One piece per call: each has its own
 * version and its own answer.
 *
 * The version of a harness says nothing about its pieces: a piece gets new
 * versions without the harness moving. So a change to a piece must say which
 * version of the piece it was written on wherever it could undo someone's
 * newer text unseen: always when it arrives in a whole list of parts sent
 * back, and with update_part whenever the save asks for that protection on
 * the harness (`guarded`: it named the harness's version).
 *
 * `problemWith` says what is wrong with the rest of the save, if anything:
 * it is asked before the piece is saved.
 */
async function textForPieces(
  member: Member,
  harness: HarnessView,
  edit: Edit,
  note: string,
  guarded: boolean,
  problemWith: (rest: Edit, copies: Map<string, CopyOf>, grown: Map<string, number>) => Promise<string | null>,
): Promise<{ edit: Edit; saved?: string; copies: Map<string, CopyOf> } | string> {
  const split = await splitPieceEdits(harness, edit, member, new Set([harness.owner.email, ...harness.editors.map((e) => e.email)]));
  if (split.problem) return split.problem;
  if (split.pieceEdits.length === 0) return { edit: split.edit, copies: split.copies };
  if (split.pieceEdits.length > 1) {
    const list = split.pieceEdits.map((e) => `${quoted(e.label, 80)} (piece ${e.piece.slug})`).join(", ");
    return `These parts are pieces with versions of their own, and what was sent differs from them: ${list}. Nothing was saved. Save each change on its piece, one at a time: harness_hub_save with the piece's slug and its new text as prompt.`;
  }
  const e = split.pieceEdits[0];
  const now = `${e.piece.slug} is at version ${e.piece.latest} now`;
  if (e.onVersion === undefined && e.via === "list") {
    return `${quoted(e.label, 80)} is the piece ${e.piece.slug}, and what was sent for it differs from it. Nothing was saved. To leave the piece as it is, send that part by its slug alone (piece: ${e.piece.slug}). To change it, send update_part with what changes and piece_version, the version of the piece you wrote the change on: ${now}.`;
  }
  if (e.onVersion === undefined && guarded) {
    return `based_on_version covers ${harness.slug} itself, not its pieces: each has versions of its own, and ${harness.slug} does not move when one of them changes. Nothing was saved. Add piece_version to update_part: the version of ${e.piece.slug} this change was written on, shown in the part's heading. It is at version ${e.piece.latest} now.`;
  }
  const onlyHere = `To change it only in ${harness.slug}: send update_part again with own_copy set to true, and ${harness.slug} gets its own copy of the piece, with this change.`;
  if (!canEdit(e.piece, member)) {
    return `${quoted(e.label, 80)} is the piece ${e.piece.slug}, owned by ${personText(e.piece.owner)}. Nothing was saved. To propose the change to its owner: harness_hub_suggest_change with the slug ${e.piece.slug}. ${onlyHere}`;
  }
  const others = await usersOfPiece(e.piece.slug, harness.slug);
  const notMine = e.piece.madeFor === harness.slug ? [] : others.filter((o) => !canEdit(o, member));
  if (notMine.length) {
    const list = namedFor(member, notMine, (o) => `${o.slug} (${personText(o.owner)})`);
    return `${quoted(e.label, 80)} is the piece ${e.piece.slug}, which ${harness.slug} borrows, and ${list} ${notMine.length === 1 ? "uses" : "use"} it too. Nothing was saved. To change it for every harness that uses it: harness_hub_save with the slug ${e.piece.slug}. ${onlyHere}`;
  }
  // The rest of the save is tried with the piece as it will be, so that its new length counts against the harness.
  const grownTo = (e.prompt !== undefined ? lf(e.prompt).length : e.piece.content.prompt.length) + (typeof e.piece.content.notes === "string" ? e.piece.content.notes.length : 0);
  const problem = await problemWith(split.edit, split.copies, new Map([[e.piece.slug, grownTo]]));
  if (problem) return problem;
  const result = await saveHarness(member, { slug: e.piece.slug, note, name: e.name, prompt: e.prompt, description: e.description, when: e.when, icon: e.icon, basedOn: e.onVersion });
  if (!result.ok) return result.message;
  const also = others.length ? ` ${namedFor(member, others)} ${others.length === 1 ? "uses" : "use"} it too and ${others.length === 1 ? "gets" : "get"} this version.` : "";
  return {
    edit: split.edit,
    copies: split.copies,
    saved: `Saved the ${e.piece.kind} ${e.piece.slug} as version ${result.harness.version}: it is the piece behind ${quoted(result.harness.name, 80)}.${also}${result.note ? ` ${result.note}` : ""}`,
  };
}

/**
 * What changed, in words. A part that was taken out is named the way people
 * read it: by the name its piece has now, which may no longer be the name
 * stored with the link when the harness was last saved.
 */
async function described(before: Fields, after: Fields, viewer: Member | null): Promise<string[]> {
  const stays = new Set(linksOf(after.content.parts));
  const gone = linksOf(before.content.parts).filter((slug) => !stays.has(slug));
  // A piece the saver cannot see is named by its slug: its name would stay in the version's record for everyone.
  return describeChanges(gone.length ? withNames(before, await pieceNames(gone, viewer)) : before, after);
}

/**
 * Adds lines to the team notes of a memory piece, as a new version. Team notes
 * are what runs leave for each other, so anyone on the team may add to them.
 * The piece's own text stays its owner's: only they and the editors change it.
 * A memory takes notes only when its owner turned that on.
 */
export async function appendMemory(member: Member, slug: string, text: string): Promise<SaveResult> {
  const clean = lf(text).trim();
  if (!clean || clean.length > 2000) return { ok: false, message: "Give the text to add: 1 to 2,000 characters." };
  // Anyone on the team adds here, and the text ends up inside harnesses other people run.
  // A note that is shaped like a heading of a harness, or like a line the Hub writes, is refused.
  if (/^[\s\u200b\u200c\u200d\ufeff]*(={3,}|(HARNESS TEXT|TEAM MEMORY|OWNER'S PIECE|TEAMMATE'S PIECE|HARNESS HUB)\b)/m.test(clean)) {
    return { ok: false, message: 'A line of team notes cannot start with "=====" or with a heading that Harness Hub writes. Write the note as plain lines.' };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const piece = await findStored(slug);
    if (!piece || piece.kind !== "memory" || !canSee(piece, member)) return { ok: false, message: `There is no memory piece with the slug ${JSON.stringify(slug)}.` };
    if (piece.archived) return { ok: false, message: isArchived(piece) };
    const had = piece.content.notes;
    if (typeof had !== "string") {
      return { ok: false, message: `${piece.slug} takes no team notes: its text says where each person keeps their own. ${personText(piece.owner)} can turn team notes on, on its page.` };
    }
    const next: Fields = { ...piece, goal: "", content: { ...piece.content, notes: had.trim() ? `${had.replace(/\s+$/, "")}\n${clean}` : clean } };
    const problem = check(next, "memory", piece);
    if (problem) return { ok: false, message: problem };
    try {
      const added = (await insertVersion(piece.slug, next, oneLine(`Added by ${member.name}`, 200), member, NOTES_ONLY, piece.latest)) as Row[];
      if (added.length > 0) {
        const saved = await findStored(piece.slug);
        if (saved) {
          const note = await nowPastLimit(saved, member);
          return { ok: true, created: false, harness: saved, changed: ["team notes"], ...(note ? { note } : {}) };
        }
      }
    } catch (error) {
      if (!isDuplicate(error)) throw error;
    }
    // Someone else added a line at the same moment: read again and add after theirs.
  }
  return { ok: false, message: movedOn(slug) };
}

export type Done = { ok: boolean; message: string };

/** Sets an item aside, or brings it back. Only its owner can. Nothing is deleted. */
export async function setArchived(member: Member, slug: string, archived: boolean): Promise<Done> {
  const h = await findStored(slug);
  if (!h || !canSee(h, member)) return { ok: false, message: `There is nothing with the slug ${JSON.stringify(slug)}.` };
  if (h.owner.email !== member.email) return { ok: false, message: `Only ${personText(h.owner)} can archive or restore ${h.slug}.` };
  await db().query(`UPDATE ${HARNESSES} SET archived_at = ${archived ? "now()" : "NULL"} WHERE slug = $1`, [h.slug]);
  // A harness set aside before every part was a piece gets its pieces when it comes back.
  if (!archived && h.kind === "harness") await convertOldParts().catch(() => undefined);
  return { ok: true, message: archived ? `${h.slug} is archived. It left the lists and the search; its versions are kept.` : `${h.slug} is back in the lists.` };
}

/**
 * Who sees an item: the whole team, or only its owner and the people who can change it. Only its owner says.
 *
 * A team harness is run by anyone, so it uses only team pieces: a piece a team harness uses cannot be made private,
 * and a harness shared with the team brings the private pieces made for it along. A piece of someone else's that is
 * private keeps the harness private until that piece is shared. A harness made private takes the pieces made for it
 * along, unless another team harness uses one: that one stays team, and the answer says so.
 */
export async function setVisibility(member: Member, slug: string, to: string): Promise<Done> {
  if (to !== "team" && to !== "private") return { ok: false, message: "Visibility is team or private." };
  const h = await findStored(slug);
  if (!h || !canSee(h, member)) return { ok: false, message: `There is nothing with the slug ${JSON.stringify(slug)}.` };
  if (h.owner.email !== member.email) return { ok: false, message: `Only ${personText(h.owner)} can say who sees ${h.slug}.` };
  if (h.visibility === to) return { ok: true, message: to === "team" ? `${h.slug} is already seen by the whole team.` : `${h.slug} is already private.` };
  const sql = db();
  // Every harness that uses a piece, archived ones too: one brought back must not be a team harness with a private piece.
  const teamUsers = async (piece: string, except: string) =>
    (
      (await sql.query(`${VIEW} WHERE ${LATEST} AND h.kind = 'harness' AND h.visibility <> 'private' AND h.slug <> $2 AND v.content->'parts' @> $1::jsonb ORDER BY h.slug`, [
        JSON.stringify([{ piece }]),
        except,
      ])) as Row[]
    ).map(toView);
  // In the write itself: fails when, by then, a team harness's latest version uses one of these pieces while it is private.
  const noTeamUser = (pieces: string[], except = "") =>
    sql.query(
      `SELECT 1 / (CASE WHEN EXISTS (
         SELECT 1 FROM ${HARNESSES} th JOIN ${VERSIONS} tv ON tv.slug = th.slug
         WHERE th.kind = 'harness' AND th.visibility <> 'private' AND th.slug <> $2
           AND tv.number = (SELECT max(number) FROM ${VERSIONS} WHERE slug = th.slug)
           AND EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(tv.content->'parts') = 'array' THEN tv.content->'parts' ELSE '[]'::jsonb END) part
                       WHERE part->>'piece' = ANY($1::text[]))
           AND EXISTS (SELECT 1 FROM ${HARNESSES} p WHERE p.slug = ANY($1::text[]) AND p.visibility = 'private')
       ) THEN 0 ELSE 1 END) AS no_team_user`,
      [pieces, except],
    );
  const raced = (error: unknown): Done => {
    if (!lostRace(error)) throw error;
    return { ok: false, message: `${h.slug} or a piece it uses changed a moment ago, so nothing changed. Try again.` };
  };

  if (h.kind !== "harness") {
    if (to === "private") {
      const users = await teamUsers(h.slug, "");
      if (users.length) {
        return {
          ok: false,
          message: `${h.slug} is used by ${users.length === 1 ? "a harness" : "harnesses"} the whole team sees: ${namedFor(member, users)}. Everyone who runs ${users.length === 1 ? "it" : "them"} must be able to read it, so it stays a team piece. Make ${users.length === 1 ? "that harness" : "those harnesses"} private first, or take the piece out of ${users.length === 1 ? "it" : "them"}.`,
        };
      }
    }
    try {
      await serialized(() =>
        sql.transaction([sql.query(`UPDATE ${HARNESSES} SET visibility = $2 WHERE slug = $1`, [h.slug, to]), ...(to === "private" ? [noTeamUser([h.slug])] : [])], SERIALIZABLE),
      );
    } catch (error) {
      return raced(error);
    }
    return { ok: true, message: to === "team" ? `${h.slug} is now seen by the whole team.` : `${h.slug} is now private: only you and its editors see it.` };
  }

  const links = await piecesBySlug(linksOf(h.content.parts));
  if (to === "team") {
    const hidden = [...links.values()].filter((p) => p.visibility === "private");
    // The originals of copies made for this harness: a copy of someone's private piece holds their text.
    const originals = await piecesBySlug(hidden.flatMap((p) => (p.copiedFrom ? [p.copiedFrom] : [])));
    const copiesPrivate = (p: HarnessView) => {
      const original = p.copiedFrom ? originals.get(p.copiedFrom) : undefined;
      return original !== undefined && original.visibility === "private" && original.owner.email !== h.owner.email;
    };
    // Pieces made for this harness are its owner's, so they come along, unless one is a copy of someone else's
    // private piece. Anyone else's private piece must be shared first.
    const along = hidden.filter((p) => p.madeFor === h.slug && p.owner.email === h.owner.email && !copiesPrivate(p));
    const blocking = hidden.filter((p) => !along.includes(p));
    if (blocking.length) {
      const shown = blocking.filter((p) => canSee(p, member) && !copiesPrivate(p));
      const more = blocking.length - shown.length;
      const list = [...shown.map((p) => `${p.slug} (${personText(p.owner)})`), ...(more ? [`${more} private piece${more === 1 ? "" : "s"} you cannot share`] : [])].join(", ");
      return {
        ok: false,
        message: `${h.slug} uses private pieces: ${list}. Everyone who sees a team harness runs it, so each must be shared with the team by its owner first, or taken out. Nothing changed.`,
      };
    }
    try {
      await serialized(() => sql.transaction(
        [
          sql.query(`UPDATE ${HARNESSES} SET visibility = 'team' WHERE slug = $1`, [h.slug]),
          ...(along.length ? [sql.query(`UPDATE ${HARNESSES} SET visibility = 'team' WHERE slug = ANY($1::text[])`, [along.map((p) => p.slug)])] : []),
          // By the time it is written, its latest version must still use no private piece.
          sql.query(
            `SELECT 1 / (CASE WHEN EXISTS (
               SELECT 1 FROM ${VERSIONS} v, jsonb_array_elements(CASE WHEN jsonb_typeof(v.content->'parts') = 'array' THEN v.content->'parts' ELSE '[]'::jsonb END) part
               JOIN ${HARNESSES} p ON p.slug = part->>'piece'
               WHERE v.slug = $1 AND v.number = (SELECT max(number) FROM ${VERSIONS} WHERE slug = $1) AND p.visibility = 'private'
             ) THEN 0 ELSE 1 END) AS no_private_piece`,
            [h.slug],
          ),
        ],
        SERIALIZABLE,
      ));
    } catch (error) {
      return raced(error);
    }
    return {
      ok: true,
      message: `${h.slug} is now seen by the whole team.${along.length ? ` So ${along.length === 1 ? "is the piece made for it" : `are the ${along.length} pieces made for it`}: ${along.map((p) => p.slug).join(", ")}.` : ""}`,
    };
  }

  // To private: every piece made for it goes along, the ones it no longer uses too, unless another team harness uses one.
  const madeForIt = ((await sql.query(`SELECT slug FROM ${HARNESSES} WHERE made_for = $1 AND visibility <> 'private' ORDER BY slug`, [h.slug])) as Row[]).map((r) => String(r.slug));
  const along: string[] = [];
  const stay: string[] = [];
  for (const piece of madeForIt) ((await teamUsers(piece, h.slug)).length ? stay : along).push(piece);
  try {
    await serialized(() => sql.transaction(
      [
        sql.query(`UPDATE ${HARNESSES} SET visibility = 'private' WHERE slug = $1`, [h.slug]),
        // Every piece made for it but the ones that stay, decided in the write itself: one a save makes for it at
        // this same moment goes private too, or that save is the one refused.
        sql.query(`UPDATE ${HARNESSES} SET visibility = 'private' WHERE made_for = $1 AND visibility <> 'private' AND NOT (slug = ANY($2::text[]))`, [h.slug, stay]),
        ...(along.length ? [noTeamUser(along, h.slug)] : []),
      ],
      SERIALIZABLE,
    ));
  } catch (error) {
    return raced(error);
  }
  return {
    ok: true,
    message: `${h.slug} is now private: only you and its editors see it, with its versions, suggestions and runs.${along.length ? ` The pieces made for it are private too: ${along.join(", ")}.` : ""}${stay.length ? ` ${stay.join(", ")} ${stay.length === 1 ? "stays" : "stay"} a team piece: another team harness uses ${stay.length === 1 ? "it" : "them"}.` : ""}`,
  };
}

/** Lets someone change an item, or takes that back. Only its owner can. */
export async function setEditor(member: Member, slug: string, person: { email: string; name?: string }, add: boolean): Promise<Done> {
  const h = await findStored(slug);
  if (!h || !canSee(h, member)) return { ok: false, message: `There is nothing with the slug ${JSON.stringify(slug)}.` };
  if (h.owner.email !== member.email) return { ok: false, message: `Only ${personText(h.owner)} can say who edits ${h.slug}.` };
  const email = person.email.trim().toLowerCase();
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) || email.length > 254) return { ok: false, message: "Give a full email address." };
  if (!add) {
    await db().query(`DELETE FROM ${ROLES} WHERE slug = $1 AND email = $2`, [h.slug, email]);
    return { ok: true, message: `${email} no longer edits ${h.slug}.` };
  }
  if (email === h.owner.email) return { ok: false, message: "The owner can already change it." };
  if (h.ownEditors.length >= MAX_EDITORS && !h.ownEditors.some((e) => e.email === email)) return { ok: false, message: `An item can have at most ${MAX_EDITORS} editors.` };
  const name = label(person.name ?? "").slice(0, 80) || email.split("@")[0];
  await db().query(
    `INSERT INTO ${ROLES} (slug, email, name, added_by_email) VALUES ($1, $2, $3, $4) ON CONFLICT (slug, email) DO UPDATE SET name = EXCLUDED.name`,
    [h.slug, email, name, member.email],
  );
  return { ok: true, message: `${email} can now change ${h.slug}.` };
}

// ---------------------------------------------------------------------------
// Suggestions: a change proposed by someone who cannot change the item.
// Its owner or an editor merges it into a new version, or closes it. Anyone can comment.
// ---------------------------------------------------------------------------

function toSuggestion(r: Row): Suggestion {
  const proposed = (r.proposed ?? {}) as Partial<Fields>;
  return {
    number: Number(r.number),
    slug: String(r.slug),
    baseVersion: Number(r.base_version),
    title: String(r.title),
    proposed: {
      name: proposed.name ?? "",
      goal: proposed.goal ?? "",
      description: proposed.description ?? "",
      content: contentOf(proposed.content),
    },
    author: { email: String(r.author_email), name: String(r.author_name) },
    status: r.status as Suggestion["status"],
    comments: ((r.comments ?? []) as { email: string; name: string; text: string; at: string }[]).map((c) => ({
      by: { email: c.email, name: c.name },
      text: c.text,
      at: c.at,
    })),
    mergedVersion: r.merged_version === null || r.merged_version === undefined ? null : Number(r.merged_version),
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

/** An item's suggestions: the open ones first, then the newest decided ones. */
export async function suggestionsFor(slug: string): Promise<Suggestion[]> {
  if (!SLUG.test(slug)) return [];
  await ensureReady();
  const rows = (await db().query(
    `SELECT * FROM ${SUGGESTIONS} WHERE slug = $1 ORDER BY (status = 'open') DESC, number DESC LIMIT 60`,
    [slug],
  )) as Row[];
  return rows.map(toSuggestion);
}

export async function findSuggestion(number: number): Promise<Suggestion | undefined> {
  if (!isCount(number)) return undefined;
  await ensureReady();
  const rows = (await db().query(`SELECT * FROM ${SUGGESTIONS} WHERE number = $1`, [number])) as Row[];
  return rows[0] ? toSuggestion(rows[0]) : undefined;
}

/** What waits for a person: open suggestions on what they can change, and the fate of the ones they made. */
export type Waiting = {
  /** Open suggestions on items this person owns or edits. */
  toReview: (Suggestion & { itemName: string })[];
  /** This person's own suggestions: open ones, and those decided in the last two weeks. */
  mine: (Suggestion & { itemName: string })[];
};

export async function waitingFor(member: Member): Promise<Waiting> {
  await ensureReady();
  const names = `(SELECT name FROM ${VERSIONS} v WHERE v.slug = s.slug ORDER BY number DESC LIMIT 1) AS item_name`;
  const [toReview, mine] = (await Promise.all([
    db().query(
      `SELECT s.*, ${names} FROM ${SUGGESTIONS} s JOIN ${HARNESSES} h ON h.slug = s.slug
       WHERE s.status = 'open' AND h.archived_at IS NULL
         AND (h.owner_email = $1
              OR EXISTS (SELECT 1 FROM ${ROLES} r WHERE r.slug = s.slug AND r.email = $1)
              -- A piece made for a harness: whoever edits that harness decides on its suggestions too.
              OR EXISTS (SELECT 1 FROM ${ROLES} r WHERE r.slug = h.made_for AND r.email = $1))
       ORDER BY s.number DESC LIMIT 30`,
      [member.email],
    ),
    db().query(
      `SELECT s.*, ${names} FROM ${SUGGESTIONS} s JOIN ${HARNESSES} h ON h.slug = s.slug
       WHERE s.author_email = $1 AND (s.status = 'open' OR s.decided_at > now() - interval '14 days') AND ${seesSql("h", "$1")}
       ORDER BY s.number DESC LIMIT 30`,
      [member.email],
    ),
  ])) as [Row[], Row[]];
  const withName = (r: Row) => ({ ...toSuggestion(r), itemName: String(r.item_name ?? r.slug) });
  return { toReview: toReview.map(withName), mine: mine.map(withName) };
}

export type SuggestResult =
  | { ok: true; suggestion: Suggestion; changed: string[]; owner: HarnessView["owner"] }
  | { ok: false; message: string };

/**
 * Opens a suggestion. `basedOn` is the version the person was looking at when
 * they wrote the change: the suggestion is recorded against that version, so a
 * merge can tell what they changed from what changed in the item meanwhile.
 */
export async function suggestChange(member: Member, slug: string, title: string, edit: Edit, basedOn?: number): Promise<SuggestResult> {
  const titleProblem = checkNote(title, "A suggestion needs a title");
  if (titleProblem) return { ok: false, message: titleProblem };
  const current = await findStored(slug);
  if (!current || !canSee(current, member)) return { ok: false, message: `There is nothing with the slug ${JSON.stringify(slug)}.` };
  if (current.archived) return { ok: false, message: isArchived(current) };
  if (canEdit(current, member)) {
    return { ok: false, message: `You can change ${current.slug} yourself, so save it directly with harness_hub_save.` };
  }
  // Two things only whoever can change the item does: neither can be merged from a suggestion as it would be meant.
  if (edit.teamNotes !== undefined) {
    return { ok: false, message: `Only whoever can change ${current.slug} turns its team notes on or off, so that cannot be suggested. Ask ${personText(current.owner)}.` };
  }
  if (edit.updatePart?.ownCopy) {
    return {
      ok: false,
      message: `A suggestion cannot give ${current.slug} its own copy of a piece. Suggest the new text on the piece itself, by its slug, or ask ${personText(current.owner)} to make the copy.`,
    };
  }
  const tooMany = `${current.slug} already has ${MAX_OPEN_SUGGESTIONS} open suggestions. Ask ${personText(current.owner)} to go through them first.`;
  if (current.openSuggestions >= MAX_OPEN_SUGGESTIONS) return { ok: false, message: tooMany };
  const base = basedOn === undefined || basedOn === current.latest ? current : await findStored(current.slug, basedOn);
  if (!base) return { ok: false, message: `${current.slug} has no version ${basedOn}. Its latest version is ${current.latest}.` };
  // A suggestion on a harness changes the harness: its prompt, its variables, which pieces it uses.
  // A change to the text of one of its pieces is a suggestion on that piece, for the piece's owner.
  if (current.kind === "harness") {
    const split = await splitPieceEdits(base, edit, member);
    if (split.problem) return { ok: false, message: split.problem.replace(" Nothing was saved.", " Nothing was sent.") };
    if (split.pieceEdits.length) {
      const rest = split.edit;
      const alone =
        split.pieceEdits.length === 1 &&
        [rest.name, rest.goal, rest.description, rest.prompt, rest.variables, rest.parts, rest.updatePart, rest.addPart, rest.removePart, rest.when, rest.icon, rest.teamNotes].every((x) => x === undefined);
      if (alone) {
        const e = split.pieceEdits[0];
        // The version of the harness says nothing about the piece: a text written on an older version of the piece
        // would be recorded against its latest, and would show a teammate's newer lines as lines to take out.
        if (e.onVersion === undefined && basedOn !== undefined) {
          return {
            ok: false,
            message: `based_on_version covers ${current.slug} itself, not its pieces: each has versions of its own. Nothing was sent. Add piece_version to update_part: the version of ${e.piece.slug} this change was written on, shown in the part's heading. It is at version ${e.piece.latest} now.`,
          };
        }
        return suggestChange(member, e.piece.slug, title, { name: e.name, prompt: e.prompt, description: e.description, when: e.when, icon: e.icon }, e.onVersion);
      }
      const list = split.pieceEdits.map((e) => `${quoted(e.label, 80)} (piece ${e.piece.slug})`).join(", ");
      return { ok: false, message: `These parts are pieces with versions of their own: ${list}. Nothing was sent. Suggest each change on its piece, one at a time, with the piece's slug; send the rest for ${current.slug} in a suggestion of its own.` };
    }
    edit = split.edit;
  }
  const applied = applyEdit(current.slug, base, edit, current.kind);
  if (typeof applied === "string") return { ok: false, message: applied.replace(" Nothing was saved.", " Nothing was sent.") };
  // A part the suggestion adds as text stays text in the suggestion. Its piece is made when the suggestion is merged,
  // so what would stop that then (a text too long for a piece) is said now, to the person who can still shorten it.
  if (current.kind === "harness") {
    const plan = await planPieces(current.slug, applied, base);
    if (typeof plan === "string") return { ok: false, message: plan };
    const asMerged = await settleLinks(plan.fields, base, plan.planned, { viewer: member, harness: current.slug, visibility: current.visibility });
    if (typeof asMerged === "string") return { ok: false, message: asMerged.replace(" Nothing was saved.", " Nothing was sent.") };
  }
  const proposed = await settleLinks(applied, base, [], { viewer: member, harness: current.slug, visibility: current.visibility });
  if (typeof proposed === "string") return { ok: false, message: proposed };
  const changed = await described(base, proposed, member);
  if (changed.length === 0) return { ok: false, message: `This suggestion changes nothing in version ${base.version}.` };

  // The item's row is taken first, so suggestions sent together are counted one after the other.
  const sql = db();
  const stored = { name: proposed.name, goal: proposed.goal, description: proposed.description, content: proposed.content };
  const [, rows] = (await sql.transaction([
    sql.query(`SELECT 1 FROM ${HARNESSES} WHERE slug = $1 FOR UPDATE`, [current.slug]),
    sql.query(
      `INSERT INTO ${SUGGESTIONS} (slug, base_version, title, proposed, author_email, author_name)
       SELECT $1, $2::int, $3, $4::jsonb, $5, $6
       WHERE (SELECT count(*) FROM ${SUGGESTIONS} WHERE slug = $1 AND status = 'open') < $7::int
       RETURNING *`,
      [current.slug, base.version, title.trim(), JSON.stringify(stored), member.email, member.name, MAX_OPEN_SUGGESTIONS],
    ),
  ])) as [Row[], Row[]];
  if (rows.length === 0) return { ok: false, message: tooMany };
  return { ok: true, suggestion: toSuggestion(rows[0]), changed, owner: current.owner };
}

export type ReviewResult =
  | { ok: true; message: string; suggestion: Suggestion; harness?: HarnessView }
  | { ok: false; message: string };

/** Comment on, merge or close a suggestion. Anyone comments; the owner and the editors merge or close. */
export async function reviewSuggestion(
  member: Member,
  number: number,
  action: "comment" | "merge" | "close",
  comment?: string,
): Promise<ReviewResult> {
  const sug = await findSuggestion(number);
  if (!sug) return { ok: false, message: `There is no suggestion #${number}.` };
  const latest = await findStored(sug.slug);
  if (!latest || !canSee(latest, member)) return { ok: false, message: `There is no suggestion #${number}.` };
  const text = comment?.trim() ?? "";
  if (text.length > 2000) return { ok: false, message: "A comment can be at most 2,000 characters." };
  if (SECRET.test(text)) return { ok: false, message: LOOKS_SECRET };
  const full = `Suggestion #${number} already has ${MAX_COMMENTS} comments, which is the limit.`;
  if (text && sug.comments.length >= MAX_COMMENTS) return { ok: false, message: full };
  const sql = db();
  /** Adds the comment unless the suggestion is full. The limit is part of the statement, so comments sent together cannot pass it. */
  const addComment = async (): Promise<boolean> => {
    const added = (await sql.query(
      `UPDATE ${SUGGESTIONS} SET comments = comments || $2::jsonb
       WHERE number = $1 AND jsonb_array_length(comments) < $3::int RETURNING number`,
      [number, JSON.stringify([{ email: member.email, name: member.name, text, at: new Date().toISOString() }]), MAX_COMMENTS],
    )) as Row[];
    return added.length > 0;
  };
  const done = async (message: string, harness?: HarnessView): Promise<ReviewResult> => {
    const suggestion = await findSuggestion(number);
    return suggestion ? { ok: true, message, suggestion, harness } : { ok: false, message: `Suggestion #${number} is gone.` };
  };

  if (action === "comment") {
    if (!text) return { ok: false, message: "Write the comment in the comment field." };
    if (!(await addComment())) return { ok: false, message: full };
    return done(`Comment added to suggestion #${number}.`);
  }

  if (!canEdit(latest, member)) {
    return { ok: false, message: `Only ${personText(latest.owner)}${latest.editors.length ? " and its editors" : ""} can ${action} suggestions on ${sug.slug}. You can comment.` };
  }
  const decided = `Suggestion #${number} is already ${sug.status}.`;
  if (sug.status !== "open") return { ok: false, message: decided };

  if (action === "close") {
    // Only an open suggestion closes: a second click, or a merge that landed first, changes nothing.
    const closed = (await sql.query(
      `UPDATE ${SUGGESTIONS} SET status = 'closed', decided_by_email = $2, decided_at = now()
       WHERE number = $1 AND status = 'open' RETURNING number`,
      [number, member.email],
    )) as Row[];
    if (closed.length === 0) return { ok: false, message: `Suggestion #${number} was decided a moment ago. Look at it again.` };
    if (text) await addComment();
    return done(`Closed suggestion #${number}. ${sug.slug} is unchanged.`);
  }

  if (latest.archived) return { ok: false, message: isArchived(latest) };
  const base = await findStored(sug.slug, sug.baseVersion);
  if (!base) return { ok: false, message: `Version ${sug.baseVersion} of ${sug.slug} is missing.` };
  const merged = mergeOnto(base, { ...sug.proposed, kind: latest.kind }, latest);
  if (!merged.ok) {
    return {
      ok: false,
      message: `Suggestion #${number} was made on version ${sug.baseVersion}, and since then these were changed in ${sug.slug} too: ${merged.conflicts.join(", ")}. It cannot be merged as it is. Close it and ask ${personText(sug.author)} to suggest the change again on version ${latest.latest}. A part that is a piece now takes suggestions on the piece itself, by its slug.`,
    };
  }
  const problem = check(merged.result, latest.kind, latest);
  if (problem) return { ok: false, message: problem };
  // A part the suggestion added as text becomes a piece made for the harness, in the same transaction as the merge.
  const plan = latest.kind === "harness" ? await planPieces(latest.slug, merged.result, latest) : { fields: merged.result, planned: [] as Planned[] };
  if (typeof plan === "string") return { ok: false, message: plan };
  const settled = await settleLinks(plan.fields, latest, plan.planned, { viewer: member, harness: latest.slug, visibility: latest.visibility });
  if (typeof settled === "string") return { ok: false, message: settled };
  const changed = await described(latest, settled, member);
  if (changed.length === 0) return { ok: false, message: `Suggestion #${number} changes nothing in version ${latest.latest}. Close it instead.` };

  // One statement adds the version and marks the suggestion merged, and does
  // neither unless the suggestion is still open and the item is still at the
  // version this merge was worked out on.
  let rows: Row[];
  try {
    // The suggestion's row is taken first. A close that lands at the same
    // moment is then either waited for, or seen by the statement that follows.
    const results = (await serialized(() => sql.transaction([
      sql.query(`SELECT 1 FROM ${SUGGESTIONS} WHERE number = $1 FOR UPDATE`, [number]),
      ...(latest.kind === "harness"
        ? visibilityGuards(sql, latest.slug, latest.visibility, linksOf(settled.content.parts).filter((s) => !plan.planned.some((p) => p.slug === s)), true)
        : []),
      ...pieceStatements(sql, latest.slug, latest.owner, member, plan.planned, latest.visibility),
      sql.query(
        `WITH added AS (
           INSERT INTO ${VERSIONS} (slug, number, name, description, note, content, saved_by_email, saved_by_name, changes, goal)
           SELECT $1, max(number) + 1, $2, $3, $4, $5::jsonb, $6, $7, $8, $11
           FROM ${VERSIONS} WHERE slug = $1
           HAVING max(number) = $9::int AND EXISTS (SELECT 1 FROM ${SUGGESTIONS} WHERE number = $10::int AND status = 'open')
           RETURNING number
         )
         UPDATE ${SUGGESTIONS} SET status = 'merged', decided_by_email = $6, decided_at = now(),
                merged_version = (SELECT number FROM added)
         WHERE number = $10::int AND EXISTS (SELECT 1 FROM added)
         RETURNING merged_version`,
        [
          sug.slug,
          settled.name,
          settled.description,
          oneLine(`Suggestion #${number} by ${sug.author.name}: ${sug.title}`, 200),
          JSON.stringify(settled.content),
          member.email,
          member.name,
          changed.join(", "),
          latest.latest,
          number,
          settled.goal,
        ],
      ),
      // When nothing was merged this fails, so the pieces made above are undone with it.
      sql.query(`SELECT 1 / (SELECT count(*) FROM ${SUGGESTIONS} WHERE number = $1 AND status = 'merged' AND merged_version = $2::int) AS merged`, [number, latest.latest + 1]),
    ], SERIALIZABLE))) as Row[][];
    rows = results[results.length - 2];
  } catch (error) {
    if (!lostRace(error)) throw error;
    rows = [];
  }
  if (rows.length === 0) {
    return { ok: false, message: `${sug.slug} or suggestion #${number} changed a moment ago, so nothing was merged. Look at it again and retry.` };
  }
  if (text) await addComment();
  const version = Number(rows[0].merged_version);
  const now = await findHarness(member, sug.slug);
  const grew = latest.kind !== "harness" && pieceLength(settled.content) > pieceLength(latest.content);
  const note = grew && now ? await nowPastLimit(now, member) : "";
  return done(`Merged suggestion #${number} into ${sug.slug} as version ${version}. Changed: ${changed.join(", ")}.${note ? ` ${note}` : ""}`, now);
}
