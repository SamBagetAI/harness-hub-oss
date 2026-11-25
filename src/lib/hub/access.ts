/**
 * What an agent a person connected may do in the Hub: read only, or read and write. Kept apart from the store, so
 * that the rule can be tested without a database or the sign-in provider. The store is lib/hub/agents.ts.
 */
export type Access = "read" | "write";

/**
 * Whether an agent with this access may use a tool. A read-only agent reads, and still reports its runs: a report
 * changes no harness, and a scheduled run that only reads needs it. Saving the person's values is refused too: a
 * value can point a later run that may write at another place.
 */
export function mayUse(access: Access, tool: { writes: boolean; reportsRun?: boolean }): boolean {
  return access === "write" || !tool.writes || tool.reportsRun === true;
}
