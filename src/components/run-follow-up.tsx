"use client";

import { useEffect, useRef, useState } from "react";
import { followUp } from "@/app/h/[slug]/actions";
import { useSaved } from "@/components/use-saved";
import type { Run } from "@/lib/hub/types";
import { dayWords } from "@/lib/hub/verdicts";

/**
 * What happened after a run that was not fine: it is still open, or someone
 * dealt with it, and how. The verdict itself is the agent's and never changes.
 * The person whose run it was, the owner and the editors of the harness can
 * mark it; everyone else reads it.
 */
export function RunFollowUp({
  id,
  dealt,
  reopened,
  can,
  runner,
  what,
}: {
  id: number;
  dealt: Run["dealt"];
  reopened: Run["reopened"];
  /** The reader may mark this run. Undefined where runs are only read, as on the Stats page. */
  can?: boolean;
  /** Whose run it was: named to a reader who cannot mark it. */
  runner: string;
  /** The run in a few words, for the spoken names of the controls: "the run of 6 Nov by ben". */
  what: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { state, run, pending, answered, forget } = useSaved(followUp, () => {
    setOpen(false);
    setNote("");
  });
  const wrap = useRef<HTMLDivElement>(null);
  // Set when this reader closes the box or sends a mark, so the keyboard only moves after their own action.
  const cancelled = useRef(false);
  const sent = useRef(false);
  const isDealt = Boolean(dealt);
  const focusFirst = () => wrap.current?.querySelector<HTMLElement>("button")?.focus();
  useEffect(() => {
    // Closing the box puts the keyboard back on the button that opened it.
    if (!open && cancelled.current) focusFirst();
    cancelled.current = false;
  }, [open]);
  useEffect(() => {
    // Once the mark is saved, the control the reader used is gone: the keyboard goes to the one that took its place.
    if (sent.current) focusFirst();
    sent.current = false;
  }, [isDealt]);

  const told = (
    <>
      {/* Always on the page, so a screen reader says the answer when it arrives. */}
      <span className="sr-only" role="status">
        {answered ? state.message : ""}
      </span>
      {answered && !state.ok && (
        <span className="flag" aria-hidden="true">
          {state.message}
        </span>
      )}
    </>
  );

  if (dealt) {
    return (
      <div className="rfollow" ref={wrap}>
        <span className="mu">
          Dealt with by {dealt.by.name}, {dayWords(dealt.at)}
          {dealt.note ? `. They wrote: “${dealt.note}”` : "."}
        </span>
        {can && (
          <form action={run} onSubmit={() => (sent.current = true)}>
            <input type="hidden" name="run" value={id} />
            <input type="hidden" name="intent" value="reopen" />
            <input type="hidden" name="shown" value={dealt.at} />
            <button type="submit" className="linkbtn" disabled={pending} aria-label={`Mark ${what} as not dealt with after all`}>
              {pending ? "Saving…" : "Not dealt with after all"}
            </button>
          </form>
        )}
        {told}
      </div>
    );
  }

  const before = reopened && (
    <span className="mu">
      {reopened.by.name} said on {dayWords(reopened.at)} that it was not dealt with after all.
      {reopened.was ? ` Before that, ${reopened.was.by} had marked it${reopened.was.note ? ` and written: “${reopened.was.note}”` : ""}.` : ""}
    </span>
  );

  if (!can) {
    return (
      <div className="rfollow" ref={wrap}>
        <span className="tag open">open</span>
        {/* Where runs can be marked, a reader who cannot is told who can. Where they are only read, the state is enough. */}
        {can === false && <span className="mu">{runner}, or the owner or an editor of the harness, can mark it as dealt with.</span>}
        {before}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="rfollow" ref={wrap}>
        <span className="tag open">open</span>
        <button
          type="button"
          className="linkbtn"
          aria-label={`Mark ${what} as dealt with`}
          onClick={() => {
            forget();
            setOpen(true);
          }}
        >
          Mark as dealt with
        </button>
        {before}
        {told}
      </div>
    );
  }

  return (
    <div className="rfollow" ref={wrap}>
      <form action={run} onSubmit={() => (sent.current = true)} className="rfollowform">
        <input type="hidden" name="run" value={id} />
        <input type="hidden" name="intent" value="deal" />
        <label className="sr-only" htmlFor={`dealt-${id}`}>
          What was done about {what}
        </label>
        <input
          id={`dealt-${id}`}
          name="note"
          className="fld narrow"
          maxLength={200}
          placeholder="What was done (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          autoFocus
        />
        <button type="submit" className="btn pri sm" disabled={pending}>
          {pending ? "Saving…" : "Dealt with"}
        </button>
        <button
          type="button"
          className="btn sm"
          disabled={pending}
          onClick={() => {
            // An answer to an attempt that was given up does not stay on the line.
            forget();
            cancelled.current = true;
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </form>
      {told}
    </div>
  );
}
