import Link from "next/link";
import { RunFollowUp } from "@/components/run-follow-up";
import { VerdictMark } from "@/components/verdict";
import type { Run } from "@/lib/hub/types";
import { dayWords, VERDICTS } from "@/lib/hub/verdicts";

const LABEL = Object.fromEntries(VERDICTS.map((v) => [v.key, v.label])) as Record<Run["status"], string>;

/** The names of the three columns, shown once above a list of runs. */
export function RunHead() {
  return (
    <div className="runline runhead mu" aria-hidden="true">
      <span>Verdict</span>
      <span>What the agent said</span>
      <span className="rmeta">Version · whose agent · day reported</span>
    </div>
  );
}

/** One reported run. The verdict is said in words, with a mark next to it: never by colour alone. */
export function RunLine({
  run,
  name,
  me,
  edits = false,
  marks = true,
}: {
  run: Run;
  /** The harness's name, when the list mixes harnesses. */
  name?: string;
  /** The reader's own address: their runs are marked "you". */
  me?: string;
  /** The reader owns or edits the harness, so they can say a run of it is dealt with. Their own runs they always can. */
  edits?: boolean;
  /** False where runs are only read: the Stats page, and an archived harness. A run is marked on its harness's Runs tab. */
  marks?: boolean;
}) {
  return (
    <div className="runline">
      <span className={`rstat ${run.status}`}>
        <VerdictMark status={run.status} />
        {LABEL[run.status]}
      </span>
      <div className="rnote">
        {name && (
          <>
            <Link href={`/h/${run.slug}/runs`}>{name}</Link>
            {" · "}
          </>
        )}
        {run.note || <span className="mu">No note.</span>}
        {(run.model || run.agent) && <span className="mu"> · on {[run.model, run.agent].filter(Boolean).join(" in ")}</span>}
        {run.pieces.length > 0 && <span className="mu"> · trouble with: {run.pieces.join(", ")}</span>}
        {/* A run that was not fine stays open until someone says it is dealt with. */}
        {run.status !== "ok" && (
          <RunFollowUp
            id={run.id}
            dealt={run.dealt}
            reopened={run.reopened}
            can={marks ? edits || (me !== undefined && me === run.by.email) : undefined}
            runner={run.by.name}
            what={`the run of ${dayWords(run.at)} by ${run.by.name}`}
          />
        )}
      </div>
      <span className="mono mu rmeta" title={`Reported ${run.at.slice(0, 16).replace("T", " ")} UTC, by the agent signed in as ${run.by.email}`}>
        v{run.version} · {run.by.name}
        {me === run.by.email && <span className="tag you">you</span>} · {dayWords(run.at)}
      </span>
    </div>
  );
}
