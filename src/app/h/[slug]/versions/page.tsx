import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiffView } from "@/components/diff-view";
import { HarnessHeader } from "@/components/harness-header";
import { MemberPage } from "@/components/member-page";
import { PieceRow } from "@/components/piece-row";
import { fieldDiffs, withNames } from "@/lib/hub/diff";
import { pieceNames, versionsOf } from "@/lib/hub/read";
import { PARTS_BECAME_PIECES } from "@/lib/hub/setup";
import { locate } from "@/lib/hub/locate";
import { KIND } from "@/lib/hub/parts";
import { day } from "@/lib/hub/safe-text";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Versions · Harness Hub" };

/** How many of the newest versions open to show what they changed. Older ones still open as a whole. */
const WITH_CHANGES = 30;


/** Every version, newest first, like a list of commits. Each opens to show what it changed. */
export default async function VersionsPage({ params }: PageProps<"/h/[slug]/versions">) {
  const { slug } = await params;
  return (
    <MemberPage
      active="harnesses"
      render={async ({ member, harnesses, pieces }) => {
        const h = await locate(member, slug, { harnesses, pieces });
        if (!h) notFound();
        const versions = await versionsOf(h.slug, WITH_CHANGES + 1);
        // A harness is its own versions plus those of its pieces: a piece changes without a new version here.
        const linked = h.kind === "harness" ? h.content.parts.filter((p) => p.piece && p.by) : [];
        // In what a version changed, a part is called what people read it as today.
        // A piece this person cannot see is called "a private piece", never by the name a version stored.
        const names = await pieceNames(versions.flatMap((v) => v.fields?.content.parts.flatMap((p) => (p.piece ? [p.piece] : [])) ?? []), member);
        return (
          <>
            <HarnessHeader h={h} member={member} tab="versions" />
            <section className="sec" aria-label="Versions">
              <p className="mu tabnote">
                Every save is a new version. Nothing is overwritten: runs use the latest, and older versions stay
                readable. Open a version to see what it changed.
                {linked.length > 0 && " These are the versions of the harness itself: its prompt, its variables and which pieces it uses. Each piece has versions of its own, listed below."}
                {h.latest > versions.length &&
                  ` These are the newest ${versions.length} of ${h.latest}. An older one opens at /h/${h.slug}?v= followed by its number.`}
              </p>
              <div className="group">
                {versions.map((v, i) => {
                  const before = versions[i + 1]?.fields;
                  return (
                    <PieceRow
                      key={v.number}
                      id={`v${v.number}`}
                      rowClass="hist"
                      summary={
                        <>
                          <span className="mono vbadge">v{v.number}</span>
                          <span className="hmain">
                            <span className="pname">{v.note}</span>
                            <span className="psum mu">{v.changes}</span>
                          </span>
                          <span className="hmeta mu">
                            {v.savedBy.name} · {day(v.savedAt)}
                            {v.number === h.latest ? " · latest" : ""}
                          </span>
                        </>
                      }
                    >
                      {v.number === 1 ? (
                        <p className="mu diffempty">The first version: everything in it was new.</p>
                      ) : v.changes === PARTS_BECAME_PIECES ? (
                        <p className="mu diffempty">
                          Until this version the text of each part was kept inside the harness. Here each part became a piece of its own, with the same
                          text, and the harness now names its pieces. Nothing a run reads changed.
                        </p>
                      ) : v.fields && before ? (
                        <DiffView diffs={fieldDiffs(withNames({ ...before, kind: h.kind }, names), withNames({ ...v.fields, kind: h.kind }, names))} />
                      ) : (
                        <p className="mu diffempty">Only the newest {WITH_CHANGES} versions show their changes here.</p>
                      )}
                      <div className="piecefoot">
                        <Link href={v.number === h.latest ? `/h/${h.slug}` : `/h/${h.slug}?v=${v.number}`}>
                          Open it as it was at v{v.number}
                        </Link>
                      </div>
                    </PieceRow>
                  );
                })}
              </div>
            </section>
            {linked.length > 0 && (
              <section className="sec" aria-labelledby="piecesat">
                <h2 id="piecesat" className="h2">
                  Its pieces · the version each one is at. A run always uses the latest.
                </h2>
                <div className="box">
                  {linked.map((p) => (
                    <div className="kv atversion" key={p.piece}>
                      <span>
                        <Link href={`/h/${p.piece}/versions`}>{p.name}</Link> <span className="mu">· {KIND[p.kind].one.toLowerCase()}</span>
                      </span>
                      <span className="mu">
                        <span className="mono">v{p.pieceVersion}</span> · text saved {day(p.pieceSavedAt ?? "")} by {p.savedBy?.name}
                        {p.pieceNote ? ` · ${p.pieceNote}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        );
      }}
    />
  );
}
