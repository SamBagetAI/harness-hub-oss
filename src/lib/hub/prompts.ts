import { oneLine } from "./safe-text";
import type { HarnessView } from "./types";

/**
 * Harnesses as MCP prompts. An agent that shows a connector's prompts (Claude
 * does, in its menu of what a connector offers) lists each harness the person
 * sees, with a field for each of its variables. Picking one starts a run.
 *
 * The prompt only asks the agent to load the harness with harness_hub_get_harness.
 * It never carries the harness's own text: a prompt's message is sent as the
 * person's own words, and a teammate's piece or the team's notes must never
 * be read as that. The text arrives through the tool, inside its tagged
 * lines, with the run rules ahead of it.
 */

export type PromptArgument = { name: string; description: string; required: boolean };
export type PromptEntry = { name: string; title: string; description: string; arguments: PromptArgument[] };

/** How many harnesses are offered as prompts. More would crowd the agent's menu. */
export const MAX_PROMPTS = 100;

/**
 * A harness as a prompt: its slug is the prompt's name, its goal its description, its variables its fields. A field
 * the person saved a value for can be left empty: the saved value is used.
 */
export function promptOf(h: HarnessView, saved: Record<string, string> = {}): PromptEntry {
  return {
    name: h.slug,
    title: oneLine(h.name, 80),
    description: oneLine(h.goal || h.description || `Run the harness ${h.slug} from Harness Hub.`, 200),
    arguments: h.content.variables.map((v) => ({
      name: v.key,
      description: oneLine(
        saved[v.key] ? `${v.label} (leave empty for your saved value)` : v.default !== undefined && v.default !== "" ? `${v.label} (default: ${v.default})` : v.label,
        300,
      ),
      // A variable with a default, or a saved value, can be left empty.
      required: !saved[v.key] && (v.default === undefined || v.default === ""),
    })),
  };
}

/**
 * The message a picked prompt sends, as the person: run this harness, with the values they typed. Only the
 * harness's own variables are passed on, each on one line and quoted, so a value cannot start a line of its own.
 */
export function promptMessage(h: HarnessView, values: Record<string, string | undefined>): string {
  const given = h.content.variables.flatMap((v) => {
    const value = values[v.key];
    return typeof value === "string" && value.trim() ? [`- ${v.key}: ${JSON.stringify(oneLine(value, 500))}`] : [];
  });
  const missing = h.content.variables.filter((v) => !(values[v.key] ?? "").trim() && (v.default === undefined || v.default === "")).map((v) => v.key);
  return [
    // The slug and the version only: the harness's name is its owner's words, and this message is sent as the person's.
    `Run the harness ${h.slug} from Harness Hub (version ${h.version}): load it with harness_hub_get_harness and follow the run rules at the top of what it returns.`,
    ...(given.length ? ["", "The values I give for its variables:", ...given] : []),
    ...(missing.length ? ["", `Ask me for the ones I left empty: ${missing.join(", ")}.`] : []),
  ].join("\n");
}
