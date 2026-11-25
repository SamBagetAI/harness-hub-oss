import { z } from "zod";
import type { Edit } from "@/lib/hub/harnesses";

/**
 * What each tool of the connector takes, as the agent sends it, and how a save or a suggestion is turned into an
 * edit for the store. The schemas are what an agent reads about each argument.
 */

const Slug = z.string().min(1).max(80);
const PieceKind = z.enum(["skill", "tool", "hook", "memory"]);
const When = z.enum(["start", "before_tool", "after_tool", "end"]);
const Icon = z.enum(["browser", "code", "send", "connector"]);
// On a part or a piece that exists already, "none" takes the value away.
const WhenOrNone = z.enum(["start", "before_tool", "after_tool", "end", "none"]);
const IconOrNone = z.enum(["browser", "code", "send", "connector", "none"]);
const orNull = <T extends string>(value: T | "none" | undefined): T | null | undefined => (value === "none" ? null : value);

export const SearchInput = z.object({
  query: z
    .string()
    .max(200)
    .optional()
    .describe('Words from what the person asked for, for example "morning inbox brief", or a slug. Put a teammate\'s name in owner, not here. Leave out to list everything of that kind.'),
  owner: z
    .string()
    .max(100)
    .optional()
    .describe('Name or email of the teammate who saved it, if the person named one. Use "me" when they ask for their own.'),
  kind: z
    .enum(["harness", "skill", "tool", "hook", "memory", "piece"])
    .optional()
    .describe('What to look for. Leave out for harnesses. A kind, or "piece" for any of them, looks among the pieces instead: the skills, tools, hooks and memories harnesses are built from.'),
});

export const GetHarnessInput = z.object({
  slug: Slug.describe('The slug of the harness, as returned by harness_hub_search, for example "morning-inbox-brief".'),
  version: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("A specific version number. Leave out to get the latest version, which is what a normal run uses."),
});

export const GetPieceInput = z.object({
  slug: Slug.describe('The slug of the piece, as returned by harness_hub_search with a kind or shown in a harness, for example "morning-inbox-brief-inbox-notes".'),
  version: z.number().int().positive().optional().describe("A specific version number. Leave out to get the latest version, which is what every harness that uses the piece gets."),
});

const PartInput = z.object({
  kind: PieceKind.optional().describe("For a new piece: what it is. Not needed with piece: a piece has its kind already."),
  piece: Slug.optional().describe("To use a piece that exists already: its slug. Nothing else is needed. The harness then always gets that piece's latest version."),
  name: z.string().max(80).optional().describe("For a new piece: its name. Not needed with piece."),
  summary: z.string().max(200).optional().describe("For a new piece: one line saying what it is for."),
  body: z
    .string()
    .optional()
    .describe("For a new piece: its full text, word for word. The Hub saves it as a piece made for this harness. Leave out with piece. Text sent for a part that is already a piece counts as a change to that piece, and then needs piece_version."),
  piece_version: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Only with text for a part that is already a piece: the version of the piece that text was written on, as shown in the part's heading."),
  when: When.optional().describe("New hooks only: when the rule applies."),
  icon: Icon.optional().describe("New tools only."),
});

const EditFields = {
  name: z.string().max(80).optional(),
  goal: z
    .string()
    .max(200)
    .optional()
    .describe("Harnesses only. One sentence on what the agent is for: the outcome for the person, not the steps it takes. Shown under the name."),
  description: z.string().max(300).optional().describe("What it does, in one or two short sentences. For a piece: its one-line summary."),
  prompt: z.string().optional().describe("The prompt, in full. For a piece: its text, in full. Leave out to keep the current one."),
  variables: z
    .array(
      z.object({
        key: z.string().max(40),
        label: z.string().max(200),
        default: z.string().max(200).optional().describe("Leave out for anything personal, such as a handle or a voice: it is then required."),
      }),
    )
    .optional()
    .describe("Replaces all variables. Leave out to keep the current ones. The text refers to a variable by its key in braces, like {handle}."),
  parts: z
    .array(PartInput)
    .optional()
    .describe("Harnesses only. Replaces the WHOLE list of parts, in this order: each one a piece named by its slug alone, or text that becomes a new piece. Send a part that stays as it is by its slug alone. To change, add or remove a single part use update_part, add_part or remove_part instead."),
  update_part: z
    .object({
      name: z.string().describe("Which part: its name, or the slug of its piece."),
      body: z.string().optional().describe("Its new full text. Saved as a new version of the part's piece."),
      summary: z.string().max(200).optional().describe("Its new one-line summary. Saved on the piece."),
      new_name: z.string().max(80).optional().describe("Its new name. Saved on the piece: a part goes by its piece's name."),
      when: WhenOrNone.optional().describe('Hooks only. "none" takes the timing away.'),
      icon: IconOrNone.optional().describe('Tools only. "none" takes the icon away.'),
      piece_version: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("The version of the part's piece you read and wrote this change on, as shown in its heading. Give it with any new name or text: a change written on an older version of the piece is refused instead of undoing someone's newer one. Required when based_on_version is given."),
      piece: Slug.optional().describe("Puts another piece in this part's place, by its slug. Send it alone, with no new name or text."),
      own_copy: z
        .boolean()
        .optional()
        .describe("true gives this harness its own copy of the part's piece, with whatever else is sent here as changes to that copy. The original piece stays as it is. Use it to change a teammate's piece only in this harness."),
    })
    .optional()
    .describe("Harnesses only. Changes one part and keeps every other part as it is."),
  add_part: PartInput.optional().describe("Harnesses only. Adds one part and keeps the others."),
  remove_part: z.string().max(80).optional().describe("Harnesses only. One part to take out, by its name or the slug of its piece. The others stay, and the piece itself is kept."),
  when: WhenOrNone.optional().describe('Hook pieces only: when the rule applies. "none" takes it away.'),
  schedule: z
    .string()
    .max(200)
    .optional()
    .describe('Harnesses only: when it is meant to run, in one line, for example "At 06:44, Sunday through Thursday". An empty text takes it away. Harness Hub runs nothing: a person\'s agent sets up the schedule in its own scheduler when they ask.'),
  tested_on: z
    .string()
    .max(200)
    .optional()
    .describe('Harnesses only: the models and agents it works well on, in its owner\'s words, in one line, for example "Opus 5.5 in Claude; GPT-5 in Codex". An empty text takes it away. The runs reported by model are shown next to it.'),
  icon: IconOrNone.optional().describe('Tool pieces only. "none" takes it away.'),
  based_on_version: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("The version you loaded and wrote this change on. Give it whenever you loaded it earlier in the conversation: a save on an older version is refused instead of undoing newer changes. For a harness it covers the harness itself, not its pieces: each piece has versions of its own (piece_version)."),
};

export const SaveInput = z.object({
  slug: Slug.describe('Short id in lower-case letters, digits and hyphens, for example "morning-inbox-brief". An existing slug gets a new version; a new slug creates it. Harnesses and pieces share one set of slugs: when creating, check with harness_hub_search that the slug is not taken, once with no kind and once with kind "piece".'),
  note: z.string().min(1).max(200).describe("One line on what changed in this version."),
  kind: z
    .enum(["harness", "skill", "tool", "hook", "memory"])
    .optional()
    .describe("Only when creating. Leave out for a harness. A kind creates a piece by itself: any harness can then use it by its slug."),
  visibility: z
    .enum(["private", "team"])
    .optional()
    .describe('Who sees it. "private": only its owner and its editors. "team": everyone on the Hub. A new item is private unless this says team. On an existing item only its owner can change it: a team harness uses only team pieces, so sharing a harness shares the pieces made for it.'),
  ...EditFields,
  team_notes: z
    .enum(["on", "off", "empty"])
    .optional()
    .describe('Memory pieces only. "on" lets runs leave team notes in it with harness_hub_append_memory: the lines it had before come back. "off" stops that and puts the lines aside. "empty" keeps it taking notes and starts again with none; the old lines stay in its earlier versions.'),
  copy_of: z
    .string()
    .max(80)
    .optional()
    .describe("Only when creating a copy that also changes something in the same save: start from the latest version of this one. For a plain copy use harness_hub_copy."),
});

export const SuggestInput = z.object({
  slug: Slug.describe("The slug of the harness or piece to suggest a change to, as returned by harness_hub_search."),
  title: z.string().min(1).max(200).describe("One line saying what the change does and why."),
  ...EditFields,
});

export const CopyInput = z.object({
  slug: Slug.describe("The slug of the harness or piece to copy, as returned by harness_hub_search."),
  new_slug: Slug.describe('The slug of the copy: the person\'s first name, then the original slug, for example "ben-morning-inbox-brief". It must not be taken yet.'),
  new_name: z.string().max(80).optional().describe("The copy's name. Leave out to use the original name followed by the person's first name."),
});

export const HistoryInput = z.object({
  slug: Slug.optional().describe("The slug of the harness or piece, as returned by harness_hub_search. Not needed when you give suggestion."),
  from: z.number().int().positive().optional().describe("The older version to compare from. With no `to`, compares it with the latest version."),
  to: z.number().int().positive().optional().describe("The newer version. With no `from`, compares it with the version before."),
  suggestion: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("The number of a suggestion: shows it in full, with its changes, its comments and whether it can be merged. Numbers run across the whole Hub."),
});

export const ReviewInput = z.object({
  number: z.number().int().positive().describe("The suggestion's number."),
  action: z.enum(["comment", "merge", "close"]),
  comment: z.string().max(2000).optional().describe("The comment. Required for action comment; optional with merge or close."),
});

export const SaveValuesInput = z.object({
  slug: Slug.describe("The slug of the harness."),
  values: z
    .record(z.string().max(40), z.string().max(500))
    .describe("The person's own values, by variable key, as they gave them. An empty value clears the one saved. Values for other keys are refused."),
});

export const ArchiveInput = z.object({
  slug: Slug.describe("The slug of the harness or the piece."),
  archived: z.boolean().describe("true sets it aside; false brings it back."),
});

export const EditorInput = z.object({
  slug: Slug.describe("The slug of the harness or the piece."),
  email: z.string().max(254).describe("The teammate's email address, as the person gave it."),
  name: z.string().max(80).optional().describe("Their name, when the person gave it."),
  add: z.boolean().describe("true lets them change it; false takes that back."),
});

export const MarkRunInput = z.object({
  run: z.number().int().positive().describe("The run's number, as harness_hub_whoami lists it."),
  dealt: z.boolean().optional().describe("Leave out or true to mark it as dealt with; false opens it again."),
  note: z.string().max(200).optional().describe("One line on what the person did about it, in their words. Expected when marking it dealt with."),
});

export const TeamInput = z.object({
  action: z.enum(["add", "remove"]),
  email: z.string().max(254).describe("The email address the person gave."),
  name: z.string().max(80).optional().describe("Their name, when adding and the person gave it."),
});

export const LogRunInput = z.object({
  slug: Slug.describe("The slug of the harness that was run."),
  version: z.number().int().positive().describe("The version of the harness that was loaded for this run, shown at the top of its text."),
  status: z.enum(["ok", "flagged", "failed"]).describe("ok: went as intended. flagged: finished, but something needs a look. failed: could not finish."),
  note: z.string().max(300).optional().describe("One line on what happened. No personal data, no message text, nothing secret."),
  pieces: z.array(z.string().max(80)).max(40).optional().describe("For flagged or failed: the parts that gave trouble, each by the name its heading shows or by its piece's slug."),
  model: z.string().max(80).optional().describe("The model you ran on, as you know it, for example claude-opus-5-5, gpt-5 or gemini-3-pro. It is how the team sees which models a harness works on."),
});

export const AppendMemoryInput = z.object({
  slug: Slug.describe("The slug of the memory piece, as shown on the opening line of its team notes."),
  text: z.string().min(1).max(2000).describe('The line or lines to add at the end. Team notes only: nothing personal, nothing secret. Plain lines: none can start with "=====".'),
});

type EditArgs = z.infer<z.ZodObject<typeof EditFields>> & { team_notes?: "on" | "off" | "empty" };
type PartArgs = z.infer<typeof PartInput>;

/**
 * A part named by its piece's slug takes its kind from the piece, so none has to be sent: the one put here
 * only stands in until the links are settled. A part sent as text with no kind is refused by the store.
 */
const toPart = (p: PartArgs) => ({
  kind: (p.kind ?? (p.piece ? "skill" : "")) as z.infer<typeof PieceKind>,
  name: p.name ?? "",
  summary: p.summary,
  body: p.body ?? "",
  when: p.when,
  icon: p.icon,
  piece: p.piece,
  pieceVersion: p.piece_version,
});

export function toEdit(input: EditArgs): Edit {
  return {
    name: input.name,
    goal: input.goal,
    description: input.description,
    prompt: input.prompt,
    variables: input.variables,
    parts: input.parts?.map(toPart),
    updatePart: input.update_part && {
      name: input.update_part.name,
      body: input.update_part.body,
      summary: input.update_part.summary,
      newName: input.update_part.new_name,
      when: orNull(input.update_part.when),
      icon: orNull(input.update_part.icon),
      piece: input.update_part.piece,
      pieceVersion: input.update_part.piece_version,
      ownCopy: input.update_part.own_copy,
    },
    addPart: input.add_part && toPart(input.add_part),
    removePart: input.remove_part,
    when: orNull(input.when),
    icon: orNull(input.icon),
    schedule: input.schedule === undefined ? undefined : input.schedule.trim() ? input.schedule : null,
    testedOn: input.tested_on === undefined ? undefined : input.tested_on.trim() ? input.tested_on : null,
    teamNotes: input.team_notes === undefined ? undefined : input.team_notes === "empty" ? "empty" : input.team_notes === "on",
  };
}
