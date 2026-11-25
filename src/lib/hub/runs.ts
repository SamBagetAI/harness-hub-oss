import { db, seesSql, TABLES, type Row } from "./db";
import { LOOKS_SECRET, SECRET } from "./harnesses";
import { findHarness, pieceNames } from "./read";
import { ensureReady } from "./setup";
import { blamedParts } from "./parts";
import type { Member } from "./members";
import { oneLine, personText, SLUG } from "./safe-text";
import type { Run } from "./types";
import { noVerdicts, verdictTotal, type Verdicts } from "./verdicts";

/**
 * Runs, as the agents that did them reported them.
 *
 * The Hub never runs anything, so it only knows about a run when the agent
 * says so at the end. A run that is never reported is invisible here, and the
 * numbers on the Stats page count reports, not runs.
 */

const STATUSES = ["ok", "flagged", "failed"] as const;
/** A person's agent can report this many runs a day. Past it, something is looping. */
const MAX_A_DAY = 200;

export type RunInput = {
  slug: string;
  /** The version that was loaded. Required: a run of an older version than the latest is how a load can say the harness moved since. */
  version?: number;
  /** ok: went as intended. flagged: finished, but something needs a look. failed: could not finish. */
  status: string;
  /** One line on what happened. */
  note?: string;
  /** Names of the parts the run had trouble with: stored by the slug of their piece. */
  pieces?: string[];
  /** The model the agent ran on, as it names it, for example claude-opus-5-5. */
  model?: string;
  /** The agent that reported it, from the token: never from what the agent sent. */
  agent?: string | null;
};

export async function logRun(member: Member, input: RunInput): Promise<{ ok: boolean; message: string }> {
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG.test(slug)) return { ok: false, message: "Give the slug of the harness that was run." };
  const status = input.status as (typeof STATUSES)[number];
  if (!STATUSES.includes(status)) return { ok: false, message: "The status must be ok, flagged or failed." };
  const note = oneLine(input.note ?? "", 300);
  const pieces = (input.pieces ?? []).slice(0, 40).map((p) => oneLine(String(p), 80)).filter(Boolean);
  const model = oneLine(input.model ?? "", 80) || null;
  if (SECRET.test([note, ...pieces, model ?? ""].join("\n"))) return { ok: false, message: LOOKS_SECRET };
  const version = Number.isInteger(input.version) && (input.version as number) >= 1 && (input.version as number) <= 1_000_000_000 ? (input.version as number) : null;
  if (version === null) return { ok: false, message: "Give version: the version of the harness that was loaded for this run, shown at the top of its text. Nothing was logged." };

  await ensureReady();
  const h = await findHarness(member, slug, version);
  if (!h || h.kind !== "harness") {
    const latest = await findHarness(member, slug);
    if (latest?.kind === "harness") return { ok: false, message: `${slug} has no version ${version}: its latest is ${latest.latest}. Give the version that was loaded for this run. Nothing was logged.` };
    return { ok: false, message: `There is no harness with the slug ${JSON.stringify(slug)}.` };
  }
  // A blamed part is kept by its piece's slug, so a count stays with the part whatever it is called later.
  const { blamed, unknown } = blamedParts(h.content.parts, pieces);
  if (unknown.length) {
    const list = h.content.parts.map((p) => (p.piece ? `${JSON.stringify(p.name)} (${p.piece})` : JSON.stringify(p.name))).join(", ");
    return { ok: false, message: `${unknown.map((n) => JSON.stringify(n)).join(", ")} ${unknown.length === 1 ? "is" : "are"} no part of ${slug} version ${version}. Its parts are: ${list || "none"}. Name each part as its heading does, or by its slug. Nothing was logged.` };
  }
  const rows = (await db().query(
    `INSERT INTO ${TABLES.runs} (slug, version, user_email, user_name, status, note, pieces, model, agent)
     SELECT h.slug, $2::int, $3, $4, $5, $6, $7::jsonb, $9, $10
     FROM ${TABLES.harnesses} h
     WHERE h.slug = $1 AND h.kind = 'harness'
       AND (SELECT count(*) FROM ${TABLES.runs} WHERE user_email = $3 AND created_at > now() - interval '1 day') < $8::int
     RETURNING version`,
    [slug, version, member.email, member.name, status, note, JSON.stringify(blamed), MAX_A_DAY, model, input.agent ? oneLine(input.agent, 120) : null],
  )) as Row[];
  if (rows.length > 0) return { ok: true, message: `Logged this run of ${slug} version ${rows[0].version} as ${status}.` };
  const exists = (await db().query(`SELECT 1 FROM ${TABLES.harnesses} WHERE slug = $1 AND kind = 'harness'`, [slug])) as Row[];
  return {
    ok: false,
    message: exists.length ? `More than ${MAX_A_DAY} runs were logged from this account today, so this one was not. Tell the person.` : `There is no harness with the slug ${JSON.stringify(slug)}.`,
  };
}

/** A person's last reported run of a harness: when it was reported, and which version of the harness it was. */
export type LastRun = { at: string; version: number };

/**
 * This person's last reported run of a harness, or null when they never
 * reported one. It is how a load can say what changed since they last ran it.
 */
export async function lastRun(member: Member, slug: string): Promise<LastRun | null> {
  if (!SLUG.test(slug)) return null;
  await ensureReady();
  const rows = (await db().query(`SELECT created_at AS at, version FROM ${TABLES.runs} WHERE slug = $1 AND user_email = $2 ORDER BY created_at DESC, id DESC LIMIT 1`, [
    slug,
    member.email,
  ])) as Row[];
  return rows[0] ? { at: new Date(rows[0].at as string).toISOString(), version: Number(rows[0].version) } : null;
}

function toRun(r: Row): Run {
  return {
    id: Number(r.id),
    slug: String(r.slug),
    version: Number(r.version),
    by: { email: String(r.user_email), name: String(r.user_name) },
    status: STATUSES.includes(r.status as Run["status"]) ? (r.status as Run["status"]) : "flagged",
    note: String(r.note ?? ""),
    model: r.model ? String(r.model) : null,
    agent: r.agent ? String(r.agent) : null,
    pieces: ((r.pieces ?? []) as unknown[]).map(String),
    at: new Date(r.created_at as string).toISOString(),
    dealt: r.dealt_at
      ? { by: { email: String(r.dealt_by_email ?? ""), name: String(r.dealt_by_name ?? "") }, at: new Date(r.dealt_at as string).toISOString(), note: String(r.dealt_note ?? "") }
      : null,
    // Open again after a mark: the mark that was undone is still in the row.
    reopened:
      !r.dealt_at && r.reopened_at
        ? {
            by: { email: String(r.reopened_by_email ?? ""), name: String(r.reopened_by_name ?? "") },
            at: new Date(r.reopened_at as string).toISOString(),
            was: r.dealt_by_name ? { by: String(r.dealt_by_name), note: String(r.dealt_note ?? "") } : null,
          }
        : null,
  };
}

/** A run that was not fine and that nobody has dealt with yet. */
const OPEN = `status <> 'ok' AND dealt_at IS NULL`;

/**
 * Says that a run which was not fine is dealt with, or that it is not after all.
 *
 * The verdict is the agent's and stays as it was reported. This is the one
 * thing a person adds to a run: that someone followed it up, and how. The
 * person whose run it was can, and so can the owner and the editors of the
 * harness. `shownAt` is the mark the person was looking at when they undid it:
 * a newer mark, which they have not seen, is left alone.
 */
export async function followUpRun(member: Member, id: number, dealt: boolean, note = "", shownAt?: string): Promise<{ ok: boolean; message: string }> {
  const gone = { ok: false, message: "That run could not be found. Reload the page." };
  if (!Number.isInteger(id) || id < 1 || id > 2_000_000_000) return gone;
  const what = oneLine(note, 200);
  if (SECRET.test(what)) return { ok: false, message: LOOKS_SECRET };
  const shown = shownAt && !Number.isNaN(Date.parse(shownAt)) ? new Date(shownAt).toISOString() : null;
  await ensureReady();
  const sql = db();
  const find = () =>
    sql.query(
      `SELECT r.slug, r.status, r.user_email, r.user_name, r.dealt_at, r.dealt_by_email, r.dealt_by_name,
              h.owner_email, h.owner_name, h.archived_at,
              EXISTS (SELECT 1 FROM ${TABLES.roles} x WHERE x.slug = r.slug AND x.email = $2) AS edits
       FROM ${TABLES.runs} r JOIN ${TABLES.harnesses} h ON h.slug = r.slug WHERE r.id = $1 AND ${seesSql("h", "$2")}`,
      [id, member.email],
    ) as Promise<Row[]>;
  const [run] = await find();
  if (!run) return gone;
  if (run.status === "ok") return { ok: false, message: "This run went fine: there is nothing to deal with." };
  const owner = personText({ name: String(run.owner_name), email: String(run.owner_email) });
  if (run.user_email !== member.email && run.owner_email !== member.email && !run.edits) {
    const runner = personText({ name: String(run.user_name), email: String(run.user_email) });
    const who = run.user_email === run.owner_email ? `${owner}, whose run it was and who owns ${run.slug},` : `${runner}, whose run it was, ${owner}, who owns ${run.slug},`;
    return { ok: false, message: `Only ${who} and its editors can say this run is dealt with.` };
  }
  // An archived harness is set aside: nothing about it changes until its owner brings it back.
  if (run.archived_at) return { ok: false, message: `${run.slug} is archived, so its runs stay as they are. ${owner} can bring it back on its page.` };

  // Each statement carries its own condition, so two people clicking at once cannot both win.
  if (dealt) {
    const changed = (await sql.query(
      `UPDATE ${TABLES.runs}
       SET dealt_by_email = $2, dealt_by_name = $3, dealt_at = now(), dealt_note = $4,
           reopened_by_email = NULL, reopened_by_name = NULL, reopened_at = NULL
       WHERE id = $1 AND dealt_at IS NULL RETURNING id`,
      [id, member.email, member.name, what],
    )) as Row[];
    if (changed.length > 0) return { ok: true, message: "Marked as dealt with." };
    // It is dealt with already. The same person clicking twice gets what they asked for; anyone else is told whose mark stands.
    const [now] = await find();
    if (now?.dealt_by_email === member.email) return { ok: true, message: "Marked as dealt with." };
    return { ok: false, message: `${oneLine(String(now?.dealt_by_name ?? "Someone"), 80)} already marked this run as dealt with. Your note was not saved.` };
  }
  const changed = (await sql.query(
    `UPDATE ${TABLES.runs} SET dealt_at = NULL, reopened_by_email = $2, reopened_by_name = $3, reopened_at = now()
     WHERE id = $1 AND dealt_at IS NOT NULL AND ($4::timestamptz IS NULL OR date_trunc('milliseconds', dealt_at) = $4::timestamptz)
     RETURNING id`,
    [id, member.email, member.name, shown],
  )) as Row[];
  if (changed.length > 0) return { ok: true, message: "Marked as not dealt with." };
  const [now] = await find();
  if (!now?.dealt_at) return { ok: true, message: "Marked as not dealt with." };
  return { ok: false, message: "This run was marked again since this page was loaded. It is shown as it is now." };
}

/**
 * Runs that wait for this person: not fine and not dealt with. For a harness
 * they own or edit, every such run; for any other harness, their own runs.
 * These are the runs they can mark, so the number is the number of buttons
 * they will find.
 */
export async function openRunsFor(member: Member): Promise<{ slug: string; runs: number; edits: boolean; lastAt: string }[]> {
  await ensureReady();
  const mayEdit = `(h.owner_email = $1 OR EXISTS (SELECT 1 FROM ${TABLES.roles} x WHERE x.slug = r.slug AND x.email = $1))`;
  const rows = (await db().query(
    `SELECT r.slug, count(*)::int AS n, bool_or(${mayEdit}) AS edits, max(r.created_at) AS last_at
     FROM ${TABLES.runs} r JOIN ${TABLES.harnesses} h ON h.slug = r.slug
     WHERE r.status <> 'ok' AND r.dealt_at IS NULL AND h.archived_at IS NULL AND (r.user_email = $1 OR ${mayEdit}) AND ${seesSql("h", "$1")}
     GROUP BY 1 ORDER BY 4 DESC LIMIT 10`,
    [member.email],
  )) as Row[];
  return rows.map((r) => ({ slug: String(r.slug), runs: Number(r.n), edits: Boolean(r.edits), lastAt: new Date(r.last_at as string).toISOString() }));
}

const isStatus = (value: unknown): value is Run["status"] => STATUSES.includes(value as Run["status"]);

/** Which runs of a harness to list. */
export type RunFilter = {
  /** Only the ones that needed a look or failed. */
  trouble?: boolean;
  /** Only the ones that were not fine and that nobody has dealt with yet. */
  open?: boolean;
  /** Only this person's. */
  email?: string;
};

/** Runs with the parts they blame named as people read them now: by their piece's current name. */
async function named(runs: Run[], viewer: Member | null): Promise<Run[]> {
  const names = await pieceNames(runs.flatMap((r) => r.pieces), viewer);
  return names.size === 0 ? runs : runs.map((r) => ({ ...r, pieces: r.pieces.map((p) => names.get(p) ?? p) }));
}

/** The latest runs of one harness, newest first. */
export async function runsOf(viewer: Member | null, slug: string, limit = 30, filter: RunFilter = {}): Promise<Run[]> {
  if (!SLUG.test(slug)) return [];
  await ensureReady();
  const rows = (await db().query(
    `SELECT * FROM ${TABLES.runs}
     WHERE slug = $1 AND ($3::boolean IS NOT TRUE OR status <> 'ok') AND ($4::text IS NULL OR user_email = $4)
       AND ($5::boolean IS NOT TRUE OR (${OPEN}))
     ORDER BY created_at DESC LIMIT $2::int`,
    [slug, limit, filter.trouble ?? false, filter.email ?? null, filter.open ?? false],
  )) as Row[];
  return named(rows.map(toRun), viewer);
}

/**
 * Every run ever reported for one harness, counted by verdict, with the day of
 * the first one, how many are this person's, and how many are still open.
 */
export async function verdictsOf(slug: string, email: string): Promise<{ counts: Verdicts; firstAt: string | null; mine: number; open: number }> {
  const counts = noVerdicts();
  if (!SLUG.test(slug)) return { counts, firstAt: null, mine: 0, open: 0 };
  await ensureReady();
  const rows = (await db().query(
    `SELECT status, count(*)::int AS n, min(created_at) AS first_at,
            (count(*) FILTER (WHERE user_email = $2))::int AS mine,
            (count(*) FILTER (WHERE ${OPEN}))::int AS open
     FROM ${TABLES.runs} WHERE slug = $1 GROUP BY 1`,
    [slug, email],
  )) as Row[];
  let first: number | null = null;
  let mine = 0;
  let open = 0;
  for (const r of rows) {
    if (!isStatus(r.status)) continue;
    counts[r.status] += Number(r.n);
    mine += Number(r.mine);
    open += Number(r.open);
    const at = new Date(r.first_at as string).getTime();
    if (first === null || at < first) first = at;
  }
  return { counts, firstAt: first === null ? null : new Date(first).toISOString(), mine, open };
}

export type Stats = {
  /** The last fourteen days, oldest first, as YYYY-MM-DD (UTC). */
  days: string[];
  /** Per harness: its runs per day by verdict, in the order of `days`, and who ran it. Most runs first. */
  perHarness: { slug: string; byDay: Verdicts[]; total: Verdicts; people: { name: string; runs: number }[] }[];
  /** Every run of the period, by verdict. */
  total: Verdicts;
  /** The fourteen days before the period, to say whether there is more or less of it now. */
  before: { runs: number; ok: number };
  /** People whose agents reported at least one run in the period, most runs first. */
  people: { name: string; runs: number }[];
  /** Suggestions merged in the period. */
  merged: number;
  /**
   * Pieces named by runs of the period that needed a look or failed: how
   * often, in which harness, what the latest of those runs said, on which
   * version, and how many runs of that harness were reported after it.
   */
  /** `piece` is the part as people read it now; `id` is what the runs stored: its piece's slug, or a name for runs from before. */
  trouble: { slug: string; piece: string; id: string; runs: number; open: number; lastAt: string; lastBy: string; lastNote: string; lastStatus: Run["status"]; lastVersion: number; since: number }[];
  /** Runs of the period that needed a look or failed without naming any piece. */
  unnamedTrouble: number;
  /** Runs of the period that were not fine and that nobody has dealt with yet. */
  open: number;
  recent: Run[];
};

export const PERIOD_DAYS = 14;
/** Where the period starts: midnight UTC, thirteen days before today. Every number on the Stats page counts from here. */
const SINCE = `(date_trunc('day', now() AT TIME ZONE 'UTC') - interval '${PERIOD_DAYS - 1} days') AT TIME ZONE 'UTC'`;

/**
 * What the reports of the last fourteen days say. With `email`, only that
 * person's runs and suggestions: every number on the page then means "mine".
 */
export async function stats(viewer: Member, mineOnly = false): Promise<Stats> {
  await ensureReady();
  const sql = db();
  const who = mineOnly ? viewer.email : null;
  // Runs of a private harness count only for the people who see it.
  const seen = (slug: string) => `${slug} IN (SELECT vh.slug FROM ${TABLES.harnesses} vh WHERE ${seesSql("vh", "$2")})`;
  // One condition for every query on runs, so all the numbers count the same reports.
  const mine = `($1::text IS NULL OR user_email = $1) AND ${seen("slug")}`;
  const args = [who, viewer.email];
  const [byDay, byPerson, merged, trouble, unnamed, recent, before] = (await sql.transaction([
    sql.query(
      `SELECT slug, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, status, count(*)::int AS n
       FROM ${TABLES.runs} WHERE created_at >= ${SINCE} AND ${mine} GROUP BY 1, 2, 3`,
      args,
    ),
    // A person is an address. The name shown is the one on their latest run.
    sql.query(
      `SELECT slug, user_email, (array_agg(user_name ORDER BY created_at DESC))[1] AS name, count(*)::int AS n
       FROM ${TABLES.runs} WHERE created_at >= ${SINCE} AND ${mine} GROUP BY 1, 2`,
      args,
    ),
    sql.query(
      `SELECT count(*)::int AS n FROM ${TABLES.suggestions}
       WHERE status = 'merged' AND decided_at >= ${SINCE} AND ($1::text IS NULL OR author_email = $1) AND ${seen("slug")}`,
      args,
    ),
    sql.query(
      `WITH named AS (
         SELECT r.slug, p AS piece, count(*)::int AS n, (count(*) FILTER (WHERE r.dealt_at IS NULL))::int AS open, max(r.created_at) AS last_at,
                (array_agg(r.note ORDER BY r.created_at DESC))[1] AS last_note,
                (array_agg(r.user_name ORDER BY r.created_at DESC))[1] AS last_by,
                (array_agg(r.status ORDER BY r.created_at DESC))[1] AS last_status,
                (array_agg(r.version ORDER BY r.created_at DESC))[1] AS last_version
         FROM ${TABLES.runs} r, jsonb_array_elements_text(r.pieces) AS p
         WHERE r.status <> 'ok' AND r.created_at >= ${SINCE} AND ($1::text IS NULL OR r.user_email = $1) AND ${seen("r.slug")}
         GROUP BY 1, 2
       )
       SELECT named.*,
              (SELECT count(*)::int FROM ${TABLES.runs} x
               WHERE x.slug = named.slug AND x.created_at > named.last_at AND ($1::text IS NULL OR x.user_email = $1)) AS since
       FROM named ORDER BY n DESC, last_at DESC LIMIT 10`,
      args,
    ),
    sql.query(
      `SELECT (count(*) FILTER (WHERE jsonb_array_length(pieces) = 0))::int AS n, (count(*) FILTER (WHERE dealt_at IS NULL))::int AS open
       FROM ${TABLES.runs} WHERE status <> 'ok' AND created_at >= ${SINCE} AND ${mine}`,
      args,
    ),
    sql.query(`SELECT * FROM ${TABLES.runs} WHERE created_at >= ${SINCE} AND ${mine} ORDER BY created_at DESC LIMIT 15`, args),
    sql.query(
      `SELECT count(*)::int AS n, (count(*) FILTER (WHERE status = 'ok'))::int AS ok FROM ${TABLES.runs}
       WHERE created_at < ${SINCE} AND created_at >= ${SINCE} - interval '${PERIOD_DAYS} days' AND ${mine}`,
      args,
    ),
  ])) as Row[][];

  const troubleNames = await pieceNames(trouble.map((r) => String(r.piece)), viewer);
  const today = new Date();
  const days = Array.from({ length: PERIOD_DAYS }, (_, i) => {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - (PERIOD_DAYS - 1 - i)));
    return d.toISOString().slice(0, 10);
  });
  type PerHarness = Stats["perHarness"][number];
  const bySlug = new Map<string, PerHarness>();
  const rowFor = (slug: string): PerHarness => {
    let row = bySlug.get(slug);
    if (!row) {
      row = { slug, byDay: days.map(noVerdicts), total: noVerdicts(), people: [] };
      bySlug.set(slug, row);
    }
    return row;
  };
  const total = noVerdicts();
  for (const r of byDay) {
    const at = days.indexOf(String(r.day));
    if (at === -1 || !isStatus(r.status)) continue;
    const row = rowFor(String(r.slug));
    row.byDay[at][r.status] += Number(r.n);
    row.total[r.status] += Number(r.n);
    total[r.status] += Number(r.n);
  }
  const everyone = new Map<string, { name: string; runs: number }>();
  for (const r of byPerson) {
    const row = bySlug.get(String(r.slug));
    if (!row) continue;
    row.people.push({ name: String(r.name), runs: Number(r.n) });
    const person = everyone.get(String(r.user_email)) ?? { name: String(r.name), runs: 0 };
    person.runs += Number(r.n);
    everyone.set(String(r.user_email), person);
  }
  const mostFirst = (a: { runs: number; name: string }, b: { runs: number; name: string }) => b.runs - a.runs || a.name.localeCompare(b.name);
  const perHarness = [...bySlug.values()].sort((a, b) => verdictTotal(b.total) - verdictTotal(a.total));
  for (const row of perHarness) row.people.sort(mostFirst);
  return {
    days,
    perHarness,
    total,
    before: { runs: Number(before[0]?.n ?? 0), ok: Number(before[0]?.ok ?? 0) },
    people: [...everyone.values()].sort(mostFirst),
    merged: Number(merged[0]?.n ?? 0),
    trouble: trouble.map((r) => ({
      slug: String(r.slug),
      piece: troubleNames.get(String(r.piece)) ?? String(r.piece),
      id: String(r.piece),
      runs: Number(r.n),
      open: Number(r.open ?? 0),
      lastAt: new Date(r.last_at as string).toISOString(),
      lastBy: String(r.last_by ?? ""),
      lastNote: String(r.last_note ?? ""),
      lastStatus: isStatus(r.last_status) ? r.last_status : "flagged",
      lastVersion: Number(r.last_version),
      since: Number(r.since ?? 0),
    })),
    unnamedTrouble: Number(unnamed[0]?.n ?? 0),
    open: Number(unnamed[0]?.open ?? 0),
    recent: await named(recent.map(toRun), viewer),
  };
}

/** How a harness did on one model, in one agent: the reports, counted by verdict. */
export type ModelResult = { model: string | null; agent: string | null; counts: Verdicts; lastAt: string; lastVersion: number };

/**
 * Every reported run of a harness, by the model the agent said it ran on and the agent that reported it, the most
 * used first. It is how a team sees where a harness works: on which models, in which agents. A run that did not say
 * its model counts under "not said". Only what agents reported: nobody checks a model's name or a verdict.
 */
export async function resultsByModel(slug: string): Promise<ModelResult[]> {
  if (!SLUG.test(slug)) return [];
  await ensureReady();
  const rows = (await db().query(
    `SELECT model, agent, status, count(*)::int AS n, max(created_at) AS last_at, (array_agg(version ORDER BY created_at DESC))[1] AS last_version
     FROM ${TABLES.runs} WHERE slug = $1 GROUP BY model, agent, status`,
    [slug],
  )) as Row[];
  const byKey = new Map<string, ModelResult>();
  for (const r of rows) {
    if (!isStatus(r.status)) continue;
    const model = r.model ? String(r.model) : null;
    const agent = r.agent ? String(r.agent) : null;
    const key = JSON.stringify([model, agent]);
    const at = new Date(r.last_at as string).toISOString();
    const row = byKey.get(key) ?? { model, agent, counts: noVerdicts(), lastAt: at, lastVersion: Number(r.last_version) };
    row.counts[r.status] += Number(r.n);
    if (at > row.lastAt) {
      row.lastAt = at;
      row.lastVersion = Number(r.last_version);
    }
    byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) => verdictTotal(b.counts) - verdictTotal(a.counts) || b.lastAt.localeCompare(a.lastAt));
}
