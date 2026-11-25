"use client";

import { useState } from "react";
import { myValues } from "@/app/h/[slug]/actions";
import { useSaved } from "@/components/use-saved";
import type { Variable } from "@/lib/hub/types";
import { Field, Status } from "@/components/form-parts";

/** The signed-in person's own values for a harness's variables, for their own runs. Nobody else sees them. */
export function MyValuesForm({ slug, variables, saved }: { slug: string; variables: Variable[]; saved: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const { state, run, pending, answered, forget } = useSaved(myValues, () => setOpen(false));
  if (!open) {
    return (
      <button
        type="button"
        className="btn sm"
        onClick={() => {
          forget();
          setOpen(true);
        }}
      >
        {Object.keys(saved).length ? "Change my values" : "Save my values"}
      </button>
    );
  }
  return (
    <form action={run} className="editform">
      <input type="hidden" name="slug" value={slug} />
      <p className="mu">Your own values, for your runs only: nobody else sees them, not the owner either. Leave one empty to clear it. Never a password, a token or a cookie.</p>
      {variables.map((v) => (
        <Field id={`mine-${v.key}`} label={`${v.key} · ${v.label}${v.default ? ` (default: ${v.default})` : ""}`} key={v.key}>
          <input id={`mine-${v.key}`} name={`v:${v.key}`} className="fld" maxLength={500} defaultValue={saved[v.key] ?? ""} />
        </Field>
      ))}
      <div className="editbar">
        <button type="submit" className="btn pri" disabled={pending}>
          {pending ? "Saving…" : "Save my values"}
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <Status state={state} answered={answered} />
      </div>
    </form>
  );
}
