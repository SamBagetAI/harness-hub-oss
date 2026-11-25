"use client";

import { saveEdit } from "@/app/h/[slug]/actions";
import type { Mode } from "@/components/form-parts";
import { useSaved } from "@/components/use-saved";

/** Takes one part out of a harness, as a new version, or suggests it to the owner. The piece itself stays in the library. */
export function RemoveLink({
  slug,
  version,
  name,
  label,
  mode,
}: {
  slug: string;
  version: number;
  /** The part: its name, or the slug of its piece. */
  name: string;
  /** The name the part is read under, for the version's note. */
  label: string;
  mode: Mode;
}) {
  const { state, run, pending, answered } = useSaved(saveEdit);
  return (
    <form action={run} className="inlineform" title="Takes it out of this harness only. The piece keeps its versions and stays in the library.">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="piece" value="part" />
      <input type="hidden" name="part" value={name} />
      <input type="hidden" name="label" value={label} />
      <input type="hidden" name="intent" value="remove" />
      <button type="submit" className="btn sm" disabled={pending}>
        {mode === "save" ? "Remove from this harness" : "Suggest removing it"}
      </button>
      <span className={state.ok ? "mu" : "flag"} role="status">
        {answered && state.message}
      </span>
    </form>
  );
}
