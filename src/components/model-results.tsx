import Link from "next/link";
import { VerdictBar } from "@/components/verdict";
import type { ModelResult } from "@/lib/hub/runs";
import { dayWords, verdictTotal, verdictWords } from "@/lib/hub/verdicts";

/** A model as people read it: the name its agent gave, or that it gave none. */
const modelName = (r: ModelResult) => r.model ?? "model not said";

/**
 * Where a harness works: every reported run, by the model the agent said it ran on and the agent that reported it.
 * It is what agents said, counted: nobody checks a model's name or a verdict.
 */
export function ModelResults({ results }: { results: ModelResult[] }) {
  if (results.length === 0) return null;
  return (
    <section className="sec" aria-labelledby="bymodel">
      <h2 id="bymodel" className="h2">
        By model · where it was run, and how it went
      </h2>
      <div className="box">
        {results.map((r) => (
          <div className="kv" key={`${r.model}|${r.agent}`}>
            <span>
              <span className="mono">{modelName(r)}</span>
              <span className="mu"> · {r.agent ?? "agent not known"}</span>
            </span>
            <span>
              {verdictWords(r.counts)} <span className="mu">· last {dayWords(r.lastAt)}, on version {r.lastVersion}</span>
              <VerdictBar counts={r.counts} />
            </span>
          </div>
        ))}
      </div>
      <p className="mu" style={{ fontSize: 12 }}>
        Each line is what agents reported at the end of their runs: the model they said they ran on, and the agent the person
        connected. A model with no runs here has not been tried, or its agent did not report.
      </p>
    </section>
  );
}

/** One line for the harness page: on which models it went fine, with how many of their runs. */
export function ModelLine({ results, slug }: { results: ModelResult[]; slug: string }) {
  if (results.length === 0) return null;
  const parts = results.slice(0, 4).map((r) => `${modelName(r)} (${r.agent ?? "agent not known"}): ${r.counts.ok} of ${verdictTotal(r.counts)} fine`);
  return (
    <p className="mu tabnote">
      Reported runs by model · {parts.join(" · ")}
      {results.length > 4 ? ` · ${results.length - 4} more` : ""} · <Link href={`/h/${slug}/runs#bymodel`}>all of them</Link>
    </p>
  );
}
