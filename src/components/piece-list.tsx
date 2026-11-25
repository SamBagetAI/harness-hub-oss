import Link from "next/link";
import { PartRow } from "@/components/part-row";
import { partOf } from "@/lib/hub/read";
import { usersOf } from "@/lib/hub/library";
import { KIND } from "@/lib/hub/parts";
import type { HarnessView, PartKind } from "@/lib/hub/types";

/**
 * The library's list for one kind: every piece of it, the most used first.
 * Each row says where the piece is used and whose it is, and opens to its
 * text. The piece's own page has its versions, its suggestions and its edits.
 */
export function PieceList({ pieces, harnesses, kind }: { pieces: HarnessView[]; harnesses: HarnessView[]; kind: PartKind }) {
  const noun = KIND[kind].one.toLowerCase();
  const list = pieces
    .filter((p) => p.kind === kind)
    .map((piece) => ({ piece, users: usersOf(harnesses, piece.slug) }))
    .sort((a, b) => b.users.length - a.users.length || a.piece.name.localeCompare(b.piece.name));
  return (
    <>
      <section className="sec" aria-label={KIND[kind].many}>
        <div className="headrow">
          <h2 className="h2">
            {KIND[kind].many} · {list.length} · each saved by itself, with versions of its own. Any harness can use one.
          </h2>
          <Link href={`/new?kind=${kind}`} className="btn sm">
            New {noun}
          </Link>
        </div>
        {list.length === 0 ? (
          <p className="mu">None yet. Make one here, or add one to a harness on its page: it is saved as a piece.</p>
        ) : (
          <div className="group">
            {list.map(({ piece, users }) => (
              <PartRow
                key={piece.slug}
                part={partOf(piece)}
                extra={
                  <span className="mu usedcell">
                    {/* A piece whose harness was archived is used by no harness in the lists, which is not the same as never used. */}
                    {users.length === 1
                      ? `in ${users[0].name}`
                      : users.length > 1
                        ? `in ${users.length} harnesses`
                        : piece.madeFor && !harnesses.some((h) => h.slug === piece.madeFor)
                          ? "its harness is archived"
                          : "not used yet"}{" "}
                    · {piece.owner.name}
                    {piece.visibility === "private" && " · private"}
                  </span>
                }
                footer={
                  <div className="piecefoot mu">
                    <Link href={`/h/${piece.slug}`}>Open this {noun}</Link> to change it, suggest a change or see its {piece.latest} version
                    {piece.latest === 1 ? "" : "s"} · <span className="mono">{piece.slug}</span>
                    {users.length > 0 && (
                      <>
                        {" · Used by "}
                        {users.map((u, i) => (
                          <span key={u.slug}>
                            {i > 0 && ", "}
                            <Link href={`/h/${u.slug}`}>{u.name}</Link>
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
