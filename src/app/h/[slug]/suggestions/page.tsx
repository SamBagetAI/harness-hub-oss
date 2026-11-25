import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DiffView } from "@/components/diff-view";
import { HarnessHeader } from "@/components/harness-header";
import { MemberPage } from "@/components/member-page";
import { PieceRow } from "@/components/piece-row";
import { ReviewForm } from "@/components/review-form";
import Link from "next/link";
import { addedLinks, describeChanges, fieldDiffs, mergeOnto, withNames } from "@/lib/hub/diff";
import { canEdit, suggestionsFor } from "@/lib/hub/harnesses";
import { pieceNames, versionFields } from "@/lib/hub/read";
import { locate } from "@/lib/hub/locate";
import { day } from "@/lib/hub/safe-text";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Suggestions · Harness Hub" };

/** Changes people proposed, like pull requests: open ones first, each with its exact changes and comments. */
export default async function SuggestionsPage({ params }: PageProps<"/h/[slug]/suggestions">) {
  const { slug } = await params;
  return (
    <MemberPage
      active="harnesses"
      render={async ({ member, harnesses, pieces }) => {
        const h = await locate(member, slug, { harnesses, pieces });
        if (!h) notFound();
        // The owner and the editors decide. Everyone else can comment.
        const isOwner = canEdit(h, member);
        const suggestions = await suggestionsFor(h.slug);
        // What waits on the pieces made for this harness: each is read and decided on the piece's own page.
        const onPieces = h.kind === "harness" ? h.content.parts.filter((p) => p.piece && p.madeFor === h.slug && (p.pieceSuggestions ?? 0) > 0) : [];
        // Each suggestion is shown against the version it was made on, as that version was stored. A suggestion
        // holds its parts as stored too: a part that is a piece is its link on both sides, whatever the piece
        // is called or says today. Compared with the harness as people read it, a renamed piece would look changed.
        const stored = await versionFields(h.slug, [...new Set([...suggestions.map((s) => s.baseVersion), h.latest])]);
        // A part is called what people read it as today, whatever its piece was named when a version was saved.
        // A piece this person cannot see is called "a private piece", never by the name a version stored.
        const names = await pieceNames([...stored.values(), ...suggestions.map((s) => s.proposed)].flatMap((x) => x.content.parts.flatMap((p) => (p.piece ? [p.piece] : []))), member);
        const bases = new Map([...stored].map(([number, fields]) => [number, withNames({ ...fields, kind: h.kind }, names)]));
        const now = bases.get(h.latest);
        const proposedOf = (sug: (typeof suggestions)[number]) => withNames({ ...sug.proposed, kind: h.kind }, names);
        return (
          <>
            <HarnessHeader h={h} member={member} tab="suggestions" />
            <section className="sec" aria-label="Suggestions">
              <p className="mu tabnote">
                {isOwner
                  ? "Changes your teammates proposed. Nothing changes until you merge one, and a merge becomes a new version."
                  : h.kind === "harness"
                    ? `To propose a change to the prompt or the variables, use "Suggest a change" on the first tab, or ask your agent. ${h.owner.name} decides whether to merge it. A change to one of its pieces is suggested on that piece, and shows on the piece's own page.`
                    : `To propose a change, choose "Suggest a change" on the first tab, or ask your agent. ${h.owner.name} decides whether to merge it.`}
              </p>
              {suggestions.length === 0 && <p className="mu">No suggestions {onPieces.length > 0 ? "on the harness itself" : "yet"}.</p>}
              {onPieces.length > 0 && (
                <div className="group">
                  <div className="gl">On its pieces · a change to a part is suggested on the part&apos;s piece, and decided there</div>
                  <div className="box">
                    {onPieces.map((p) => (
                      <div className="kv atversion" key={p.piece}>
                        <Link href={`/h/${p.piece}/suggestions`}>{p.name}</Link>
                        <span className="flag">
                          {p.pieceSuggestions} open suggestion{p.pieceSuggestions === 1 ? "" : "s"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* The number on the tab counts the open ones, so they get their own heading. */}
              {[
                { label: "Open", list: suggestions.filter((sug) => sug.status === "open") },
                { label: "Merged or closed", list: suggestions.filter((sug) => sug.status !== "open") },
              ]
                .filter((group) => group.list.length > 0)
                .map((group) => (
                  <div className="group" key={group.label}>
                    <div className="gl">
                      {group.label} · {group.list.length}
                    </div>
                    {group.list.map((sug) => {
                      const base = bases.get(sug.baseVersion);
                      const open = sug.status === "open";
                      const merge = base && now && open && sug.baseVersion !== h.latest ? mergeOnto(base, proposedOf(sug), now) : null;
                      // A piece the suggestion brings in shows below as a link only: its text is on its own page.
                      const brought = base && open ? addedLinks(base, sug.proposed).map((slug) => pieces.find((p) => p.slug === slug) ?? { slug, name: slug, owner: null }) : [];
                      return (
                        <PieceRow
                          key={sug.number}
                          id={`s${sug.number}`}
                          rowClass="hist"
                          summary={
                            <>
                              <span className={`status ${sug.status}`}>{sug.status}</span>
                              <span className="hmain">
                                <span className="pname">
                                  #{sug.number} {sug.title}
                                </span>
                                <span className="psum mu">
                                  {base ? `${describeChanges(base, proposedOf(sug)).join(", ")} · ` : ""}
                                  made on v{sug.baseVersion}
                                  {sug.mergedVersion ? ` · merged as v${sug.mergedVersion}` : ""}
                                  {sug.comments.length ? ` · ${sug.comments.length} comment${sug.comments.length === 1 ? "" : "s"}` : ""}
                                </span>
                              </span>
                              <span className="hmeta mu">
                                {sug.author.name} · {day(sug.createdAt)}
                              </span>
                            </>
                          }
                        >
                          {base && <DiffView diffs={fieldDiffs(base, proposedOf(sug))} />}
                          {brought.length > 0 && (
                            <div className="notice inset">
                              This would make the harness use{" "}
                              {brought.map((p, i) => (
                                <span key={p.slug}>
                                  {i > 0 && ", "}
                                  <Link href={`/h/${p.slug}`}>{p.name}</Link>
                                  {p.owner ? `, a piece owned by ${p.owner.name}` : ", a piece"}
                                </span>
                              ))}
                              . Its text is not shown here: read it on its page first. Once merged it is followed in this harness, and it can
                              change without a new version here.
                            </div>
                          )}
                          {merge && !merge.ok && (
                            <div className="notice bad inset">
                              This cannot be merged as it is: since v{sug.baseVersion}, {merge.conflicts.join(", ")} changed here
                              too. Close it and ask {sug.author.name} to suggest it again on v{h.latest}.
                              {base?.content.parts.some((p) => !p.piece && p.body) && now?.content.parts.some((p) => p.piece)
                                ? " Since then each part of this harness became a piece of its own, with the same text: a change to a part is now suggested on that part's piece, from its row on the first tab."
                                : ""}
                            </div>
                          )}
                          {sug.comments.length > 0 && (
                            <div className="comments">
                              {sug.comments.map((c, i) => (
                                <div className="comment" key={i}>
                                  <span className="mono mu">
                                    {c.by.name} · {day(c.at)}
                                  </span>
                                  <p>{c.text}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          <ReviewForm number={sug.number} canDecide={isOwner && open} />
                        </PieceRow>
                      );
                    })}
                  </div>
                ))}
            </section>
          </>
        );
      }}
    />
  );
}
