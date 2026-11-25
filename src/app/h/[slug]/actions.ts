"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canEdit, reviewSuggestion, saveHarness, setArchived, setEditor, setVisibility, suggestChange, type Edit } from "@/lib/hub/harnesses";
import { findHarness } from "@/lib/hub/read";
import { slugOf } from "@/lib/hub/slugs";
import type { Member } from "@/lib/hub/members";
import { setAccess } from "@/lib/hub/agents";
import { saveValues } from "@/lib/hub/values";
import { addPerson, removePerson } from "@/lib/hub/people";
import { followUpRun } from "@/lib/hub/runs";
import { session } from "@/lib/hub/session";
import type { ItemKind, Part, Variable } from "@/lib/hub/types";

/** What a form gets back. `href` is a place to go next. */
export type FormState = { ok: boolean; message: string; href?: string };

/*
 * A server action can be called by anyone who can send a POST, so each one
 * works out who is calling here, and never trusts the page that showed the
 * form. Who may change what is decided again in lib/hub/harnesses.ts.
 */

const SIGN_IN: FormState = { ok: false, message: "Sign in with an allowed account first." };
const GONE: FormState = { ok: false, message: "This no longer exists. Reload the page." };
const GARBLED: FormState = { ok: false, message: "That did not come through. Reload the page and try again." };

async function member() {
  const s = await session();
  return s.state === "member" ? s.member : null;
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "");
const opt = (form: FormData, key: string) => str(form, key).trim() || undefined;

/** The version that was on the page when the text was written. */
function shownVersion(form: FormData): number | undefined {
  const shown = Number(form.get("version"));
  return Number.isInteger(shown) && shown > 0 ? shown : undefined;
}

const WHENS = ["start", "before_tool", "after_tool", "end"];
const ICONS = ["browser", "code", "send", "connector"];
const KINDS = ["harness", "skill", "tool", "hook", "memory"];
/**
 * A choice among fixed values. Undefined when the form has no such field, so
 * the current value stays; null when the form set it to nothing ("Not said",
 * "None"), so the value is taken away.
 */
function choice<T extends string>(form: FormData, key: string, among: string[]): T | null | undefined {
  if (!form.has(key)) return undefined;
  return among.includes(str(form, key)) ? (str(form, key) as T) : null;
}
const when = (form: FormData) => choice<NonNullable<Part["when"]>>(form, "when", WHENS);
const icon = (form: FormData) => choice<NonNullable<Part["icon"]>>(form, "icon", ICONS);

/** Saves for someone who may change the item; sends the change to its owner as a suggestion for anyone else. */
async function saveOrSuggest(me: Member, slug: string, note: string, edit: Edit, basedOn?: number, typed = true): Promise<FormState> {
  if (!note.trim()) return { ok: false, message: "Add a line saying what you changed." };
  const current = await findHarness(me, slug);
  if (!current) return GONE;

  if (canEdit(current, me)) {
    const result = await saveHarness(me, { slug: current.slug, note, basedOn, ...edit });
    if (!result.ok) return { ok: false, message: plain(result.message, typed) };
    revalidatePath("/", "layout");
    // A change that landed on one of its pieces leaves the harness at its version: the answer says which piece.
    if (result.pieceOnly) return { ok: true, message: plain(result.note ?? "Saved.") };
    const saved = result.harness.kind === "harness" ? `Saved as version ${result.harness.version}.` : `Saved: this ${result.harness.kind} is now at version ${result.harness.version}.`;
    return { ok: true, message: `${saved}${result.note ? ` ${plain(result.note)}` : ""}` };
  }
  const result = await suggestChange(me, current.slug, note, edit, basedOn);
  if (!result.ok) return { ok: false, message: plain(result.message, typed) };
  revalidatePath("/", "layout");
  // A change to one of a harness's parts goes to that part's piece: the link leads there.
  return {
    ok: true,
    message: `Suggestion #${result.suggestion.number} sent to ${result.owner.name}.`,
    href: `/h/${result.suggestion.slug}/suggestions#s${result.suggestion.number}`,
  };
}

/**
 * The store's answers are written for agents: they say which of the connector's tools to use, and to load a thing
 * again. On a page the first is left out, and the second becomes what a person can do there: the page they are on
 * still shows the older version, and only a reload brings the newer one.
 */
const plain = (message: string, typed = true) =>
  message
    .replace(/ with harness_hub_[a-z_]+/g, "")
    .replace("Open the latest version, then make the change again.", typed ? "Copy what you typed, reload this page, and make the change again." : "Reload this page and try again.")
    .replace("Load it again and retry.", typed ? "Copy what you typed, reload this page, and try again." : "Reload this page and try again.");

/** A part's name for a version's note or a suggestion's title: the name it is read under, or failing that what names it. */
const partLabel = (form: FormData) => (str(form, "label").trim() || str(form, "part")).slice(0, 120);

/**
 * An edit on a prompt, on a piece, or on one part of a harness.
 *
 * "prompt" is the prompt of a harness. "item" is a piece itself: its text
 * with its name, summary and timing, saved on the piece's own slug. "part" is
 * a part seen from its harness: taking it out.
 */
export async function saveEdit(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  // The form says which of them it edits. A part's name is never taken as that: a part may be called "prompt".
  const piece = str(form, "piece");
  if (piece !== "prompt" && piece !== "part" && piece !== "item") return GARBLED;
  const body = str(form, "body");
  const part = str(form, "part");
  let edit: Edit;
  let note = str(form, "note").trim();
  if (piece === "prompt") edit = { prompt: body };
  else if (piece === "item") {
    const name = str(form, "name").trim();
    edit = { prompt: body, ...(name ? { name } : {}), ...(form.has("summary") ? { description: str(form, "summary").trim() } : {}), when: when(form), icon: icon(form) };
  } else if (str(form, "intent") === "remove") {
    edit = { removePart: part };
    // Said as what the change does, so that it reads right as a version's note and as a suggestion's title.
    note ||= `Remove ${partLabel(form)}`.slice(0, 200);
  } else return GARBLED;
  return saveOrSuggest(me, str(form, "slug"), note, edit, shownVersion(form), str(form, "intent") !== "remove");
}

/** Name, goal and description. For a piece: name, summary, and when it applies or its icon. */
export async function saveAbout(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const edit: Edit = { name: str(form, "name"), description: str(form, "description").trim(), when: when(form), icon: icon(form) };
  if (form.has("goal")) edit.goal = str(form, "goal");
  if (form.has("schedule")) edit.schedule = str(form, "schedule").trim() || null;
  if (form.has("tested_on")) edit.testedOn = str(form, "tested_on").trim() || null;
  return saveOrSuggest(me, str(form, "slug"), str(form, "note").trim(), edit, shownVersion(form));
}

/** The whole list of variables, as the editor on the page holds it. */
export async function saveVariables(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  let variables: Variable[];
  try {
    const raw = JSON.parse(str(form, "variables")) as unknown;
    if (!Array.isArray(raw)) return GARBLED;
    variables = raw.map((v) => {
      const row = v as Record<string, unknown>;
      const fallback = String(row.default ?? "").trim();
      return { key: String(row.key ?? "").trim(), label: String(row.label ?? "").trim(), ...(fallback ? { default: fallback } : {}) };
    });
  } catch {
    return GARBLED;
  }
  if (variables.some((v) => !v.key || !v.label)) return { ok: false, message: "Every variable needs a name and a line saying what to ask for." };
  return saveOrSuggest(me, str(form, "slug"), str(form, "note").trim(), { variables }, shownVersion(form));
}

/** A new part: a piece from the library, or text written here, which becomes a piece made for this harness. */
export async function addPart(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const shared = opt(form, "shared");
  const kind = str(form, "kind") as Part["kind"];
  let part: Part;
  let added: string;
  if (shared) {
    const piece = await findHarness(me, shared);
    if (!piece || piece.kind === "harness") return { ok: false, message: "Choose a piece from the list." };
    part = { kind: piece.kind, name: "", body: "", piece: piece.slug };
    added = piece.name;
  } else {
    if (!["skill", "tool", "hook", "memory"].includes(kind)) return GARBLED;
    part = {
      kind,
      name: str(form, "name").trim(),
      summary: opt(form, "summary"),
      body: str(form, "body"),
      when: kind === "hook" ? (when(form) ?? undefined) : undefined,
      icon: kind === "tool" ? (icon(form) ?? undefined) : undefined,
    };
    if (!part.name || !part.body.trim()) return { ok: false, message: "A piece needs a name and its text." };
    added = part.name;
  }
  const note = str(form, "note").trim() || `Add ${added}`.slice(0, 200);
  return saveOrSuggest(me, str(form, "slug"), note, { addPart: part }, shownVersion(form));
}

/**
 * Gives a harness its own copy of a piece it uses: a new piece made for the
 * harness, with the same text, in the original's place. The original stays as
 * it is, for the harnesses that still use it.
 */
export async function ownCopy(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const part = str(form, "part");
  const result = await saveHarness(me, { slug: str(form, "slug"), note: `Its own copy of ${partLabel(form)}`.slice(0, 200), basedOn: shownVersion(form), updatePart: { name: part, ownCopy: true } });
  if (!result.ok) return { ok: false, message: plain(result.message, false) };
  revalidatePath("/", "layout");
  const made = result.made?.[0];
  return { ok: true, message: made ? `This harness now has its own copy: ${made}.` : `Saved as version ${result.harness.version}.` };
}

/** Lets runs leave team notes in a memory, stops that, or empties the notes. Its owner and editors decide. */
export async function teamNotes(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const want = str(form, "on");
  if (want !== "1" && want !== "0" && want !== "empty") return GARBLED;
  const result = await saveHarness(me, {
    slug: str(form, "slug"),
    note: want === "1" ? "Runs can leave team notes here" : want === "0" ? "No more team notes" : "Team notes emptied",
    basedOn: shownVersion(form),
    teamNotes: want === "empty" ? "empty" : want === "1",
  });
  if (!result.ok) return { ok: false, message: plain(result.message, false) };
  revalidatePath("/", "layout");
  if (want === "empty") return { ok: true, message: "The team notes are empty. The lines they held stay in the earlier versions." };
  return {
    ok: true,
    message: want === "1" ? `Runs can now leave team notes here.${result.note ? ` ${result.note}` : ""}` : "It takes no team notes any more. The lines it had come back if team notes are turned on again.",
  };
}

/** A new harness or a new piece, then its page. */
export async function createItem(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const kind = str(form, "kind") as ItemKind;
  if (!KINDS.includes(kind)) return GARBLED;
  const name = str(form, "name").trim();
  const slug = (opt(form, "slug") ?? slugOf(name)).toLowerCase();
  if (!name) return { ok: false, message: "Give it a name." };
  // Asked as the Hub itself: a private item someone else owns takes its address too.
  if (await findHarness(null, slug)) return { ok: false, message: `The address ${slug} is taken. Choose another.` };
  const result = await saveHarness(me, {
    slug,
    kind,
    note: "First version",
    name,
    goal: kind === "harness" ? str(form, "goal") : undefined,
    description: str(form, "description").trim(),
    prompt: str(form, "prompt"),
    when: kind === "hook" ? (when(form) ?? undefined) : undefined,
    icon: kind === "tool" ? (icon(form) ?? undefined) : undefined,
    visibility: str(form, "team") === "1" ? "team" : "private",
  });
  if (!result.ok) return { ok: false, message: plain(result.message) };
  revalidatePath("/", "layout");
  redirect(`/h/${result.harness.slug}`);
}

/** Says who sees an item: the whole team, or only its owner and its editors. Its owner only: checked in the store. */
export async function visibility(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const result = await setVisibility(me, str(form, "slug"), str(form, "to"));
  revalidatePath("/", "layout");
  return result;
}

/** Sets an item aside, or brings it back. */
export async function archive(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const result = await setArchived(me, str(form, "slug"), str(form, "archived") === "1");
  revalidatePath("/", "layout");
  return result;
}

/** Lets a teammate change an item, or takes that back. */
export async function editor(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const result = await setEditor(me, str(form, "slug"), { email: str(form, "email"), name: opt(form, "name") }, str(form, "add") === "1");
  revalidatePath("/", "layout");
  return result;
}

/** Comment on, merge or close a suggestion. The button pressed says which. */
export async function review(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const number = Number(form.get("number"));
  const decision = str(form, "decision");
  if (!Number.isInteger(number) || (decision !== "comment" && decision !== "merge" && decision !== "close")) return GARBLED;
  const result = await reviewSuggestion(me, number, decision, str(form, "comment"));
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/", "layout");
  return { ok: true, message: result.message };
}

/** Makes the signed-in person's own copy and opens it, or opens the copy they already have. */
export async function copyHarness(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const source = await findHarness(me, str(form, "slug"));
  if (!source) return GONE;

  // ada@example.com copying morning-inbox-brief gets ada-morning-inbox-brief.
  const who = me.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "my";
  const slug = `${who}-${source.slug}`.slice(0, 80).replace(/-+$/, "");
  const existing = await findHarness(me, slug);
  if (existing && existing.owner.email !== me.email) {
    return { ok: false, message: `${slug} is taken. Ask your agent to copy it under another name.` };
  }
  if (!existing) {
    const result = await saveHarness(me, {
      slug,
      copyOf: source.slug,
      name: `${source.name} · ${me.name.split(/\s+/)[0]}`.slice(0, 80),
      note: `Copy of ${source.slug} v${source.version}`,
    });
    // A private item someone else owns may hold that address: this page has no field for another one.
    if (!result.ok && result.message === `${slug} is taken. Choose another slug.`) {
      return { ok: false, message: `${slug} is taken. Ask your agent to copy it under another name.` };
    }
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath("/", "layout");
  }
  redirect(`/h/${slug}`);
}

/** Says that a run which was not fine has been dealt with, or opens it again. Who may is decided in lib/hub/runs.ts. */
export async function followUp(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const result = await followUpRun(me, Number(form.get("run")), str(form, "intent") !== "reopen", str(form, "note"), opt(form, "shown"));
  // Refreshed whatever the answer: a refusal often means the page is older than the run's state.
  revalidatePath("/", "layout");
  return result;
}

/** Adds someone to the team, from the Members page. Admins only: checked in lib/hub/people.ts. */
export async function addTeammate(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const result = await addPerson(me, str(form, "email"), str(form, "name"));
  revalidatePath("/", "layout");
  return result;
}

export async function removeTeammate(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const result = await removePerson(me, str(form, "email"));
  revalidatePath("/", "layout");
  return result;
}

/** Sets what one of the caller's own connected agents may do: read only, or read and write. */
export async function agentAccess(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const result = await setAccess(me, str(form, "client"), str(form, "access"));
  revalidatePath("/connect");
  return result;
}

/** Saves the signed-in person's own values for a harness's variables. Theirs only: nobody else sees them. */
export async function myValues(_previous: FormState, form: FormData): Promise<FormState> {
  const me = await member();
  if (!me) return SIGN_IN;
  const values: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (key.startsWith("v:")) values[key.slice(2)] = String(value);
  const result = await saveValues(me, str(form, "slug"), values);
  revalidatePath(`/h/${str(form, "slug")}`);
  return { ok: result.ok, message: result.message };
}
