"use client";

import { copyHarness } from "@/app/h/[slug]/actions";
import { useSaved } from "@/components/use-saved";

/** Makes the viewer's own copy of a harness or of a piece, or opens the one they already have. */
export function CopyForm({ slug, piece = false }: { slug: string; /** What is copied is a piece, not a harness. */ piece?: boolean }) {
  const { state, run, pending, answered } = useSaved(copyHarness);
  return (
    <form
      action={run}
      className="inlineform"
      title={
        piece
          ? "Your own copy of this piece, which you can change freely. Later changes to this one do not reach it. It is private until you share it."
          : "Your own copy: its prompt, its variables and which pieces it uses are yours to change. It uses the same pieces as this one, so a change to one of them still reaches your copy. To change a piece only for you, give your copy its own copy of that piece, on its page. It is private until you share it."
      }
    >
      <input type="hidden" name="slug" value={slug} />
      {answered && state.message && (
        <span className="flag inlinemsg" role="status">
          {state.message}
        </span>
      )}
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Copying…" : piece ? "Make my own copy" : "Copy to my harnesses"}
      </button>
    </form>
  );
}
