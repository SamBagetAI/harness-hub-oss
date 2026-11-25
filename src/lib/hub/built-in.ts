import { allowedEmails, normalizeEmail } from "./members";
import * as inbox from "./routines/morning-inbox-brief";
import type { HarnessContent, Person } from "./types";

/**
 * The harnesses a Hub starts with. Each is written to the database once, as
 * version 1, if its slug is not there yet. From then on it is an ordinary
 * harness that its owner edits.
 */

/**
 * Their owner: BUILT_IN_OWNER_EMAIL if set, else the first allowed address. The
 * name comes from BUILT_IN_OWNER_NAME if set, else from the address itself
 * ("ada@…" gives "Ada"), so the two can never point at different people.
 */
function owner(): Person {
  const email = normalizeEmail(
    process.env.BUILT_IN_OWNER_EMAIL || allowedEmails()[0] || "owner@example.com",
  );
  const fromAddress = email.split("@")[0].split(/[._-]/)[0];
  const name =
    process.env.BUILT_IN_OWNER_NAME?.trim() ||
    fromAddress.charAt(0).toUpperCase() + fromAddress.slice(1);
  return { email, name };
}

export type BuiltIn = {
  slug: string;
  name: string;
  /** What the agent is for: the outcome, not the steps. */
  goal: string;
  /** What it does. */
  description: string;
  owner: Person;
  note: string;
  content: HarnessContent;
};

export function builtInHarnesses(): BuiltIn[] {
  return [
    {
      slug: "morning-inbox-brief",
      name: "Morning inbox brief",
      goal: inbox.GOAL,
      description: inbox.DESCRIPTION,
      owner: owner(),
      note: "Simple example: one skill, one tool, two hooks, one memory",
      content: { prompt: inbox.PROMPT, variables: inbox.VARIABLES, parts: inbox.PARTS },
    },
  ];
}
