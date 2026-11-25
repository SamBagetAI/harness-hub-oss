"use client";

import { useState } from "react";
import { review } from "@/app/h/[slug]/actions";
import { useSaved } from "@/components/use-saved";

/** Comment on a suggestion. Someone who may change the item can also merge or close an open one. */
export function ReviewForm({ number, canDecide }: { number: number; canDecide: boolean }) {
  const [comment, setComment] = useState("");
  const { state, run, pending, answered } = useSaved(review, () => setComment(""));
  return (
    <form action={run} className="editform">
      <input type="hidden" name="number" value={number} />
      <label className="mu" htmlFor={`comment-${number}`}>
        Comment
      </label>
      <textarea id={`comment-${number}`} name="comment" rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="editbar">
        {canDecide && (
          <>
            <button type="submit" name="decision" value="merge" className="btn pri sm" disabled={pending}>
              Merge as a new version
            </button>
            <button type="submit" name="decision" value="close" className="btn sm" disabled={pending}>
              Close without merging
            </button>
          </>
        )}
        <button type="submit" name="decision" value="comment" className="btn sm" disabled={pending}>
          Comment
        </button>
        <span className={state.ok ? "mu" : "flag"} role="status">
          {answered && state.message}
        </span>
      </div>
    </form>
  );
}
