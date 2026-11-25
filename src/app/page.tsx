import type { Metadata } from "next";
import Link from "next/link";
import { Face } from "@/components/face";
import { MemberPage } from "@/components/member-page";
import { PartGlyph } from "@/components/tool-icon";
import { waitingFor, type Waiting } from "@/lib/hub/harnesses";
import { archivedBy } from "@/lib/hub/read";
import { waitingOn } from "@/lib/hub/library";
import { openRunsFor } from "@/lib/hub/runs";
import type { HarnessView } from "@/lib/hub/types";
import { day } from "@/lib/hub/safe-text";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Harnesses · Harness Hub" };

export default function HarnessesPage() {
  return (
    <MemberPage
      active="harnesses"
      render={async ({ member, harnesses }) => {
        const [waiting, archived, openRuns] = await Promise.all([waitingFor(member), archivedBy(member), openRunsFor(member)]);
        const named = openRuns.map((o) => ({ ...o, name: harnesses.find((h) => h.slug === o.slug)?.name ?? o.slug }));
        return <Harnesses harnesses={harnesses} waiting={waiting} archived={archived} openRuns={named} />;
      }}
    />
  );
}

type OpenRuns = { slug: string; name: string; runs: number; edits: boolean; lastAt: string }[];

/** What needs this person: runs that were not fine and are still open, suggestions to decide, and what became of the ones they made. */
function ForYou({ waiting, openRuns }: { waiting: Waiting; openRuns: OpenRuns }) {
  // Short on purpose: the page is about the harnesses. Everything stays reachable on each item's Suggestions tab.
  const toReview = waiting.toReview.slice(0, 5);
  const answered = waiting.mine.filter((s) => s.status !== "open").slice(0, 3);
  const pending = waiting.mine.filter((s) => s.status === "open").slice(0, 3);
  const more = waiting.toReview.length + waiting.mine.length - toReview.length - answered.length - pending.length;
  if (toReview.length + answered.length + pending.length + openRuns.length === 0) return null;
  return (
    <section className="box foryou" aria-labelledby="foryou">
      <h2 id="foryou" className="h2">
        For you
      </h2>
      {/* Their own runs, and runs of harnesses they own or edit, that nobody has dealt with yet. */}
      {openRuns.map((o) => (
        <Link href={`/h/${o.slug}/runs?show=open`} className="youline" key={`o${o.slug}`}>
          <span className="status open">to look at</span>
          <span>
            {/* Their own harness: every open run of it. Someone else's: only their own runs. Either way, the ones they can mark. */}
            {o.runs} {o.edits ? "" : "of your "}run{o.runs === 1 ? "" : "s"} of {o.name} {o.runs === 1 ? "was" : "were"} not fine and {o.runs === 1 ? "is" : "are"} still
            open: look, then mark as dealt with
          </span>
          <span className="mono mu">latest {day(o.lastAt)}</span>
        </Link>
      ))}
      {toReview.map((s) => (
        <Link href={`/h/${s.slug}/suggestions#s${s.number}`} className="youline" key={`r${s.number}`}>
          <span className="status open">to decide</span>
          <span>
            {s.author.name} suggests on {s.itemName}: {s.title}
          </span>
          <span className="mono mu">{day(s.createdAt)}</span>
        </Link>
      ))}
      {answered.map((s) => (
        <Link href={`/h/${s.slug}/suggestions#s${s.number}`} className="youline" key={`a${s.number}`}>
          <span className={`status ${s.status}`}>{s.status}</span>
          <span>
            Your suggestion on {s.itemName}: {s.title}
          </span>
          <span className="mono mu">{s.mergedVersion ? `v${s.mergedVersion}` : ""}</span>
        </Link>
      ))}
      {pending.map((s) => (
        <Link href={`/h/${s.slug}/suggestions#s${s.number}`} className="youline" key={`p${s.number}`}>
          <span className="status">waiting</span>
          <span>
            Your suggestion on {s.itemName}: {s.title}
          </span>
          <span className="mono mu">{day(s.createdAt)}</span>
        </Link>
      ))}
      {more > 0 && <p className="mu youmore">And {more} more, on the Suggestions tab of each harness.</p>}
    </section>
  );
}

function Harnesses({ harnesses, waiting, archived, openRuns }: { harnesses: HarnessView[]; waiting: Waiting; archived: HarnessView[]; openRuns: OpenRuns }) {
  return (
    <>
      <div className="headrow">
        <h1 className="h1">Harnesses</h1>
        <Link href="/new" className="btn pri">
          New harness
        </Link>
      </div>
      <p className="mu tabnote" style={{ marginTop: -14 }}>
        A harness is everything that makes an agent run: its goal, its prompt, and its skills, tools, hooks
        and memory. It is not tied to one platform: Claude, Codex, ChatGPT, Gemini or any other agent can
        run it. Open one to read it.
      </p>

      <ForYou waiting={waiting} openRuns={openRuns} />

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 720 }}>
          <div className="cols mu" style={{ fontSize: 12, height: 40 }}>
            <span />
            <span>Name</span>
            <span>Made of</span>
            <span>Owner</span>
            <span title="Every run reported for the harness since its first one, and the share its agents said went fine">Runs, all time</span>
            <span>Version</span>
          </div>
          {harnesses.map((h) => (
            <Link href={`/h/${h.slug}`} className="cols row" key={h.slug}>
              <Face slug={h.slug} />
              <span className="namecell">
                <span style={{ fontWeight: 500 }}>
                  {h.name}
                  {h.visibility === "private" && <span className="privtag mu" style={{ marginLeft: 8 }}>private</span>}
                  {waitingOn(h) > 0 && (
                    <span className="flag waiting">
                      {waitingOn(h)} open suggestion{waitingOn(h) === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
                <span className="mu ellipsis">{h.goal || h.description}</span>
              </span>
              <span className="madeof" aria-label={`${h.content.parts.length} parts`}>
                {h.content.parts.map((part, i) => (
                  <span key={i} title={`${part.kind}: ${part.name}`} className="madeofitem">
                    <PartGlyph part={part} size={14} />
                  </span>
                ))}
              </span>
              <span className="mu" style={{ fontSize: 13 }}>
                {h.owner.name}
              </span>
              <span className="mono mu" title={h.runs ? `${h.cleanRuns} of ${h.runs} reported runs went fine` : "No run reported yet"}>
                {h.runs ? `${h.runs} · ${Math.round((h.cleanRuns / h.runs) * 100)}% fine` : "none yet"}
              </span>
              <span className="mono">
                v{h.version} <span className="mu">{day(h.savedAt)}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
      <div className="legend mu">
        <span><span className="g gs" />Skill</span>
        <span><span className="g gt" />Tool</span>
        <span><span className="g gh" />Hook</span>
        <span><span className="g gm" />Memory</span>
      </div>
      {archived.length > 0 && (
        <p className="mu" style={{ fontSize: 13 }}>
          Archived by you:{" "}
          {archived.map((a, i) => (
            <span key={a.slug}>
              {i > 0 && ", "}
              <Link href={`/h/${a.slug}`}>{a.name}</Link>
            </span>
          ))}
          . Open one to bring it back.
        </p>
      )}
    </>
  );
}
