import type { Fields } from "./diff";
import type { Member } from "./members";
import { SLUG } from "./safe-text";
import type { HarnessView, ItemKind, Part, PartKind, Person, VersionLine } from "./types";
import { canSee, visibilityOf } from "./visibility";
import { contentOf, db, HARNESSES, isCount, ROLES, type Row, RUNS, SUGGESTIONS, VERSIONS } from "./db";
import { ensureReady } from "./setup";

/**
 * Reading the store: items as stored, items as a person sees them, and their versions. A harness is filled with the
 * current text of its pieces here, and whatever points at something the reader cannot see says nothing about it.
 */

/** What is recorded as the change of a version that has the text of the one before, saved again by someone who can change the piece. */
export const TAKEN_OVER = "text taken over, unchanged";

/** What is recorded as the change of a version that only touched a memory's team notes: a line added, or notes turned on or off. */
export const NOTES_ONLY = "team notes";

/**
 * The newest version, up to the one read, in which one thing about an item got to be what it is: who saved it,
 * when, with what note. The first version set everything, and so does a version that takes a text over as it stands.
 * It is how the Hub knows whose words a text, a name or a timing are, whoever saved the item since.
 */
const lastSet = (changed: string) => `
         (SELECT json_build_object('email', t.saved_by_email, 'name', t.saved_by_name, 'at', t.saved_at, 'note', t.note, 'number', t.number)
            FROM ${VERSIONS} t LEFT JOIN ${VERSIONS} p ON p.slug = t.slug AND p.number = t.number - 1
            WHERE t.slug = h.slug AND t.number <= v.number AND (p.number IS NULL OR t.changes LIKE '%${TAKEN_OVER}%' OR ${changed})
            ORDER BY t.number DESC LIMIT 1)`;

export const VIEW = `
  SELECT h.slug, h.kind, h.owner_email, h.owner_name, h.copied_from, h.archived_at, h.made_for, h.visibility,
         v.number, v.name, v.goal, v.description, v.note, v.content, v.saved_by_email, v.saved_by_name, v.saved_at,
         (SELECT max(number) FROM ${VERSIONS} WHERE slug = h.slug) AS latest,
         ${lastSet("t.content->>'prompt' IS DISTINCT FROM p.content->>'prompt'")} AS text_version,
         ${lastSet("t.name IS DISTINCT FROM p.name")} AS name_version,
         CASE WHEN h.kind = 'hook' THEN ${lastSet("t.content->>'when' IS DISTINCT FROM p.content->>'when'")} END AS when_version,
         (SELECT count(*)::int FROM ${SUGGESTIONS} WHERE slug = h.slug AND status = 'open') AS open_suggestions,
         (SELECT coalesce(json_agg(json_build_object('email', r.email, 'name', r.name) ORDER BY r.added_at), '[]'::json)
            FROM ${ROLES} r WHERE r.slug = h.slug) AS editors,
         (SELECT coalesce(json_agg(json_build_object('email', p.email, 'name', p.name)), '[]'::json)
            FROM (SELECT m.owner_email AS email, m.owner_name AS name FROM ${HARNESSES} m WHERE m.slug = h.made_for
                  UNION ALL
                  SELECT r.email, r.name FROM ${ROLES} r WHERE r.slug = h.made_for) p) AS home_people,
         (SELECT count(*)::int FROM ${RUNS} WHERE slug = h.slug) AS runs,
         (SELECT count(*)::int FROM ${RUNS} WHERE slug = h.slug AND status = 'ok') AS clean_runs,
         (SELECT max(created_at) FROM ${RUNS} WHERE slug = h.slug) AS last_run
  FROM ${HARNESSES} h JOIN ${VERSIONS} v ON v.slug = h.slug`;

export const LATEST = `v.number = (SELECT max(number) FROM ${VERSIONS} WHERE slug = h.slug)`;

export const KINDS: ItemKind[] = ["harness", "skill", "tool", "hook", "memory"];

const peopleOf = (list: unknown): Person[] => ((list ?? []) as Person[]).map((e) => ({ email: String(e.email), name: String(e.name) }));

export function toView(r: Row): HarnessView {
  const kind = String(r.kind ?? "harness") as ItemKind;
  const ownEditors = peopleOf(r.editors);
  // A piece made for a harness can be changed by whoever can change that harness: its owner and its editors.
  const editors = [...ownEditors];
  for (const person of peopleOf(r.home_people)) {
    if (person.email !== String(r.owner_email) && !editors.some((e) => e.email === person.email)) editors.push(person);
  }
  const savedAt = new Date(r.saved_at as string).toISOString();
  const savedBy = { email: String(r.saved_by_email), name: String(r.saved_by_name) };
  // The version in which one thing about it got to be what it is: who saved it, when, with what note. Failing that, this one.
  const setAt = (raw: unknown) => {
    const set = (raw ?? null) as { email: string; name: string; at: string; note: string; number: number } | null;
    return set
      ? { by: { email: String(set.email), name: String(set.name) }, at: new Date(set.at).toISOString(), note: String(set.note), version: Number(set.number) }
      : { by: savedBy, at: savedAt, note: String(r.note), version: Number(r.number) };
  };
  const text = setAt(r.text_version);
  const named = setAt(r.name_version);
  // Only a hook says when it applies. Anything else has no timing for anyone to have set: it goes with the text.
  const timed = kind === "hook" ? setAt(r.when_version) : text;
  return {
    slug: String(r.slug),
    kind: KINDS.includes(kind) ? kind : "harness",
    name: String(r.name),
    goal: String(r.goal ?? ""),
    description: String(r.description),
    owner: { email: String(r.owner_email), name: String(r.owner_name) },
    editors,
    ownEditors,
    madeFor: r.made_for ? String(r.made_for) : null,
    visibility: visibilityOf(r.visibility),
    version: Number(r.number),
    latest: Number(r.latest),
    note: String(r.note),
    savedAt,
    savedBy,
    text: { ...text, nameBy: named.by, whenBy: timed.by },
    lastChange: lastChangeOf(text, named, timed),
    copiedFrom: r.copied_from ? String(r.copied_from) : null,
    openSuggestions: Number(r.open_suggestions ?? 0),
    archived: Boolean(r.archived_at),
    runs: Number(r.runs ?? 0),
    cleanRuns: Number(r.clean_runs ?? 0),
    lastRunAt: r.last_run ? new Date(r.last_run as string).toISOString() : null,
    content: contentOf(r.content),
  };
}

/**
 * An agent reads three things of a piece: its text, its name and when it applies. Given the version in which each
 * got to be what it is, this is the newest of them: the piece's last change. When several were set in one version,
 * they are the same version, and the text's record stands for it.
 */
export function lastChangeOf<T extends { version: number }>(text: T, named: T, timed: T): T {
  return [named, timed].reduce((newest, set) => (set.version > newest.version ? set : newest), text);
}

/** Who last set what an agent reads of a piece: its text, its name, when it applies. */
export const writersOf = (piece: HarnessView): Person[] => [piece.text.by, piece.text.nameBy, piece.text.whenBy];

/** A piece as a part of a harness. */
export function partOf(piece: HarnessView): Part {
  return {
    kind: piece.kind as PartKind,
    name: piece.name,
    summary: piece.description || undefined,
    body: piece.content.prompt,
    when: piece.content.when,
    icon: piece.content.icon,
    piece: piece.slug,
    by: piece.owner,
    pieceVersion: piece.version,
    // Who saved the text as it stands, and when: a line of team notes added since is not a change to it.
    savedBy: piece.text.by,
    pieceSavedAt: piece.text.at,
    pieceNote: piece.text.note,
    textVersion: piece.text.version,
    // The newest change to anything an agent reads of it: its text, its name, or when it applies.
    pieceChange: piece.lastChange,
    madeFor: piece.madeFor,
    pieceSuggestions: piece.openSuggestions,
    ...(typeof piece.content.notes === "string" ? { notes: piece.content.notes } : {}),
  };
}

/**
 * Puts each piece, as it is now, into the part that points at it: its text,
 * and its name. A part is its piece, so when the piece is renamed the part
 * reads the new name everywhere. The name stored with the link stays what it
 * was: it is only how the harness tells its parts apart when two versions are
 * compared or a suggestion is merged.
 *
 * It also says whose words each piece is. A piece counts as the harness
 * owner's own only when nobody can change it who could not change the harness
 * itself, and what an agent reads of it was each last set by someone who can:
 * its text, and the two things its heading prints, its name and when it
 * applies. An editor who was let go since still wrote what they wrote.
 * Anything else is a teammate's piece that the owner chose to use.
 */
function resolveLinks(h: HarnessView, pieces: Map<string, HarnessView>): HarnessView {
  if (h.kind !== "harness" || !h.content.parts.some((p) => p.piece)) return h;
  const here = new Set([h.owner.email, ...h.editors.map((e) => e.email)]);
  const parts = h.content.parts.map((p) => {
    if (!p.piece) return p;
    const piece = pieces.get(p.piece);
    if (!piece) return { ...p, summary: "This piece could not be found.", body: "" };
    const outsiders = [piece.owner, ...piece.editors].filter((person) => !here.has(person.email));
    // Whoever last set its text, its name or its timing without being able to change this harness: their words are in it.
    const stranger = writersOf(piece).find((person) => !here.has(person.email));
    return { ...partOf(piece), ...(stranger ? { stranger } : {}), ownText: outsiders.length === 0 && !stranger, ...(outsiders.length ? { outsiders } : {}) };
  });
  return { ...h, content: { ...h.content, parts } };
}

/**
 * An item as this person may read it: whatever points at something they cannot see says nothing about it. The
 * harness a piece was made for and the people who edit it, the item a copy was made from, and in a harness, the
 * name of a piece they cannot see.
 */
/** What a piece this person cannot see is called, wherever its name would stand. */
export const PRIVATE_PIECE = "a private piece";

function maskedFor(x: HarnessView, sees: (slug: string) => boolean, hidden: Set<string>): HarnessView {
  const home = x.madeFor !== null && !sees(x.madeFor);
  const original = x.copiedFrom !== null && !sees(x.copiedFrom);
  const parts = x.content.parts.some((p) => p.piece && hidden.has(p.piece))
    ? x.content.parts.map((p) =>
        p.piece && hidden.has(p.piece) ? { ...p, name: PRIVATE_PIECE, summary: "This piece is private: only its owner and its editors can read it.", body: "", hidden: true } : p,
      )
    : x.content.parts;
  if (!home && !original && parts === x.content.parts) return x;
  return {
    ...x,
    ...(home ? { madeFor: null, editors: x.ownEditors } : {}),
    ...(original ? { copiedFrom: null } : {}),
    content: { ...x.content, parts },
  };
}

export type Everything = {
  /** Every harness, in its latest version, with the text of its pieces filled in. Newest first. */
  harnesses: HarnessView[];
  /** Every piece, in its latest version. */
  pieces: HarnessView[];
};

/**
 * Everything the Hub holds that is not archived, as this person sees it: a private item they cannot see is left out,
 * and a piece they cannot see fills no harness they read. `null` is the Hub itself, which sees everything.
 */
export async function everything(viewer: Member | null): Promise<Everything> {
  await ensureReady();
  const stored = ((await db().query(`${VIEW} WHERE ${LATEST} ORDER BY v.saved_at DESC`)) as Row[]).map(toView);
  const bySlug = new Map(stored.map((x) => [x.slug, x]));
  const sees = (slug: string) => {
    const x = bySlug.get(slug);
    return x === undefined || canSee(x, viewer);
  };
  const hidden = new Set(stored.filter((x) => x.kind !== "harness" && !canSee(x, viewer)).map((x) => x.slug));
  const all = stored.filter((x) => canSee(x, viewer));
  // An archived piece still fills the harnesses that use it; it only leaves the lists.
  const pieces = new Map(all.filter((x) => x.kind !== "harness").map((x) => [x.slug, x]));
  return {
    harnesses: all.filter((x) => x.kind === "harness" && !x.archived).map((h) => maskedFor(resolveLinks(h, pieces), sees, hidden)),
    pieces: all.filter((x) => x.kind !== "harness" && !x.archived).map((p) => maskedFor(p, sees, hidden)),
  };
}

/** Every harness this person sees, each in its latest version, newest first. */
export async function allHarnesses(viewer: Member | null): Promise<HarnessView[]> {
  return (await everything(viewer)).harnesses;
}

/** What a person has archived, so they can bring it back. */
export async function archivedBy(member: Member): Promise<HarnessView[]> {
  await ensureReady();
  const rows = (await db().query(`${VIEW} WHERE ${LATEST} AND h.archived_at IS NOT NULL AND h.owner_email = $1 ORDER BY h.archived_at DESC`, [
    member.email,
  ])) as Row[];
  return rows.map(toView);
}

/** An item as stored: a part that is a shared piece holds the link, not the piece's text. */
export async function findStored(slug: string, version?: number): Promise<HarnessView | undefined> {
  const wanted = slug.trim().toLowerCase();
  if (!SLUG.test(wanted)) return undefined;
  if (version !== undefined && !isCount(version)) return undefined;
  await ensureReady();
  const rows = (
    version === undefined
      ? await db().query(`${VIEW} WHERE h.slug = $1 ORDER BY v.number DESC LIMIT 1`, [wanted])
      : await db().query(`${VIEW} WHERE h.slug = $1 AND v.number = $2`, [wanted, version])
  ) as Row[];
  return rows[0] ? toView(rows[0]) : undefined;
}

export async function piecesBySlug(slugs: string[]): Promise<Map<string, HarnessView>> {
  if (slugs.length === 0) return new Map();
  const rows = (await db().query(`${VIEW} WHERE h.slug = ANY($1::text[]) AND h.kind <> 'harness' AND ${LATEST}`, [slugs])) as Row[];
  return new Map(rows.map(toView).map((p) => [p.slug, p]));
}

/**
 * A harness or a shared piece by slug: its latest version, or a specific one.
 * Shared pieces a harness uses are filled in with their current text, whatever
 * version of the harness was asked for.
 *
 * As this person sees it: a private item they cannot see is not there for them,
 * and a piece they cannot see fills no part. `null` is the Hub itself.
 */
export async function findHarness(viewer: Member | null, slug: string, version?: number): Promise<HarnessView | undefined> {
  const h = await findStored(slug, version);
  if (!h || !canSee(h, viewer)) return undefined;
  // What it points at: the harness it was made for, the item it copies. Looked up only to know whether to say so.
  const pointed = await Promise.all([h.madeFor, h.copiedFrom].map((s) => (s ? findStored(s) : Promise.resolve(undefined))));
  const blind = new Set(pointed.filter((x): x is HarnessView => x !== undefined && !canSee(x, viewer)).map((x) => x.slug));
  const sees = (s: string) => !blind.has(s);
  const linked = h.kind === "harness" ? [...new Set(h.content.parts.map((p) => p.piece).filter((s): s is string => Boolean(s)))] : [];
  if (!linked.length) return maskedFor(h, sees, new Set());
  const pieces = await piecesBySlug(linked);
  const hidden = new Set<string>();
  for (const [slug, piece] of pieces) {
    if (!canSee(piece, viewer)) {
      pieces.delete(slug);
      hidden.add(slug);
    }
  }
  return maskedFor(resolveLinks(h, pieces), sees, hidden);
}

/**
 * An item's history, newest first: at most `limit` versions, since a team
 * memory gets one for every line added. With `withText`, that many of the
 * newest also carry their text, so each can be compared with the one before.
 */
export async function versionsOf(slug: string, withText = 0, limit = 200): Promise<VersionLine[]> {
  if (!SLUG.test(slug)) return [];
  await ensureReady();
  const rows = (await db().query(
    `SELECT number, note, changes, saved_by_email, saved_by_name, saved_at,
            CASE WHEN number > newest - $2::int THEN name END AS name,
            CASE WHEN number > newest - $2::int THEN goal END AS goal,
            CASE WHEN number > newest - $2::int THEN description END AS description,
            CASE WHEN number > newest - $2::int THEN content END AS content
     FROM ${VERSIONS}, (SELECT max(number) AS newest FROM ${VERSIONS} WHERE slug = $1) n
     WHERE slug = $1 ORDER BY number DESC LIMIT $3::int`,
    [slug, withText, limit],
  )) as Row[];
  return rows.map((r) => ({
    number: Number(r.number),
    note: String(r.note),
    changes: r.changes ? String(r.changes) : Number(r.number) === 1 ? "first version" : "",
    savedBy: { email: String(r.saved_by_email), name: String(r.saved_by_name) },
    savedAt: new Date(r.saved_at as string).toISOString(),
    fields: r.content
      ? { name: String(r.name), goal: String(r.goal ?? ""), description: String(r.description), content: contentOf(r.content) }
      : undefined,
  }));
}

/** A few versions by number, as stored: a part that is a shared piece is the link, not the piece's text. */
export async function versionFields(slug: string, numbers: number[]): Promise<Map<number, Fields>> {
  const wanted = [...new Set(numbers)].filter(isCount);
  if (!SLUG.test(slug) || wanted.length === 0) return new Map();
  await ensureReady();
  const rows = (await db().query(`SELECT number, name, goal, description, content FROM ${VERSIONS} WHERE slug = $1 AND number = ANY($2::int[])`, [
    slug,
    wanted,
  ])) as Row[];
  return new Map(
    rows.map((r) => [Number(r.number), { name: String(r.name), goal: String(r.goal ?? ""), description: String(r.description), content: contentOf(r.content) }]),
  );
}

/** The name each of these pieces has now, by slug. */
export async function pieceNames(slugs: string[], viewer: Member | null): Promise<Map<string, string>> {
  const pieces = await piecesBySlug([...new Set(slugs)].filter((slug) => SLUG.test(slug)));
  // A piece this person cannot see is called that, never by the name it had when a version stored it.
  return new Map([...pieces].map(([slug, piece]) => [slug, canSee(piece, viewer) ? piece.name : PRIVATE_PIECE]));
}
