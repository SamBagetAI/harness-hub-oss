"use client";

import { useEffect, useRef, useState } from "react";
import { addPart, ownCopy, saveAbout, saveVariables, teamNotes } from "@/app/h/[slug]/actions";
import { useSaved } from "@/components/use-saved";
import type { HarnessView, Variable } from "@/lib/hub/types";
import { Field, ICON_OPTIONS, KIND_OPTIONS, Select, Status, WHEN_OPTIONS, type Mode } from "@/components/form-parts";

/*
 * The forms of a harness or piece page. Each one opens from a small button, keeps what
 * was typed when a save is refused, and shows the Hub's answer next to its
 * buttons. Someone who may change the item saves a new version; anyone else
 * sends the same change to the owner as a suggestion.
 */

// ---------------------------------------------------------------------------
// Name, goal and description of a harness; name, summary and timing of a piece
// ---------------------------------------------------------------------------

export function AboutForm({ h, mode }: { h: HarnessView; mode: Mode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(h.name);
  const [goal, setGoal] = useState(h.goal);
  const [description, setDescription] = useState(h.description);
  const [schedule, setSchedule] = useState(h.content.schedule ?? "");
  const [testedOn, setTestedOn] = useState(h.content.testedOn ?? "");
  const [when, setWhen] = useState<string>(h.content.when ?? "");
  const [icon, setIcon] = useState<string>(h.content.icon ?? "");
  const [note, setNote] = useState("");
  const { state, run, pending, answered, forget } = useSaved(saveAbout, () => {
    setOpen(false);
    setNote("");
  });
  const piece = h.kind !== "harness";

  if (!open) {
    return (
      <div className="inlinebar">
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            setName(h.name);
            setGoal(h.goal);
            setDescription(h.description);
            setSchedule(h.content.schedule ?? "");
            setTestedOn(h.content.testedOn ?? "");
            setWhen(h.content.when ?? "");
            setIcon(h.content.icon ?? "");
            forget();
            setOpen(true);
          }}
        >
          {mode === "save" ? (piece ? "Edit name and summary" : "Edit name, goal and description") : "Suggest a change to these"}
        </button>
        <Status state={state} answered={answered} />
      </div>
    );
  }

  return (
    <form action={run} className="editform flat">
      <input type="hidden" name="slug" value={h.slug} />
      <input type="hidden" name="version" value={h.version} />
      <Field id="about-name" label="Name">
        <input id="about-name" name="name" className="fld" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      {!piece && (
        <Field id="about-goal" label="Goal: what the agent is for, in one sentence. The outcome, not the steps.">
          <input id="about-goal" name="goal" className="fld" maxLength={200} value={goal} onChange={(e) => setGoal(e.target.value)} />
        </Field>
      )}
      <Field id="about-description" label={piece ? "Summary: one line saying what it is for" : "What it does, in one or two short sentences"}>
        <textarea id="about-description" name="description" rows={2} maxLength={piece ? 200 : 300} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      {!piece && (
        <Field id="about-schedule" label="When it is meant to run, in one line (optional). Harness Hub runs nothing: each person's agent sets it up when they ask.">
          <input id="about-schedule" name="schedule" className="fld" maxLength={200} placeholder="At 06:44, Sunday through Thursday" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
        </Field>
      )}
      {!piece && (
        <Field id="about-tested" label="Works well on: the models and agents you tried it on, in one line (optional). Runs reported by model show next to it.">
          <input id="about-tested" name="tested_on" className="fld" maxLength={200} placeholder="Opus 5.5 in Claude; GPT-5 in Codex" value={testedOn} onChange={(e) => setTestedOn(e.target.value)} />
        </Field>
      )}
      {h.kind === "hook" && (
        <Field id="about-when" label="When the rule applies">
          <Select id="about-when" name="when" value={when} onChange={setWhen} options={WHEN_OPTIONS} none="Not said" />
        </Field>
      )}
      {h.kind === "tool" && (
        <Field id="about-icon" label="Icon">
          <Select id="about-icon" name="icon" value={icon} onChange={setIcon} options={ICON_OPTIONS} none="None" />
        </Field>
      )}
      <Field id="about-note" label={mode === "save" ? "What changed (one line, shown in the version list)" : "Your suggestion in one line (the owner sees this first)"}>
        <input id="about-note" name="note" className="fld" required maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="editbar">
        <button type="submit" className="btn pri sm" disabled={pending}>
          {pending ? "Sending…" : mode === "save" ? "Save as new version" : "Send suggestion"}
        </button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
        <Status state={state} answered={answered && !state.ok} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Variables: what each person sets for their own run
// ---------------------------------------------------------------------------

export function VariablesForm({ slug, version, variables, mode }: { slug: string; version: number; variables: Variable[]; mode: Mode }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Variable[]>(variables);
  const [note, setNote] = useState("");
  const { state, run, pending, answered, forget } = useSaved(saveVariables, () => {
    setOpen(false);
    setNote("");
  });
  const change = (i: number, patch: Partial<Variable>) => setRows(rows.map((r, at) => (at === i ? { ...r, ...patch } : r)));

  if (!open) {
    return (
      <div className="inlinebar">
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            setRows(variables);
            forget();
            setOpen(true);
          }}
        >
          {mode === "save" ? "Edit variables" : "Suggest a change to the variables"}
        </button>
        <Status state={state} answered={answered} />
      </div>
    );
  }

  return (
    <form action={run} className="editform flat">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="variables" value={JSON.stringify(rows)} />
      <p className="mu">
        The text uses a variable by its name in braces, like {"{handle}"}. Leave the default empty for anything personal: each
        person is then asked for it.
      </p>
      <div className="varrows">
        {rows.map((v, i) => (
          <div className="varrow" key={i}>
            <input aria-label="Name" className="fld mono" placeholder="name" maxLength={40} value={v.key} onChange={(e) => change(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
            <input aria-label="What to ask for" className="fld" placeholder="What to ask the person for" maxLength={200} value={v.label} onChange={(e) => change(i, { label: e.target.value })} />
            <input aria-label="Default" className="fld" placeholder="Default (empty = each person provides it)" maxLength={200} value={v.default ?? ""} onChange={(e) => change(i, { default: e.target.value })} />
            <button type="button" className="btn sm" onClick={() => setRows(rows.filter((_, at) => at !== i))} aria-label={`Remove the variable ${v.key || i + 1}`}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <div>
        <button type="button" className="btn sm" onClick={() => setRows([...rows, { key: "", label: "" }])} disabled={rows.length >= 30}>
          Add a variable
        </button>
      </div>
      <Field id="vars-note" label={mode === "save" ? "What changed (one line)" : "Your suggestion in one line"}>
        <input id="vars-note" name="note" className="fld" required maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="editbar">
        <button type="submit" className="btn pri sm" disabled={pending}>
          {pending ? "Sending…" : mode === "save" ? "Save as new version" : "Send suggestion"}
        </button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
        <Status state={state} answered={answered && !state.ok} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// A new part: a piece from the library, or one written here for this harness
// ---------------------------------------------------------------------------

/** A piece that a harness could take on, as the list to choose from shows it. */
export type Pickable = { slug: string; name: string; kind: string; owner: string };

const KIND_GROUPS = [
  ["skill", "Skills"],
  ["tool", "Tools"],
  ["hook", "Hooks"],
  ["memory", "Memory"],
] as const;

export function AddPartForm({ slug, version, mode, library }: { slug: string; version: number; mode: Mode; library: Pickable[] }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"own" | "shared">("own");
  const [kind, setKind] = useState("skill");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [when, setWhen] = useState("before_tool");
  const [icon, setIcon] = useState("connector");
  // The first piece in the order the list shows them, so the choice that is already made is the one on top.
  const [pick, setPick] = useState(KIND_GROUPS.flatMap(([value]) => library.filter((p) => p.kind === value))[0]?.slug ?? "");
  const { state, run, pending, answered, forget } = useSaved(addPart, () => {
    setOpen(false);
    setName("");
    setSummary("");
    setBody("");
  });

  if (!open) {
    return (
      <div className="inlinebar">
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            forget();
            setOpen(true);
          }}
        >
          {mode === "save" ? "Add a piece" : "Suggest a new piece"}
        </button>
        <Status state={state} answered={answered} />
      </div>
    );
  }

  return (
    <form action={run} className="editform flat">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      <div className="choice" role="radiogroup" aria-label="Where the piece comes from">
        <label>
          <input type="radio" checked={source === "own"} onChange={() => setSource("own")} /> Write a new one, for this harness
        </label>
        <label>
          <input type="radio" checked={source === "shared"} onChange={() => setSource("shared")} disabled={library.length === 0} /> Use one from the library
          {library.length === 0 ? " (none left to add)" : ""}
        </label>
      </div>
      {source === "shared" ? (
        <Field id="add-shared" label="Piece. This harness then always uses its latest version: when its owner changes it, it changes here too.">
          <select id="add-shared" name="shared" className="fld" value={pick} onChange={(e) => setPick(e.target.value)}>
            {KIND_GROUPS.map(([value, heading]) => {
              const group = library.filter((p) => p.kind === value);
              if (group.length === 0) return null;
              return (
                <optgroup key={value} label={heading}>
                  {group.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.name} · {p.owner} · {p.slug}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </Field>
      ) : (
        <>
          <Field id="add-kind" label="Kind">
            <Select id="add-kind" name="kind" value={kind} onChange={setKind} options={KIND_OPTIONS} />
          </Field>
          <Field id="add-name" label="Name">
            <input id="add-name" name="name" className="fld" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field id="add-summary" label="Summary: one line saying what it is for">
            <input id="add-summary" name="summary" className="fld" maxLength={200} value={summary} onChange={(e) => setSummary(e.target.value)} />
          </Field>
          {kind === "hook" && (
            <Field id="add-when" label="When the rule applies">
              <Select id="add-when" name="when" value={when} onChange={setWhen} options={WHEN_OPTIONS} />
            </Field>
          )}
          {kind === "tool" && (
            <Field id="add-icon" label="Icon">
              <Select id="add-icon" name="icon" value={icon} onChange={setIcon} options={ICON_OPTIONS} />
            </Field>
          )}
          <Field id="add-body" label="Text. It is saved as a piece of its own, with its own versions, which other harnesses can use too.">
            <textarea id="add-body" name="body" rows={8} required spellCheck={false} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
        </>
      )}
      <div className="editbar">
        <button type="submit" className="btn pri sm" disabled={pending}>
          {pending ? "Sending…" : mode === "save" ? "Add as new version" : "Send suggestion"}
        </button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
        <Status state={state} answered={answered && !state.ok} />
      </div>
    </form>
  );
}

/** Gives a harness its own copy of a piece it borrows, in the original's place. */
export function OwnCopyButton({ slug, piece, label, version }: { slug: string; piece: string; /** The name the part is read under, for the version's note. */ label: string; version: number }) {
  const { state, run, pending, answered } = useSaved(ownCopy);
  return (
    <form action={run} className="inlineform" title="Makes a copy of this piece that belongs to this harness, and uses it here in place of the original. The original stays as it is for the harnesses that still use it.">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="part" value={piece} />
      <input type="hidden" name="label" value={label} />
      <input type="hidden" name="version" value={version} />
      <button type="submit" className="btn sm" disabled={pending}>
        {pending ? "Copying…" : "Make this harness its own copy"}
      </button>
      <Status state={state} answered={answered} />
    </form>
  );
}

/**
 * Whether runs may leave team notes in a memory, and emptying them. Its owner
 * and editors decide. Stopping and emptying both take the lines out of the
 * memory, so each is asked twice when there are any, with what happens said
 * in plain sight, and the keyboard follows the question.
 */
export function TeamNotesForm({ slug, version, on, lines = 0 }: { slug: string; version: number; on: boolean; /** How many lines the notes hold now. */ lines?: number }) {
  const [asking, setAsking] = useState<null | "stop" | "empty">(null);
  const { state, run, pending, answered } = useSaved(teamNotes, () => setAsking(null));
  const stop = useRef<HTMLButtonElement>(null);
  const empty = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const asked = useRef<null | "stop" | "empty">(null);
  useEffect(() => {
    // To Cancel when the question opens; back to the button that opened it when it closes.
    if (asking) cancel.current?.focus();
    else if (asked.current) (asked.current === "empty" ? (empty.current ?? stop.current) : stop.current)?.focus();
    asked.current = asking;
  }, [asking]);
  const some = on && lines > 0;
  const these = lines === 1 ? "The line above" : `The ${lines} lines above`;
  return (
    <form action={run} className="inlineform foot">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="on" value={asking === "empty" ? "empty" : on ? "0" : "1"} />
      {/* Always on the page, so a screen reader says the question when it is asked. */}
      <span role="status">
        {asking === "stop" &&
          `${these} will leave this memory, in every harness that uses it, and runs can add no more. ${lines === 1 ? "It stays" : "They stay"} in its earlier versions, and ${lines === 1 ? "comes" : "come"} back if team notes are turned on again.`}
        {asking === "empty" && `${these} will leave this memory, in every harness that uses it, and runs go on adding new ones. ${lines === 1 ? "It stays" : "They stay"} readable in its earlier versions only.`}
      </span>
      {asking ? (
        <>
          <button type="submit" className="btn sm" disabled={pending}>
            {pending ? "Saving…" : asking === "stop" ? "Yes, stop taking team notes" : "Yes, empty the team notes"}
          </button>
          <button type="button" ref={cancel} className="btn sm" onClick={() => setAsking(null)} disabled={pending}>
            Cancel
          </button>
        </>
      ) : some ? (
        <>
          <button type="button" ref={stop} className="btn sm" onClick={() => setAsking("stop")}>
            Stop taking team notes
          </button>
          <button type="button" ref={empty} className="btn sm" onClick={() => setAsking("empty")}>
            Empty the team notes
          </button>
        </>
      ) : (
        <button type="submit" ref={stop} className="btn sm" disabled={pending}>
          {pending ? "Saving…" : on ? "Stop taking team notes" : "Let runs leave team notes here"}
        </button>
      )}
      {!on && <span className="mu">Any teammate&apos;s run can then add a line. The lines are kept apart from the text and never followed as instructions.</span>}
      <Status state={state} answered={answered} />
    </form>
  );
}
