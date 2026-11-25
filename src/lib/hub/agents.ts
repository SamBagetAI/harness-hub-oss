import type { Access } from "./access";
import { db, TABLES, type Row } from "./db";
import { ensureReady } from "./setup";
import type { Member } from "./members";

/**
 * What each agent a person connected may do in the Hub.
 *
 * The sign-in provider cannot put custom scopes in its tokens, so the person
 * decides here, per agent: read only, or read and write. An agent is an OAuth
 * client: the app that signed in on the person's behalf (Claude, Codex, a
 * scheduled run's app). The person changes it on the Connect page, at any
 * time, without signing in again. An agent seen for the first time can read
 * and write, as every connection could before this existed.
 */

export type { Access };

export type Agent = { client: string; name: string; access: Access; firstSeen: string; lastSeen: string };

/** How long a sighting holds before the last-seen day is written again. */
const SEEN_EVERY = "10 minutes";

/** The name the sign-in provider has for an agent, or failing that a short form of its id. */
async function nameOf(client: string): Promise<string> {
  if (client === "local-dev") return "Local test identity";
  try {
    // Loaded only here, so that the store's checks can use this module without the sign-in provider's Next.js code.
    const { clerk } = await import("./clerk");
    const found = await clerk().oauthApplications.list({ nameQuery: client, limit: 5 });
    const app = found.data.find((a) => a.clientId === client);
    if (app?.name) return app.name.slice(0, 120);
  } catch {
    // The name is only a label: an agent is still let in, and shown by its id.
  }
  return `Agent ${client.slice(0, 12)}`;
}

/**
 * Notes that this person's agent called, and says what it may do. The first call of an agent records it with its
 * name; later calls only move its last-seen time, and not on every call.
 */
export async function seen(member: Member, client: string): Promise<Access> {
  await ensureReady();
  const sql = db();
  const rows = (await sql.query(
    `UPDATE ${TABLES.agents} SET last_seen = CASE WHEN last_seen < now() - interval '${SEEN_EVERY}' THEN now() ELSE last_seen END
     WHERE email = $1 AND client_id = $2 RETURNING access`,
    [member.email, client],
  )) as Row[];
  if (rows[0]) return rows[0].access === "read" ? "read" : "write";
  const name = await nameOf(client);
  const added = (await sql.query(
    `INSERT INTO ${TABLES.agents} (email, client_id, name) VALUES ($1, $2, $3)
     ON CONFLICT (email, client_id) DO UPDATE SET last_seen = now() RETURNING access`,
    [member.email, client, name],
  )) as Row[];
  return added[0]?.access === "read" ? "read" : "write";
}

/** The name of one of this person's agents, as listed on their Connect page. */
export async function agentName(member: Member, client: string): Promise<string | null> {
  await ensureReady();
  const rows = (await db().query(`SELECT name FROM ${TABLES.agents} WHERE email = $1 AND client_id = $2`, [member.email, client])) as Row[];
  return rows[0] ? String(rows[0].name) : null;
}

/** The agents this person has connected, the most recently used first. */
export async function agentsOf(member: Member): Promise<Agent[]> {
  await ensureReady();
  const rows = (await db().query(`SELECT * FROM ${TABLES.agents} WHERE email = $1 ORDER BY last_seen DESC`, [member.email])) as Row[];
  return rows.map((r) => ({
    client: String(r.client_id),
    name: String(r.name),
    access: r.access === "read" ? "read" : "write",
    firstSeen: new Date(r.first_seen as string).toISOString(),
    lastSeen: new Date(r.last_seen as string).toISOString(),
  }));
}

/** Sets what one of this person's own agents may do. Nobody can change someone else's. */
export async function setAccess(member: Member, client: string, access: string): Promise<{ ok: boolean; message: string }> {
  if (access !== "read" && access !== "write") return { ok: false, message: "Choose read only, or read and write." };
  await ensureReady();
  const rows = (await db().query(`UPDATE ${TABLES.agents} SET access = $3, changed_at = now() WHERE email = $1 AND client_id = $2 RETURNING name`, [
    member.email,
    client,
    access,
  ])) as Row[];
  if (!rows[0]) return { ok: false, message: "That agent could not be found. Reload the page." };
  return {
    ok: true,
    message: access === "read" ? `${String(rows[0].name)} can now only read, and report its runs.` : `${String(rows[0].name)} can now read and write.`,
  };
}
