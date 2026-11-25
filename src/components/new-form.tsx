"use client";

import Link from "next/link";
import { useState } from "react";
import { createItem } from "@/app/h/[slug]/actions";
import { useSaved } from "@/components/use-saved";
import type { ItemKind } from "@/lib/hub/types";
import { Field, ICON_OPTIONS, KIND_OPTIONS, Select, Status, WHEN_OPTIONS } from "@/components/form-parts";


// ---------------------------------------------------------------------------
// A new harness, or a new piece by itself
// ---------------------------------------------------------------------------

const slugFrom = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export function NewForm({ kind: first }: { kind: ItemKind }) {
  const [kind, setKind] = useState<string>(first);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [when, setWhen] = useState("before_tool");
  const [icon, setIcon] = useState("connector");
  const { state, run, pending, answered } = useSaved(createItem);
  const harness = kind === "harness";

  return (
    <form action={run} className="editform flat box pad">
      <Field id="new-kind" label="What to make">
        <Select id="new-kind" name="kind" value={kind} onChange={setKind} options={[["harness", "Harness: everything that makes an agent run"], ...KIND_OPTIONS]} />
      </Field>
      <Field id="new-name" label="Name">
        <input id="new-name" name="name" className="fld" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field id="new-slug" label="Address: lower-case letters, digits and hyphens. It cannot change later.">
        <input id="new-slug" name="slug" className="fld mono" required maxLength={80} pattern="[a-z0-9][a-z0-9-]*" value={slug ?? slugFrom(name)} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
      </Field>
      {harness && (
        <Field id="new-goal" label="Goal: what the agent is for, in one sentence. The outcome, not the steps.">
          <input id="new-goal" name="goal" className="fld" required maxLength={200} value={goal} onChange={(e) => setGoal(e.target.value)} />
        </Field>
      )}
      <Field id="new-description" label={harness ? "What it does, in one or two short sentences" : "Summary: one line saying what it is for"}>
        <textarea id="new-description" name="description" rows={2} maxLength={harness ? 300 : 200} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {kind === "hook" && (
        <Field id="new-when" label="When the rule applies">
          <Select id="new-when" name="when" value={when} onChange={setWhen} options={WHEN_OPTIONS} />
        </Field>
      )}
      {kind === "tool" && (
        <Field id="new-icon" label="Icon">
          <Select id="new-icon" name="icon" value={icon} onChange={setIcon} options={ICON_OPTIONS} />
        </Field>
      )}
      <Field id="new-prompt" label={harness ? "Prompt: who the agent works for and what it does. Skills, tools, hooks and memory are added on its page." : "Text"}>
        <textarea id="new-prompt" name="prompt" rows={12} required spellCheck={false} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </Field>
      <p className="mu">Text only. Never a password, a token or a cookie: anything personal becomes a variable.</p>
      <label className="inlineform">
        <input type="checkbox" name="team" value="1" />
        <span>
          Share with the team now <span className="mu">· otherwise only you, and the editors you add, see it until you share it</span>
        </span>
      </label>
      <div className="editbar">
        <button type="submit" className="btn pri" disabled={pending}>
          {pending ? "Creating…" : "Create as version 1"}
        </button>
        <Link href="/" className="btn">
          Cancel
        </Link>
        <Status state={state} answered={answered && !state.ok} />
      </div>
    </form>
  );
}
