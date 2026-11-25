import type { Visibility } from "./visibility";
import type { Member } from "./members";

/**
 * Shapes shared by the connector and the dashboard.
 *
 * A harness is a prompt, its variables, and parts. Each part is a piece: a
 * skill, tool, hook or memory saved as an item of its own, with its own
 * versions, which the harness uses by link. Harnesses are built from pieces
 * the way a model is built from bricks.
 */

export type Variable = {
  /** Short name used in the harness text, e.g. "handle". Lower-case letters, digits, underscore. */
  key: string;
  /** What to ask the person for, in plain words. */
  label: string;
  /** Leave out for anything that identifies a person (handle, account, voice): it is then required. */
  default?: string;
};

export type PartKind = "skill" | "tool" | "hook" | "memory";

/**
 * What the Hub stores: harnesses, and the pieces they are made of. A piece is
 * saved, versioned, suggested on and owned exactly like a harness.
 */
export type ItemKind = "harness" | PartKind;

/**
 * A named part of a harness. A part is a piece the harness uses by link.
 * Versions saved before every part was a piece still hold their parts' text.
 */
export type Part = {
  kind: PartKind;
  name: string;
  /** A piece the person reading cannot see: only that it is there is shown, never its name, slug or text. */
  hidden?: boolean;
  /** One line saying what the part is for, shown in lists. */
  summary?: string;
  /** The part's text, as its owner wrote it. */
  body: string;
  /** Tools only: which icon stands for it. */
  icon?: "browser" | "code" | "send" | "connector";
  /** Hooks only: when the rule applies. */
  when?: "start" | "before_tool" | "after_tool" | "end";
  /**
   * The slug of the piece this part is: what tells it apart from the other
   * parts. Its name and its text come from that piece's latest version, so a
   * change to the piece reaches every harness that uses it. The name stored
   * next to the slug is only what the piece was called when the harness was
   * last saved. Left out only in versions saved before every part was a piece.
   */
  piece?: string;
  /**
   * Filled in when the harness is read and never stored: who owns the piece
   * and which version of it this is; then who saved its text as it stands,
   * when, and with what note. A line of team notes makes a version too, and
   * does not count as a change to the text.
   *
   * `pieceVersion` is also read from what an agent sends with a part's text:
   * the version of the piece that text was written on.
   */
  by?: Person;
  pieceVersion?: number;
  savedBy?: Person;
  pieceSavedAt?: string;
  pieceNote?: string;
  /** The version in which the piece's text got to be what it is: 1 for a text that never changed. */
  textVersion?: number;
  /**
   * The newest version of the piece that changed anything an agent reads of
   * it: its text, its name, or when it applies. Who saved it, when, with what
   * note, and its number: 1 for a piece that still reads as it did when it
   * was made. It is what a person is told changed since their last run. A
   * version that only changed the summary, the icon or the team notes is not
   * one.
   */
  pieceChange?: { by: Person; at: string; note: string; version: number };
  /** The harness the piece was made for, when it was made from a part of one. */
  madeFor?: string | null;
  /** How many suggestions are waiting on the piece itself. A change to a part is suggested there, not on the harness. */
  pieceSuggestions?: number;
  /**
   * True when nobody can change the piece who could not change this harness,
   * and what an agent reads of it (its text, its name, when it applies) was
   * each last set by someone who can. It then counts as the harness owner's
   * own. Otherwise it is a teammate's piece that the owner chose to use.
   */
  ownText?: boolean;
  /** Someone who last set its text, its name or its timing and cannot change this harness: their words are in it. */
  stranger?: Person;
  /** The people who can change the piece and cannot change this harness. */
  outsiders?: Person[];
  /** A memory piece's team notes, when it takes any: lines that runs added, never instructions. */
  notes?: string;
};

export type HarnessContent = {
  /** The prompt as its owner wrote it. For a shared piece: the piece's text. */
  prompt: string;
  variables: Variable[];
  /** The skills, tools, hooks and memory of a harness: its own, and shared pieces it uses. */
  parts: Part[];
  /** Shared hooks only: when the rule applies. */
  when?: Part["when"];
  /** Shared tools only: which icon stands for it. */
  icon?: Part["icon"];
  /**
   * Harnesses only: when it is meant to run, in one line its owner wrote, for example "At 06:44, Sunday through
   * Thursday". The Hub runs nothing: a person's agent sets it up in its own scheduler when they ask.
   */
  schedule?: string;
  /**
   * Harnesses only: the models and agents its owner says it works well on, in one line, for example "Opus 5.5 in
   * Claude; GPT-5 in Codex". The owner's claim: the runs reported by model are the evidence.
   */
  testedOn?: string;
  /**
   * Memory pieces only: whether runs may leave team notes in it.
   * null: it takes none. Its text says where each person keeps their own.
   * A text: the lines runs added so far, kept apart from the owner's text and never followed as instructions.
   * Left out: saved before notes existed, when a shared memory was team notes as a whole.
   */
  notes?: string | null;
};

/** The owner of a harness. The same shape as a signed-in member. */
export type Person = Member;

/** One version of one harness, ready to hand to Claude or show on a page. */
export type HarnessView = {
  slug: string;
  /** A harness, or a shared piece of one of the four kinds. */
  kind: ItemKind;
  name: string;
  /** What the agent is for, in one sentence: the outcome, not the steps. Empty on harnesses saved before goals existed. */
  goal: string;
  /** What it does, in a sentence or two. For a shared piece: its one-line summary. */
  description: string;
  owner: Person;
  /**
   * Everyone who can change it besides its owner. For a piece made for a
   * harness, that includes whoever can change that harness.
   * Everyone else can read, run, copy and suggest.
   */
  editors: Person[];
  /** The editors its owner named on this item itself: the ones the owner can take back here. */
  ownEditors: Person[];
  /** For a piece: the harness it was made for, when it was made from a part of one. */
  madeFor: string | null;
  /** Team: everyone in the Hub sees it. Private: only its owner and the people who can change it (lib/hub/visibility.ts). */
  visibility: Visibility;
  version: number;
  /** The one-line note saved with this version. */
  note: string;
  /** ISO timestamp of when this version was saved. */
  savedAt: string;
  /** Who saved this version. */
  savedBy: Person;
  /**
   * The newest version, up to this one, in which the text itself got to be
   * what it is: who saved it, when, with what note, and its number. A version
   * that only changed the name, the summary, a timing or the team notes left
   * the text as it was, and whoever saved it did not write the text.
   *
   * `nameBy` and `whenBy` say the same of the two other things an agent reads
   * of a piece, both printed in its heading: who gave it the name it has, and
   * who set when it applies.
   */
  text: { by: Person; at: string; note: string; version: number; nameBy: Person; whenBy: Person };
  /**
   * The newest version, up to this one, that changed anything an agent reads
   * of a piece: its text, its name, or when it applies. The newest of the
   * three above: who saved it, when, with what note, and its number.
   */
  lastChange: { by: Person; at: string; note: string; version: number };
  /** The newest version number. Equal to `version` unless an older one was asked for. */
  latest: number;
  /** The slug this harness was copied from, if it is a copy. */
  copiedFrom: string | null;
  /** How many suggestions are waiting for the owner. */
  openSuggestions: number;
  /** Set aside by its owner: out of the lists and the search, still readable by its address. */
  archived: boolean;
  /** Runs that agents reported for it, and how many of those went fine. */
  runs: number;
  cleanRuns: number;
  lastRunAt: string | null;
  content: HarnessContent;
};

/** One run of a harness, as the agent that did it reported it. */
export type Run = {
  id: number;
  slug: string;
  version: number;
  by: Person;
  /** ok: went as intended. flagged: finished, but something needs a look. failed: could not finish. */
  status: "ok" | "flagged" | "failed";
  note: string;
  /** The model the agent said it ran on, as it named it. Null when it did not say. */
  model: string | null;
  /** The agent that reported it: the app the person connected (Claude, Codex…), by the name the sign-in provider has. */
  agent: string | null;
  /** Names of the pieces the run had trouble with, when flagged or failed. */
  pieces: string[];
  at: string;
  /**
   * For a run that was not fine: who dealt with it, when, and what they did.
   * Null while it is still open. A run that went fine has nothing to deal with.
   */
  dealt: { by: Person; at: string; note: string } | null;
  /**
   * For an open run that had been marked as dealt with: who said it was not
   * after all, when, and the mark they undid. Nothing a person wrote is lost.
   */
  reopened: { by: Person; at: string; was: { by: string; note: string } | null } | null;
};

/** One line of a harness's history. */
export type VersionLine = {
  number: number;
  note: string;
  /** What changed against the version before, for example: part "Run log", variables. */
  changes: string;
  savedBy: Person;
  savedAt: string;
  /** The version's text. Only the newest versions carry it, and only when asked for. */
  fields?: { name: string; goal: string; description: string; content: HarnessContent };
};

/** A change proposed by someone who does not own the harness. */
export type Suggestion = {
  number: number;
  slug: string;
  /** The version the change was made on. */
  baseVersion: number;
  title: string;
  /** The harness as it would be after the change, on top of the base version. */
  proposed: { name: string; goal: string; description: string; content: HarnessContent };
  author: Person;
  status: "open" | "merged" | "closed";
  comments: { by: Person; text: string; at: string }[];
  mergedVersion: number | null;
  createdAt: string;
};

/** What search returns for each harness. */
export type HarnessSummary = Omit<HarnessView, "content">;

export function summaryOf(h: HarnessView): HarnessSummary {
  return {
    slug: h.slug,
    kind: h.kind,
    name: h.name,
    visibility: h.visibility,
    goal: h.goal,
    description: h.description,
    owner: h.owner,
    editors: h.editors,
    ownEditors: h.ownEditors,
    madeFor: h.madeFor,
    archived: h.archived,
    runs: h.runs,
    cleanRuns: h.cleanRuns,
    lastRunAt: h.lastRunAt,
    version: h.version,
    note: h.note,
    savedAt: h.savedAt,
    savedBy: h.savedBy,
    text: h.text,
    lastChange: h.lastChange,
    latest: h.latest,
    copiedFrom: h.copiedFrom,
    openSuggestions: h.openSuggestions,
  };
}
