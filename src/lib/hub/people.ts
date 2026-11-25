import { db, TABLES, type Row } from "./db";
import { ensureReady } from "./setup";
import { isAllowed, normalizeEmail, type Member } from "./members";

/**
 * Who is on the team.
 *
 * Two sources. The addresses in the Hub's configuration (ALLOWED_EMAILS, and
 * ALLOWED_DOMAINS if set) are always let in, and they are the admins: the
 * people who can add others. Everyone an admin adds here is let in too, with
 * no redeploy. Either way a person is their primary, verified email.
 */

// The list is asked for on every sign-in check, so it is kept for a short
// while per server instance. Removing someone takes effect within this time.
const TTL_MS = 30_000;
let cache: { at: number; people: Map<string, string> } | undefined;

/** People added from the Hub: address to name. */
export async function invited(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.people;
  await ensureReady();
  const rows = (await db().query(`SELECT email, name FROM ${TABLES.members}`)) as Row[];
  cache = { at: Date.now(), people: new Map(rows.map((r) => [String(r.email), String(r.name)])) };
  return cache.people;
}

/** On the team: in the configuration, or added from the Hub. The database is only asked when the configuration says no. */
export async function isMember(email: string): Promise<boolean> {
  const address = normalizeEmail(email);
  return isAllowed(address) || (await invited()).has(address);
}

/** Admins are the people named in the Hub's configuration. */
export function isAdmin(member: Member): boolean {
  return isAllowed(member.email);
}

export type Listed = { email: string; name: string; addedBy: string; addedAt: string };

/** The people added from the Hub, newest first. */
export async function addedPeople(): Promise<Listed[]> {
  await ensureReady();
  const rows = (await db().query(`SELECT email, name, added_by_email, added_at FROM ${TABLES.members} ORDER BY added_at DESC`)) as Row[];
  return rows.map((r) => ({
    email: String(r.email),
    name: String(r.name),
    addedBy: String(r.added_by_email),
    addedAt: new Date(r.added_at as string).toISOString(),
  }));
}

export type Done = { ok: boolean; message: string };
const MAX_PEOPLE = 200;

export async function addPerson(admin: Member, rawEmail: string, rawName = ""): Promise<Done> {
  if (!isAdmin(admin)) return { ok: false, message: "Only an admin of this Hub can add people." };
  const email = normalizeEmail(rawEmail);
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) || email.length > 254) return { ok: false, message: "Give a full email address." };
  if (isAllowed(email)) return { ok: false, message: `${email} is already let in by the Hub's configuration.` };
  const name = rawName.replace(/\s+/g, " ").trim().slice(0, 80);
  await ensureReady();
  const rows = (await db().query(
    `INSERT INTO ${TABLES.members} (email, name, added_by_email)
     SELECT $1, $2, $3 WHERE (SELECT count(*) FROM ${TABLES.members}) < $4::int
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING email`,
    [email, name, admin.email, MAX_PEOPLE],
  )) as Row[];
  cache = undefined;
  if (rows.length === 0) return { ok: false, message: `The Hub holds at most ${MAX_PEOPLE} added people.` };
  return { ok: true, message: `${email} can now sign in with that Google account.` };
}

export async function removePerson(admin: Member, rawEmail: string): Promise<Done> {
  if (!isAdmin(admin)) return { ok: false, message: "Only an admin of this Hub can remove people." };
  const email = normalizeEmail(rawEmail);
  await ensureReady();
  await db().query(`DELETE FROM ${TABLES.members} WHERE email = $1`, [email]);
  cache = undefined;
  return { ok: true, message: `${email} is no longer let in. What they saved stays, owned by them.` };
}
