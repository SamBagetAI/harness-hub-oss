import { builtInHarnesses } from "./built-in";
import { describeChanges, type Fields } from "./diff";
import type { HarnessView } from "./types";
import { AGENTS, contentOf, db, HARNESSES, MEMBERS, ROLES, type Row, RUNS, type Sql, SUGGESTIONS, VALUES, VERSIONS } from "./db";
import { insertVersion, insertVersionOrFail, lostRace, pieceStatements, planPieces } from "./harnesses";
import { LATEST, NOTES_ONLY, toView, VIEW } from "./read";

/**
 * Getting a Hub's database ready: the tables, the built-in harnesses a Hub starts with, and one-time moves of
 * data saved before a change in how it is stored. Each runs once per server start, before the first read or save.
 */

/** When versions got a goal of their own. Older versions of a built-in harness take theirs from its definition. */
const GOAL_ADDED = "2026-11-12T14:00:00Z";

let ready: Promise<void> | undefined;

/** Creates the tables on first use, and adds the built-in harnesses a Hub starts with. */
export function ensureReady(): Promise<void> {
  ready ??= setUp()
    .catch((error) => {
      // Two instances starting together on a database with no tables yet can
      // trip over each other's CREATE TABLE. A second try finds them in place.
      if (!["23505", "42P07"].includes((error as { code?: string } | null)?.code ?? "")) throw error;
      return setUp();
    })
    .catch((error) => {
      ready = undefined; // try again on the next request
      throw error;
    });
  return ready;
}

/** Columns added after the first release. A database made before one of them gets it once. */
const ADDED_COLUMNS: [table: string, column: string, type: string][] = [
  // What a version changed against the one before, in words: part "Run log", variables.
  [VERSIONS, "changes", "text"],
  // What the agent is for, in one sentence: the outcome, not the steps.
  [VERSIONS, "goal", "text NOT NULL DEFAULT ''"],
  // A harness, or a shared piece: skill, tool, hook or memory.
  [HARNESSES, "kind", "text NOT NULL DEFAULT 'harness'"],
  // The label of the variable a saved value was given for: a variable that now means something else does not get it.
  [VALUES, "label", "text"],
  // Team (everyone sees it) or private (its owner and the people who can change it). Everything from before is team.
  [HARNESSES, "visibility", "text NOT NULL DEFAULT 'team'"],
  // Set aside by its owner. Nothing is ever deleted.
  [HARNESSES, "archived_at", "timestamptz"],
  // For a piece made from a part of a harness: that harness. Whoever can change it can change the piece.
  [HARNESSES, "made_for", "text"],
  // Who dealt with a run that was not fine, when, and what they did about it. Empty while the run is still open.
  [RUNS, "dealt_by_email", "text"],
  [RUNS, "dealt_by_name", "text"],
  [RUNS, "dealt_at", "timestamptz"],
  [RUNS, "dealt_note", "text"],
  // Who said it was not dealt with after all. The mark they undid stays in the columns above, so no one's note is lost.
  [RUNS, "reopened_by_email", "text"],
  [RUNS, "reopened_by_name", "text"],
  [RUNS, "reopened_at", "timestamptz"],
  // Which model the agent said it ran on, and which agent (the app that signed in) it was: how a harness does on each.
  [RUNS, "model", "text"],
  [RUNS, "agent", "text"],
];

async function setUp(): Promise<void> {
  const sql = db();
  // Every table, in one round trip. Each statement is safe to run again, and on
  // a database that already has the tables none of them waits for a reader.
  await sql.transaction([
    // Each person's own values for the variables of a harness, for their own runs only (lib/hub/values.ts).
    sql.query(`CREATE TABLE IF NOT EXISTS ${VALUES} (
      email text NOT NULL,
      slug text NOT NULL,
      key text NOT NULL,
      value text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (email, slug, key)
    )`),
    // The agents each person connected, and what each may do: read only, or read and write (lib/hub/agents.ts).
    sql.query(`CREATE TABLE IF NOT EXISTS ${AGENTS} (
      email text NOT NULL,
      client_id text NOT NULL,
      name text NOT NULL,
      access text NOT NULL DEFAULT 'write',
      first_seen timestamptz NOT NULL DEFAULT now(),
      last_seen timestamptz NOT NULL DEFAULT now(),
      changed_at timestamptz,
      PRIMARY KEY (email, client_id)
    )`),
    sql.query(`CREATE TABLE IF NOT EXISTS ${HARNESSES} (
      slug text PRIMARY KEY,
      owner_email text NOT NULL,
      owner_name text NOT NULL,
      copied_from text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`),
    sql.query(`CREATE TABLE IF NOT EXISTS ${VERSIONS} (
      slug text NOT NULL REFERENCES ${HARNESSES} (slug),
      number integer NOT NULL,
      name text NOT NULL,
      description text NOT NULL,
      note text NOT NULL,
      content jsonb NOT NULL,
      saved_by_email text NOT NULL,
      saved_by_name text NOT NULL,
      saved_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (slug, number)
    )`),
    sql.query(`CREATE TABLE IF NOT EXISTS ${SUGGESTIONS} (
      number serial PRIMARY KEY,
      slug text NOT NULL REFERENCES ${HARNESSES} (slug),
      base_version integer NOT NULL,
      title text NOT NULL,
      proposed jsonb NOT NULL,
      author_email text NOT NULL,
      author_name text NOT NULL,
      status text NOT NULL DEFAULT 'open',
      comments jsonb NOT NULL DEFAULT '[]'::jsonb,
      merged_version integer,
      decided_by_email text,
      decided_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`),
    // Editors: people the owner lets change an item. Everyone else on the team reads, runs, copies and suggests.
    sql.query(`CREATE TABLE IF NOT EXISTS ${ROLES} (
      slug text NOT NULL REFERENCES ${HARNESSES} (slug),
      email text NOT NULL,
      name text NOT NULL,
      added_by_email text NOT NULL,
      added_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (slug, email)
    )`),
    // Runs, as the agents that did them reported them.
    sql.query(`CREATE TABLE IF NOT EXISTS ${RUNS} (
      id serial PRIMARY KEY,
      slug text NOT NULL REFERENCES ${HARNESSES} (slug),
      version integer NOT NULL,
      user_email text NOT NULL,
      user_name text NOT NULL,
      status text NOT NULL,
      note text NOT NULL DEFAULT '',
      pieces jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`),
    // People let in from the Hub itself, on top of the addresses in its configuration.
    sql.query(`CREATE TABLE IF NOT EXISTS ${MEMBERS} (
      email text PRIMARY KEY,
      name text NOT NULL DEFAULT '',
      added_by_email text NOT NULL,
      added_at timestamptz NOT NULL DEFAULT now()
    )`),
  ]);
  // ALTER TABLE and CREATE INDEX lock their table even when there is nothing
  // to do, and several of them in one transaction can deadlock with a page
  // that reads both tables. So a column or an index is made only when it is
  // missing, one statement at a time. One query says what is there.
  const RUNS_INDEX = `${RUNS}_by_slug`;
  const there = new Set(
    (
      (await sql.query(
        `SELECT table_name || '.' || column_name AS name FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = ANY($1::text[])
         UNION ALL
         SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname = $2`,
        [[HARNESSES, VERSIONS, RUNS], RUNS_INDEX],
      )) as Row[]
    ).map((r) => String(r.name)),
  );
  for (const [table, column, type] of ADDED_COLUMNS) {
    if (!there.has(`${table}.${column}`)) await sql.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
  }
  if (!there.has(RUNS_INDEX)) await sql.query(`CREATE INDEX IF NOT EXISTS ${RUNS_INDEX} ON ${RUNS} (slug, created_at DESC)`);
  // Saved values from before they kept their variable's label get it once, from the harness as it is now. One whose
  // variable is gone keeps none, and is not used again.
  await sql.query(
    `UPDATE ${VALUES} vv SET label = var->>'label'
     FROM ${VERSIONS} v, jsonb_array_elements(CASE WHEN jsonb_typeof(v.content->'variables') = 'array' THEN v.content->'variables' ELSE '[]'::jsonb END) var
     WHERE vv.label IS NULL AND v.slug = vv.slug AND v.number = (SELECT max(number) FROM ${VERSIONS} WHERE slug = vv.slug) AND var->>'key' = vv.key`,
  );
  // Each built-in harness is added once, as version 1, if its slug is not there yet.
  // ON CONFLICT makes two instances starting together harmless.
  const builtIns = builtInHarnesses();
  const slugs = builtIns.map((b) => b.slug);
  const have = new Set(
    ((await sql.query(`SELECT slug FROM ${HARNESSES} WHERE slug = ANY($1::text[])`, [slugs])) as Row[]).map((r) => String(r.slug)),
  );
  for (const b of builtIns) {
    if (have.has(b.slug)) continue;
    // A Hub starts with its harnesses already built from pieces: one per part, made for that harness.
    // Two instances starting together: the second fails on the slug and setUp is run again, which finds it done.
    const fields: Fields = { kind: "harness", name: b.name, goal: b.goal, description: b.description, content: contentOf(b.content) };
    const plan = await planPieces(b.slug, fields);
    const built = typeof plan === "string" ? { fields, planned: [] } : plan;
    await sql.transaction([
      sql.query(`INSERT INTO ${HARNESSES} (slug, owner_email, owner_name) VALUES ($1, $2, $3)`, [b.slug, b.owner.email, b.owner.name]),
      ...pieceStatements(sql, b.slug, b.owner, b.owner, built.planned),
      sql.query(
        `INSERT INTO ${VERSIONS} (slug, number, name, goal, description, note, content, saved_by_email, saved_by_name)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7, $8)`,
        [b.slug, b.name, b.goal, b.description, b.note, JSON.stringify(built.fields.content), b.owner.email, b.owner.name],
      ),
    ]);
  }
  // A built-in harness saved before goals had their own field states its goal
  // in its prompt. That sentence fills the new field once, for the versions
  // (and open suggestions) that predate it; anything saved since is left alone.
  for (const b of builtIns) {
    if (!have.has(b.slug) || !b.goal) continue;
    // Only the harness the Hub itself seeded: someone else's harness at this slug is left alone.
    const seeded = `EXISTS (SELECT 1 FROM ${HARNESSES} h WHERE h.slug = $1 AND h.owner_email = $4)`;
    await sql.query(`UPDATE ${VERSIONS} SET goal = $2 WHERE slug = $1 AND goal = '' AND saved_at < $3::timestamptz AND ${seeded}`, [
      b.slug,
      b.goal,
      GOAL_ADDED,
      b.owner.email,
    ]);
    await sql.query(
      `UPDATE ${SUGGESTIONS} SET proposed = jsonb_set(proposed, '{goal}', to_jsonb($2::text))
       WHERE slug = $1 AND NOT (proposed ? 'goal') AND created_at < $3::timestamptz AND ${seeded}`,
      [b.slug, b.goal, GOAL_ADDED, b.owner.email],
    );
  }
  await labelOldVersions(sql).catch((error) => console.error(JSON.stringify({ at: "store", why: "labelling old versions failed", message: String(error) })));
  // Two one-time moves for a Hub that predates pieces. Neither may stop the Hub from starting.
  await moveOldTeamMemory().catch((error) => console.error(JSON.stringify({ at: "store", why: "moving old team memory failed", message: String(error) })));
  await convertOldParts().catch((error) => console.error(JSON.stringify({ at: "store", why: "making pieces failed", message: String(error) })));
}

/**
 * A shared memory saved before notes existed was team memory as a whole:
 * anyone could add lines to its text, and it was read as notes. Its lines
 * become its team notes, in a new version, and its text one neutral line.
 * Moving them can only lower what they are trusted for, never raise it.
 */
async function moveOldTeamMemory(): Promise<void> {
  const rows = (await db().query(`${VIEW} WHERE ${LATEST} AND h.kind = 'memory' AND NOT (v.content ? 'notes') LIMIT 25`)) as Row[];
  for (const piece of rows.map(toView)) {
    const next: Fields = { ...piece, goal: "", content: { ...piece.content, prompt: "Notes that runs leave for the team.", notes: piece.content.prompt } };
    await insertVersion(piece.slug, next, "Its lines are now team notes, kept apart from its text.", piece.owner, NOTES_ONLY, piece.latest);
  }
}

/** What is recorded as the change of the one version in which a harness's parts became pieces. The Versions page reads it. */
export const PARTS_BECAME_PIECES = "parts became pieces";

/**
 * Harnesses saved before every part was a piece hold their parts' text inside
 * them. Each gets its pieces once: one per part, made for that harness and
 * owned by its owner, and one new version that links them. No text changes.
 *
 * So each piece is dated like its own text: the oldest version, walking back
 * from the latest, in which that part already said what it says. Nobody is
 * then told that a piece changed when it only moved. And each is signed by
 * the harness's owner: before pieces, everything in a harness counted as its
 * owner's text, whoever had saved the last version.
 * A harness that cannot be converted is left as it is and logged.
 */
export async function convertOldParts(): Promise<void> {
  const rows = (await db().query(
    `${VIEW} WHERE ${LATEST} AND h.kind = 'harness' AND h.archived_at IS NULL
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v.content->'parts') = 'array' THEN v.content->'parts' ELSE '[]'::jsonb END) part
         WHERE NOT (part ? 'piece') AND btrim(coalesce(part->>'body', '')) <> ''
       )
     LIMIT 25`,
  )) as Row[];
  for (const h of rows.map(toView)) {
    try {
      const plan = await planPieces(h.slug, h, h);
      if (typeof plan === "string" || plan.planned.length === 0) continue;
      const dates = await textDates(h);
      const sql = db();
      await sql.transaction([
        ...pieceStatements(sql, h.slug, h.owner, h.owner, plan.planned.map((p) => ({ ...p, at: dates.get(p.name) ?? h.savedAt })), h.visibility),
        insertVersionOrFail(h.slug, plan.fields, "Its parts became pieces of their own. No text changed.", h.owner, PARTS_BECAME_PIECES, h.latest),
      ]);
    } catch (error) {
      // Another instance converting the same harness at the same moment is not a failure.
      if (!lostRace(error)) console.error(JSON.stringify({ at: "store", why: "making pieces failed", slug: h.slug, message: String(error) }));
    }
  }
}

/**
 * When the text of each part of a harness from before pieces got to be what
 * it is: the date of the oldest version, walking back from the latest, in
 * which the part of that name already had this text.
 */
async function textDates(h: HarnessView): Promise<Map<string, string>> {
  const rows = (await db().query(`SELECT saved_at, content FROM ${VERSIONS} WHERE slug = $1 AND number <= $2::int ORDER BY number DESC LIMIT 200`, [h.slug, h.version])) as Row[];
  const dates = new Map<string, string>();
  for (const part of h.content.parts) {
    if (part.piece) continue;
    for (const r of rows) {
      const then = contentOf(r.content).parts.find((p) => !p.piece && p.name === part.name);
      if (!then || then.body !== part.body) break;
      dates.set(part.name, new Date(r.saved_at as string).toISOString());
    }
  }
  return dates;
}

/**
 * Versions saved before the Hub recorded what each one changed get that line
 * once, worked out from their text. After that this finds nothing to do.
 */
async function labelOldVersions(sql: Sql): Promise<void> {
  const rows = (await sql.query(
    `SELECT v.slug, v.number, v.name, v.goal, v.description, v.content,
            p.name AS p_name, p.goal AS p_goal, p.description AS p_description, p.content AS p_content
     FROM ${VERSIONS} v JOIN ${VERSIONS} p ON p.slug = v.slug AND p.number = v.number - 1
     WHERE v.changes IS NULL LIMIT 50`,
  )) as Row[];
  for (const r of rows) {
    const before = { name: String(r.p_name), goal: String(r.p_goal ?? ""), description: String(r.p_description), content: contentOf(r.p_content) };
    const after = { name: String(r.name), goal: String(r.goal ?? ""), description: String(r.description), content: contentOf(r.content) };
    await sql.query(`UPDATE ${VERSIONS} SET changes = $3 WHERE slug = $1 AND number = $2 AND changes IS NULL`, [
      r.slug,
      r.number,
      describeChanges(before, after).join(", ") || "nothing",
    ]);
  }
}
