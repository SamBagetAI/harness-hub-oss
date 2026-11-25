import { db, TABLES, type Row } from "./db";
import { LOOKS_SECRET, SECRET } from "./harnesses";
import { findHarness } from "./read";
import { ensureReady } from "./setup";
import type { Member } from "./members";
import { oneLine, SLUG } from "./safe-text";
import type { HarnessView, Variable } from "./types";

/**
 * Each person's own values for the variables of a harness: their handle, their artifact, their time zone. Kept per
 * person and per harness, for that person's runs only: nobody else ever sees them, not the harness's owner either.
 * A load fills them in, so a run asks only for what is still missing. Text only: never a password, token or cookie.
 */

export type SavedValues = Record<string, string>;

/** A value as stored: what the person typed, and the label of the variable they typed it for. */
export type StoredValue = { value: string; label: string | null };

/**
 * The saved values a harness may use now: only for its own variables, and only while each still means what it meant
 * when the value was saved (the same label). A variable that was taken out, or given another meaning under the same
 * name, does not get an old value: the person is asked again.
 */
export function usableValues(stored: Record<string, StoredValue>, variables: Variable[]): SavedValues {
  const out: SavedValues = {};
  for (const v of variables) {
    const s = stored[v.key];
    if (s && s.label === v.label) out[v.key] = s.value;
  }
  return out;
}

async function storedOf(member: Member, slug: string): Promise<Record<string, StoredValue>> {
  if (!SLUG.test(slug)) return {};
  await ensureReady();
  const rows = (await db().query(`SELECT key, value, label FROM ${TABLES.values} WHERE email = $1 AND slug = $2`, [member.email, slug])) as Row[];
  return Object.fromEntries(rows.map((r) => [String(r.key), { value: String(r.value), label: r.label === null || r.label === undefined ? null : String(r.label) }]));
}

/** How long one value may be. A variable holds a label, a handle or a link, not a document. */
const MAX_VALUE = 500;

/** This person's saved values that a harness may use now, by variable key. */
export async function valuesOf(member: Member, h: Pick<HarnessView, "slug" | "content">): Promise<SavedValues> {
  return usableValues(await storedOf(member, h.slug), h.content.variables);
}

/** All of this person's saved values, by harness slug. */
export async function allValuesOf(member: Member): Promise<Map<string, Record<string, StoredValue>>> {
  await ensureReady();
  const rows = (await db().query(`SELECT slug, key, value, label FROM ${TABLES.values} WHERE email = $1`, [member.email])) as Row[];
  const all = new Map<string, Record<string, StoredValue>>();
  for (const r of rows) {
    const label = r.label === null || r.label === undefined ? null : String(r.label);
    all.set(String(r.slug), { ...(all.get(String(r.slug)) ?? {}), [String(r.key)]: { value: String(r.value), label } });
  }
  return all;
}

/**
 * Saves or clears this person's values for a harness they see. Only its declared variables are kept; an empty
 * value clears the one saved. Values from before are kept unless named.
 */
export async function saveValues(member: Member, slug: string, values: Record<string, string | null | undefined>): Promise<{ ok: boolean; message: string; saved?: SavedValues }> {
  const h = await findHarness(member, slug.trim().toLowerCase());
  if (!h || h.kind !== "harness") return { ok: false, message: `There is no harness with the slug ${JSON.stringify(slug)}.` };
  const labels = new Map(h.content.variables.map((v) => [v.key, v.label]));
  const keys = new Set(labels.keys());
  // Clearing is always allowed: a value saved for a variable that was taken out since can still be removed.
  const unknown = Object.entries(values).filter(([k, v]) => !keys.has(k) && (v ?? "").trim() !== "").map(([k]) => k);
  if (unknown.length) {
    return { ok: false, message: `${unknown.map((k) => JSON.stringify(k)).join(", ")} ${unknown.length === 1 ? "is" : "are"} no variable of ${h.slug}. Its variables are: ${[...keys].join(", ") || "none"}. Nothing was saved.` };
  }
  const set: [string, string][] = [];
  const clear: string[] = [];
  for (const [key, raw] of Object.entries(values)) {
    const value = oneLine(raw ?? "", MAX_VALUE + 1);
    if (value.length > MAX_VALUE) return { ok: false, message: `The value of ${key} is longer than ${MAX_VALUE} characters. Nothing was saved.` };
    if (value) set.push([key, value]);
    else clear.push(key);
  }
  if (SECRET.test(set.map(([, v]) => v).join("\n"))) return { ok: false, message: LOOKS_SECRET };
  if (set.length === 0 && clear.length === 0) return { ok: false, message: "Give at least one variable and its value." };
  const sql = db();
  await sql.transaction([
    ...set.map(([key, value]) =>
      sql.query(
        `INSERT INTO ${TABLES.values} (email, slug, key, value, label) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email, slug, key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label, updated_at = now()`,
        [member.email, h.slug, key, value, labels.get(key) ?? null],
      ),
    ),
    ...(clear.length ? [sql.query(`DELETE FROM ${TABLES.values} WHERE email = $1 AND slug = $2 AND key = ANY($3::text[])`, [member.email, h.slug, clear])] : []),
  ]);
  const saved = await valuesOf(member, h);
  const parts = [
    ...(set.length ? [`Saved your value${set.length === 1 ? "" : "s"} for ${set.map(([k]) => k).join(", ")}`] : []),
    ...(clear.length ? [`cleared ${clear.join(", ")}`] : []),
  ];
  return { ok: true, message: `${parts.join("; ")}, for your own runs of ${h.slug}. Nobody else sees them.`, saved };
}
