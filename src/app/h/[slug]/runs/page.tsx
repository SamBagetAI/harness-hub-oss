import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HarnessHeader } from "@/components/harness-header";
import { MemberPage } from "@/components/member-page";
import { ModelResults } from "@/components/model-results";
import { RunHead, RunLine } from "@/components/run-line";
import { RunsExplainer } from "@/components/runs-explainer";
import { VerdictBar } from "@/components/verdict";
import { canEdit } from "@/lib/hub/harnesses";
import { locate } from "@/lib/hub/locate";
import { resultsByModel, runsOf, verdictsOf } from "@/lib/hub/runs";
import { dayWords, verdictTotal, verdictWords } from "@/lib/hub/verdicts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Runs · Harness Hub" };

const LISTED = 50;

/** The runs agents reported for one harness, newest first: how they went, then each one's line. */
export default async function RunsPage({ params, searchParams }: PageProps<"/h/[slug]/runs">) {
  const { slug } = await params;
  const { show } = await searchParams;
  const only = show === "trouble" || show === "open" || show === "mine" ? show : "all";
  return (
    <MemberPage
      active="harnesses"
      render={async ({ member, harnesses, pieces }) => {
        const h = await locate(member, slug, { harnesses, pieces });
        if (!h || h.kind !== "harness") notFound();
        const [{ counts, firstAt, mine, open }, byModel, runs] = await Promise.all([
          verdictsOf(h.slug, member.email),
          resultsByModel(h.slug),
          runsOf(member, h.slug, LISTED, { trouble: only === "trouble", open: only === "open", email: only === "mine" ? member.email : undefined }),
        ]);
        const edits = canEdit(h, member);
        const total = verdictTotal(counts);
        const notFine = counts.flagged + counts.failed;
        const say = `Run the harness ${h.slug} from Harness Hub.`;
        const base = `/h/${h.slug}/runs`;
        const shown = only === "trouble" ? notFine : only === "open" ? open : only === "mine" ? mine : total;
        return (
          <>
            <HarnessHeader h={h} member={member} tab="runs" />
            <section className="sec" aria-label="Runs">
              {total === 0 ? (
                <p className="mu tabnote">
                  No run reported yet. Ask your agent: <span className="mono">{say}</span> When the run ends, the agent reports it, and it
                  shows here. If a run does not show, its agent did not report: start a new session, so it loads the Hub&apos;s current tools.
                </p>
              ) : (
                <div className="runsum">
                  <div className="runsumtext">
                    <span>
                      <strong>
                        {total} run{total === 1 ? "" : "s"} reported in all
                      </strong>
                      {firstAt ? `, the first on ${dayWords(firstAt)}` : ""}: {verdictWords(counts)}.
                      {notFine > 0 &&
                        (open === 0
                          ? notFine === 1
                            ? " The one that was not fine has been dealt with."
                            : " All of those have been dealt with."
                          : open === notFine
                            ? notFine === 1
                              ? " The one that was not fine is still open."
                              : ` All ${notFine} that were not fine are still open.`
                            : ` ${open} of the ${notFine} that were not fine ${open === 1 ? "is" : "are"} still open.`)}
                    </span>
                    <VerdictBar counts={counts} />
                  </div>
                  {/* One filter, above the list it scopes. */}
                  <nav className="seg2" aria-label="Which runs">
                    <Link href={base} aria-current={only === "all" ? "true" : undefined}>
                      All {total}
                    </Link>
                    <Link href={`${base}?show=trouble`} aria-current={only === "trouble" ? "true" : undefined}>
                      Not fine {notFine}
                    </Link>
                    <Link href={`${base}?show=open`} aria-current={only === "open" ? "true" : undefined}>
                      Still open {open}
                    </Link>
                    <Link href={`${base}?show=mine`} aria-current={only === "mine" ? "true" : undefined}>
                      Mine {mine}
                    </Link>
                  </nav>
                </div>
              )}

              {open > 0 && !h.archived && (
                <p className="mu tabnote">
                  An open run waits for a person to look at it and mark it as dealt with. You can mark your own runs
                  {edits ? ", and as someone who can change this harness, every other run of it." : `; ${h.owner.name} and the editors of this harness can mark any.`}
                </p>
              )}
              {/* Open for someone who has no run to read yet; one click away for everyone else. */}
              <RunsExplainer say={say} open={total === 0} />

              {total > 0 &&
                (runs.length === 0 ? (
                  <p className="mu">
                    {only === "trouble"
                      ? "None: every reported run went fine."
                      : only === "open"
                        ? "None: every run that was not fine has been dealt with."
                        : "None of these runs is yours yet."}
                  </p>
                ) : (
                  <div className="box">
                    <RunHead />
                    {runs.map((r) => (
                      <RunLine run={r} me={member.email} edits={edits} marks={!h.archived} key={r.id} />
                    ))}
                  </div>
                ))}
              {shown > runs.length && runs.length > 0 && <p className="mu">The latest {runs.length} of {shown}.</p>}
            </section>
            <ModelResults results={byModel} />
          </>
        );
      }}
    />
  );
}
