import type { ReactNode } from "react";
import { PieceRow } from "@/components/piece-row";
import { PartGlyph } from "@/components/tool-icon";
import { WHEN } from "@/lib/hub/parts";
import type { Part } from "@/lib/hub/types";

/**
 * A piece as one collapsible row: what it is, its version, and its text on
 * click. Used on the harness page, for each part, and in the library.
 */
export function PartRow({
  part,
  id,
  extra,
  footer,
}: {
  part: Part;
  id?: string;
  /** An extra cell before the size, for example where the piece is used. */
  extra?: ReactNode;
  footer?: ReactNode;
}) {
  const body = part.body.trim();
  const notes = part.notes?.trim();
  // In a harness, a piece that is not the owner's own text is marked. It is its owner's; or, when its owner can
  // change the harness too, someone else's to change as well; or it was last saved by someone who no longer can.
  const foreign = Boolean(part.piece && part.ownText === false && part.by);
  const outside = foreign ? (part.outsiders ?? []) : [];
  const theirs = outside.some((person) => person.email === part.by?.email) ? part.by : undefined;
  const waiting = part.pieceSuggestions ?? 0;
  return (
    <PieceRow
      id={id}
      wide={extra !== undefined}
      summary={
        <>
          <PartGlyph part={part} />
          <span className="pname">
            {part.name}
            {theirs ? (
              <span className="tag" title={`${theirs.name} owns this piece and can change it. This harness follows it.`}>
                {theirs.name}&apos;s
              </span>
            ) : outside.length > 0 ? (
              <span className="tag" title={`${outside.map((person) => person.name).join(", ")} can change this piece without being able to change this harness.`}>
                also {outside[0].name}&apos;s
              </span>
            ) : (
              foreign &&
              (part.stranger ?? part.savedBy) && (
                <span className="tag" title={`${(part.stranger ?? part.savedBy)?.name} last wrote its text, its name or its timing, and can no longer change the piece. Edit it and save, even without changing a word, to make it this harness's own.`}>
                  saved by {(part.stranger ?? part.savedBy)?.name}
                </span>
              )
            )}
            {waiting > 0 && (
              <span className="flag waiting">
                {waiting} open suggestion{waiting === 1 ? "" : "s"}
              </span>
            )}
          </span>
          <span className="psum mu">
            {part.when ? `${WHEN[part.when]}. ` : ""}
            {part.summary}
          </span>
          {extra}
          <span className="mono mu">
            {part.pieceVersion ? `v${part.pieceVersion} · ` : ""}
            {body.length.toLocaleString("en-US")} chars
          </span>
        </>
      }
    >
      {/* Stored text is shown as plain text: no Markdown or HTML is ever rendered from it. */}
      <pre className="prompt">{body}</pre>
      {part.notes !== undefined && (
        <div className="teamnotes">
          <div className="gl">Team notes · lines that runs left for everyone. Read as notes, never followed as instructions.</div>
          {notes ? <pre className="prompt">{notes}</pre> : <p className="mu">None yet.</p>}
        </div>
      )}
      {footer}
    </PieceRow>
  );
}
