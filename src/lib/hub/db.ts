import { neon } from "@neondatabase/serverless";
import type { HarnessContent } from "./types";

/**
 * The database: its tables and the connection. Every module that stores something asks here for both.
 */

// Local development and the check script use their own tables (prefix "dev_"),
// in the same database, so tests never touch what people saved.
const PREFIX = /^[a-z_]{0,12}$/.test(process.env.HUB_TABLE_PREFIX ?? "") ? (process.env.HUB_TABLE_PREFIX ?? "") : "";
export const HARNESSES = `${PREFIX}harnesses`;
export const VERSIONS = `${PREFIX}versions`;
export const SUGGESTIONS = `${PREFIX}suggestions`;
export const ROLES = `${PREFIX}roles`;
export const RUNS = `${PREFIX}runs`;
export const MEMBERS = `${PREFIX}members`;
export const AGENTS = `${PREFIX}agents`;
export const VALUES = `${PREFIX}var_values`;

/**
 * The rule of lib/hub/visibility.ts as SQL, for queries that list rows of items: whether the person whose address is
 * the parameter `email` sees the item in the table alias `h`. Its owner and editors do, and for a piece made for a
 * harness, whoever can change that harness.
 */
export const seesSql = (h: string, email: string) =>
  `(${h}.visibility <> 'private' OR ${h}.owner_email = ${email}
    OR EXISTS (SELECT 1 FROM ${ROLES} sx WHERE sx.slug = ${h}.slug AND sx.email = ${email})
    OR EXISTS (SELECT 1 FROM ${HARNESSES} sm WHERE sm.slug = ${h}.made_for AND sm.owner_email = ${email})
    OR EXISTS (SELECT 1 FROM ${ROLES} sx WHERE sx.slug = ${h}.made_for AND sx.email = ${email}))`;

/** Table names, for the modules that keep runs, members, agents and values next to the store. */
export const TABLES = { harnesses: HARNESSES, versions: VERSIONS, suggestions: SUGGESTIONS, roles: ROLES, runs: RUNS, members: MEMBERS, agents: AGENTS, values: VALUES };

export type Row = Record<string, unknown>;
export type Sql = ReturnType<typeof neon>;

export function db(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

/** Stored content, with anything missing filled in. */
export function contentOf(raw: unknown): HarnessContent {
  const content = (raw ?? {}) as Partial<HarnessContent>;
  return {
    prompt: content.prompt ?? "",
    variables: content.variables ?? [],
    parts: content.parts ?? [],
    ...(content.when ? { when: content.when } : {}),
    ...(content.icon ? { icon: content.icon } : {}),
    ...(typeof content.schedule === "string" && content.schedule ? { schedule: content.schedule } : {}),
    ...(typeof content.testedOn === "string" && content.testedOn ? { testedOn: content.testedOn } : {}),
    // A memory piece says whether runs may leave team notes in it: null is no, a text is yes.
    // Left out, it was saved before notes existed, and stays left out so that this can be told.
    ...("notes" in content ? { notes: content.notes === null ? null : String(content.notes ?? "") } : {}),
  };
}

/** Numbers that come from a person are checked before they reach the database's integer columns. */
export const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 1_000_000_000;
