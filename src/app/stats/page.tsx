import type { Metadata } from "next";
import Link from "next/link";
import { DayCells } from "@/components/day-cells";
import { MemberPage } from "@/components/member-page";
import { RunHead, RunLine } from "@/components/run-line";
import { RunsExplainer } from "@/components/runs-explainer";
import { PartGlyph } from "@/components/tool-icon";
import { VerdictBar, VerdictLegend } from "@/components/verdict";
import { KIND, partAnchor } from "@/lib/hub/parts";
import { PERIOD_DAYS, stats } from "@/lib/hub/runs";
import { dayWords, verdictTotal, verdictWords } from "@/lib/hub/verdicts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stats · Harness Hub" };

/** The tallest a day's column gets, and the most one run takes: a quiet day is not drawn as a big block. */
const PLOT = 48;
const UNIT = 14;

/**
 * What the reported runs say: how much each harness is used, how the runs
 * went, and which pieces gave trouble. One period for every number on the
 * page. It counts reports, not runs: a run whose agent never reported is not here.
 */
export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const { who } = await searchParams;
  const mine = who === "me";
  return (
    <MemberPage
      active="stats"
      render={async ({ member, harnesses }) => {
        const s = await stats(member, mine);
        const harness = (slug: string) => harnesses.find((h) => h.slug === slug);
        const name = (slug: string) => harness(slug)?.name ?? slug;
        const runs = verdictTotal(s.total);
        const notFine = s.total.flagged + s.total.failed;
        const share = runs ? Math.round((s.total.ok / runs) * 100) : null;
        // One scale for every row, so two harnesses can be compared by eye.
        const top = Math.max(1, ...s.perHarness.flatMap((h) => h.byDay.map(verdictTotal)));
        const unit = Math.min(UNIT, PLOT / top);
        const period = `${dayWords(s.days[0])} to ${dayWords(s.days[s.days.length - 1])}`;
        const whose = mine ? "your agent" : "agents";
        const tiles = [
          { label: "Runs reported", value: String(runs), hint: `${s.before.runs} in the ${PERIOD_DAYS} days before. A run that never reported is not counted.` },
          { label: "Went fine", value: share === null ? "n/a" : `${share}%`, hint: share === null ? "no run reported" : `${s.total.ok} of ${runs}, by the agents' own verdict` },
          {
            label: "Not fine",
            value: String(notFine),
            hint: notFine
              ? `${verdictWords({ ...s.total, ok: 0 })}. ${s.open ? `${s.open} of the ${notFine} still open.` : "All dealt with."}`
              : runs
                ? "every reported run went fine"
                : "no run reported",
          },
          mine
            ? { label: "Harnesses you ran", value: String(s.perHarness.length), hint: s.perHarness.map((h) => name(h.slug)).join(", ") || "none in this period" }
            : { label: "People with a run", value: String(s.people.length), hint: s.people.slice(0, 4).map((p) => `${p.name} ${p.runs}`).join(" · ") || "nobody in this period" },
          {
            label: "Suggestions merged",
            value: String(s.merged),
            hint: mine ? "changes you proposed that an owner accepted" : "changes a teammate proposed that an owner accepted",
          },
        ];
        return (
          <>
            <div className="statshead">
              <div>
                <h1 className="h1">Stats</h1>
                <p className="mu tabnote">
                  What {whose} reported in the last {PERIOD_DAYS} days, {period}. Every number on this page counts those days.
                </p>
              </div>
              {/* One filter, above everything it scopes. */}
              <nav className="seg2" aria-label="Whose runs">
                <Link href="/stats" aria-current={mine ? undefined : "true"}>
                  Everyone
                </Link>
                <Link href="/stats?who=me" aria-current={mine ? "true" : undefined}>
                  Mine
                </Link>
              </nav>
            </div>

            <RunsExplainer />

            <div className="tiles">
              {tiles.map((t) => (
                <div className="tile box" key={t.label}>
                  <div className="tilevalue">{t.value}</div>
                  <div className="tilelabel">{t.label}</div>
                  <div className="mu tilehint">{t.hint}</div>
                </div>
              ))}
            </div>

            <section className="sec" aria-labelledby="perday">
              <div className="sechead">
                <h2 id="perday" className="h2">
                  Each harness, day by day
                </h2>
                {s.perHarness.length > 0 && <VerdictLegend />}
              </div>
              {s.perHarness.length > 0 && (
                <p className="mu chartnote">
                  One column is one day. Its height is the number of runs reported that day, and its colours are their verdicts. Heights
                  compare from one harness to the next.
                </p>
              )}
              {s.perHarness.length === 0 ? (
                <p className="mu">
                  No run was reported in these {PERIOD_DAYS} days. To see one here, ask your agent to run a harness
                  {harnesses[0] ? (
                    <>
                      , for example <span className="mono">Run the harness {harnesses[0].slug} from Harness Hub.</span>
                    </>
                  ) : (
                    "."
                  )}{" "}
                  When it ends, the agent reports it.
                </p>
              ) : (
                <>
                  <div className="scrollx">
                    <table className="daytable">
                      <thead>
                        <tr>
                          <th scope="col">Harness</th>
                          {s.days.map((d, i) => {
                            const date = new Date(`${d}T00:00:00Z`);
                            // The month is written where it starts: on the first column, and on the first of a month.
                            const month = i === 0 || date.getUTCDate() === 1;
                            return (
                              <th scope="col" key={d} className="mono daynum" title={dayWords(d, true)} data-today={i === s.days.length - 1 || undefined}>
                                {month ? dayWords(d) : date.getUTCDate()}
                              </th>
                            );
                          })}
                          <th scope="col" className="num">
                            Runs
                          </th>
                          <th scope="col" className="how">
                            How they went
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.perHarness.map((h) => {
                          const n = verdictTotal(h.total);
                          return (
                            <tr key={h.slug}>
                              <th scope="row">
                                <Link href={`/h/${h.slug}/runs`}>{name(h.slug)}</Link>
                                <span className="mu who">{h.people.map((p) => `${p.name} ${p.runs}`).join(" · ")}</span>
                              </th>
                              <DayCells days={s.days} byDay={h.byDay} unit={unit} />
                              <td className="num mono">{n}</td>
                              <td className="how">
                                <VerdictBar counts={h.total} />
                                <span className="mu">{verdictWords(h.total)}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="mu chartnote">
                    A day with no column had no report: nobody ran the harness, or its agent did not report. Days follow world time
                    (UTC), so a run early in your morning can fall on the day before.
                  </p>
                </>
              )}
            </section>

            <section className="sec" aria-labelledby="trouble">
              <h2 id="trouble" className="h2">
                What gave trouble
              </h2>
              <p className="mu tabnote">The parts of a harness that agents blamed when a run did not go fine.</p>
              {s.trouble.length === 0 ? (
                <p className="mu">{notFine ? "No piece was named." : runs ? "Nothing: every reported run went fine." : "Nothing reported yet."}</p>
              ) : (
                <div className="box">
                  {s.trouble.map((t) => {
                    const h = harness(t.slug);
                    const at = h ? h.content.parts.findIndex((p) => p.piece === t.id || p.name.trim().toLowerCase() === t.piece.trim().toLowerCase()) : -1;
                    const part = h && at !== -1 ? h.content.parts[at] : undefined;
                    return (
                      <div className="trouble" key={`${t.slug}:${t.id}`}>
                        <div className="tname">
                          {part && <PartGlyph part={part} size={16} />}
                          {part ? <Link href={`/h/${t.slug}#${partAnchor(at)}`}>{t.piece}</Link> : <span>{t.piece}</span>}
                          <span className="mu">
                            {part ? `${KIND[part.kind].one.toLowerCase()} of ` : "named in "}
                            <Link href={`/h/${t.slug}/runs?show=trouble`}>{name(t.slug)}</Link>
                          </span>
                        </div>
                        <div className="tcount mono">
                          blamed in {t.runs} run{t.runs === 1 ? "" : "s"} · {t.open ? `${t.open} still open` : "dealt with"}
                        </div>
                        <div className="tlast">
                          <span className="mu">
                            {t.runs === 1 ? "On" : "Last time,"} {dayWords(t.lastAt)}, in {t.lastBy ? `${t.lastBy}'s` : "a"} run on v{t.lastVersion}
                            {t.lastStatus === "failed" ? ", which failed" : ""}. The agent said:
                          </span>{" "}
                          {t.lastNote || <span className="mu">nothing.</span>}
                        </div>
                        <div className="tsince mu">
                          {t.since === 0
                            ? "No run of this harness since then, so it may still be there."
                            : `Not seen again in the ${t.since} run${t.since === 1 ? "" : "s"} of this harness since then.`}
                          {t.open > 0 &&
                            ` Nobody has marked ${t.runs === 1 ? "that run" : t.open === t.runs ? "those runs" : `${t.open} of those runs`} as dealt with yet.`}
                          {h && h.latest > t.lastVersion ? ` The harness has changed since: it is at v${h.latest}.` : ""}
                          {/* What to do depends on the kind of piece: a tool lives in each person's agent, the others are text in the Hub. */}
                          {part?.kind === "tool" && " A tool is usually fixed in that person's own agent: signing in again, or adding the tool."}
                          {part && part.kind !== "tool" && ` A ${KIND[part.kind].one.toLowerCase()} is usually fixed in its wording: open it to suggest a change.`}{" "}
                          <Link href={`/h/${t.slug}/runs?show=trouble`}>{t.runs === 1 ? "Read that run" : `Read the ${t.runs} runs`}</Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {s.unnamedTrouble > 0 && (
                <p className="mu">
                  {s.unnamedTrouble} more run{s.unnamedTrouble === 1 ? "" : "s"} needed a look or failed without naming a piece: the note says why.
                </p>
              )}
            </section>

            <section className="sec" aria-labelledby="latest">
              <h2 id="latest" className="h2">
                Latest reports
              </h2>
              {s.recent.length === 0 ? (
                <p className="mu">None in this period.</p>
              ) : (
                <div className="box">
                  <RunHead />
                  {/* Read here, marked on each harness's Runs tab: one place where a run changes. */}
                  {s.recent.map((r) => (
                    <RunLine run={r} name={name(r.slug)} me={member.email} marks={false} key={r.id} />
                  ))}
                </div>
              )}
              {runs > s.recent.length && <p className="mu">The latest {s.recent.length} of {runs}. Each harness has all of its runs on its Runs tab.</p>}
            </section>
          </>
        );
      }}
    />
  );
}
