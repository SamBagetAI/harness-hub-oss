"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { saveEdit } from "@/app/h/[slug]/actions";
import { ICON_OPTIONS, WHEN_OPTIONS, type Mode } from "@/components/form-parts";
import { useSaved } from "@/components/use-saved";
import type { Part } from "@/lib/hub/types";

/**
 * The edit box under a text. For someone who may change it, it saves a new
 * version; for anyone else it sends the change to the owner as a suggestion.
 *
 * Two uses. With no `part`: the prompt of a harness. With `part` and
 * `item`: a piece, by its own slug, with its name, summary and timing beside
 * its text. That is how a part is edited on its harness's page too: the form
 * saves the piece, and every harness that uses it gets the new version.
 */
export function EditForm({
  slug,
  version,
  part,
  item = false,
  body,
  mode,
  what = "Text",
  reach,
  actions,
}: {
  /** What is saved: the harness, or for `item` the piece itself. */
  slug: string;
  /** The version on the page: the one this text comes from. */
  version: number;
  /** The part or piece being edited. Left out for the prompt of a harness. */
  part?: Part;
  /** The form edits a piece itself, not a part inside a harness. */
  item?: boolean;
  body: string;
  mode: Mode;
  /** What the main text box holds. */
  what?: string;
  /** Who else gets the change, said next to the save button: "2 other harnesses use this piece". */
  reach?: string;
  /** Other things to do with what the form edits, shown beside its button while it is closed. */
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // The fields keep their own state: a refused save must not wipe what was typed.
  const [text, setText] = useState(body);
  const [name, setName] = useState(part?.name ?? "");
  const [summary, setSummary] = useState(part?.summary ?? "");
  const [when, setWhen] = useState<string>(part?.when ?? "");
  const [icon, setIcon] = useState<string>(part?.icon ?? "");
  const [note, setNote] = useState("");
  const { state, run, pending, answered, forget } = useSaved(saveEdit, () => {
    setOpen(false);
    setNote("");
  });
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    // Closing the box puts the keyboard back on the button that opened it.
    if (wasOpen.current && !open) opener.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const suggest = mode === "suggest";
  const id = part === undefined ? "prompt" : `part-${item ? slug : part.name}`;

  if (!open) {
    return (
      <div className="editbar">
        <button
          ref={opener}
          type="button"
          className="btn sm"
          onClick={() => {
            setText(body);
            setName(part?.name ?? "");
            setSummary(part?.summary ?? "");
            setWhen(part?.when ?? "");
            setIcon(part?.icon ?? "");
            setNote("");
            forget();
            setOpen(true);
          }}
        >
          {suggest ? "Suggest a change" : "Edit"}
        </button>
        {actions}
        {/* Always on the page, so a screen reader announces the message when it arrives. */}
        <span className="mu" role="status">
          {answered && state.ok && (
            <>
              {state.message} {state.href && <Link href={state.href}>See it</Link>}
            </>
          )}
        </span>
      </div>
    );
  }

  return (
    <form action={run} className="editform">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="piece" value={part === undefined ? "prompt" : item ? "item" : "part"} />
      <input type="hidden" name="part" value={part?.name ?? ""} />
      {part && (
        <>
          <label className="mu" htmlFor={`name-${id}`}>
            Name
          </label>
          <input id={`name-${id}`} name="name" className="fld" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          <label className="mu" htmlFor={`summary-${id}`}>
            Summary: one line saying what it is for
          </label>
          <input id={`summary-${id}`} name="summary" className="fld" maxLength={200} value={summary} onChange={(e) => setSummary(e.target.value)} />
          {part.kind === "hook" && (
            <>
              <label className="mu" htmlFor={`when-${id}`}>
                When the rule applies
              </label>
              <select id={`when-${id}`} name="when" className="fld" value={when} onChange={(e) => setWhen(e.target.value)}>
                <option value="">Not said</option>
                {WHEN_OPTIONS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </>
          )}
          {part.kind === "tool" && (
            <>
              <label className="mu" htmlFor={`icon-${id}`}>
                Icon
              </label>
              <select id={`icon-${id}`} name="icon" className="fld" value={icon} onChange={(e) => setIcon(e.target.value)}>
                <option value="">None</option>
                {ICON_OPTIONS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </>
          )}
        </>
      )}
      <label className="mu" htmlFor={`body-${id}`}>
        {what}
      </label>
      <textarea id={`body-${id}`} name="body" value={text} onChange={(e) => setText(e.target.value)} rows={14} spellCheck={false} autoFocus />
      <label className="mu" htmlFor={`note-${id}`}>
        {suggest ? "Your suggestion in one line (the owner sees this first)" : "What changed (one line, shown in the version list)"}
      </label>
      <input id={`note-${id}`} name="note" maxLength={200} className="fld" value={note} onChange={(e) => setNote(e.target.value)} />
      {reach && !suggest && <p className="mu reach">{reach}</p>}
      <div className="editbar">
        <button type="submit" name="intent" value="save" className="btn pri sm" disabled={pending}>
          {pending ? "Sending…" : suggest ? "Send suggestion" : "Save as new version"}
        </button>
        <button type="button" className="btn sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </button>
        {part && !item && (
          <button type="submit" name="intent" value="remove" className="btn sm" disabled={pending}>
            {suggest ? "Suggest removing it" : "Remove this part"}
          </button>
        )}
        <span className="flag" role="status">
          {answered && !state.ok ? state.message : ""}
        </span>
      </div>
    </form>
  );
}
