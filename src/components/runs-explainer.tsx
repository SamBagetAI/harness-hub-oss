import { VerdictLegend } from "@/components/verdict";

/**
 * Where a run comes from, and what its line means: the three steps, then the
 * three verdicts. Every number on the Stats page and every line on a Runs tab
 * is read with this, so it sits above them and stays short.
 */
export function RunsExplainer({ say, open = true }: { /** The sentence that starts a run, for a page about one harness. */ say?: string; /** Closed where the reader has seen it before. */ open?: boolean }) {
  return (
    <details className="howruns box" open={open}>
      <summary className="h2">How a run gets here</summary>
      <ol className="steps">
        <li>
          <span className="stepn mono">1</span>
          <span>
            <span className="stept">Someone asks their agent</span>
            <span className="mu">{say ? <span className="mono">{say}</span> : "“Run … from Harness Hub.”"}</span>
          </span>
        </li>
        <li>
          <span className="stepn mono">2</span>
          <span>
            <span className="stept">The agent does the work</span>
            <span className="mu">In that person&apos;s own agent, with their own accounts. The Hub runs nothing.</span>
          </span>
        </li>
        <li>
          <span className="stepn mono">3</span>
          <span>
            <span className="stept">At the end, it reports</span>
            <span className="mu">A verdict and one sentence on what happened. The Hub adds who, which version and the day, and keeps nothing else.</span>
          </span>
        </li>
      </ol>
      <p className="howwho">The agent gives one of three verdicts on its own run. Nobody checks it.</p>
      <VerdictLegend meanings />
      <p className="howfine">
        So these pages cannot show a run that never reported, or what a run produced. A run that was not fine stays open until a
        person has looked at it and marks it as dealt with, on the Runs tab of its harness: the person whose run it was, or the owner
        or an editor of the harness. It never closes by itself, and the verdict stays the agent&apos;s.
      </p>
    </details>
  );
}
