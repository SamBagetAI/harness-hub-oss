import { VERDICTS, verdictTotal, verdictWords, type Verdicts } from "@/lib/hub/verdicts";
import type { Run } from "@/lib/hub/types";

/*
 * How a verdict looks, everywhere: a small mark with its own shape and
 * colour, always next to its words. Shape and words carry the meaning; the
 * colour only helps the eye, so nothing here is told by colour alone.
 */

/** The mark of one verdict: a square, a diamond or a dash. */
export function VerdictMark({ status }: { status: Run["status"] }) {
  return <span className={`rmark ${status}`} aria-hidden="true" />;
}

/** The three verdicts with what each one means. Shown once above the numbers it explains. */
export function VerdictLegend({ meanings = false }: { meanings?: boolean }) {
  return (
    <ul className={`verdicts${meanings ? " meanings" : ""}`} aria-label="What the three verdicts mean">
      {VERDICTS.map((v) => (
        <li key={v.key}>
          <span className="rstat">
            <VerdictMark status={v.key} />
            {v.label}
          </span>
          {meanings && <span className="mu">{v.means}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * How a set of runs went, as one thin bar split in up to three parts. It
 * always sits next to the same counts in words, so it carries no text itself.
 */
export function VerdictBar({ counts }: { counts: Verdicts }) {
  const total = verdictTotal(counts);
  if (total === 0) return null;
  return (
    <span className="vbar" role="img" aria-label={verdictWords(counts, ", ")}>
      {VERDICTS.filter((v) => counts[v.key] > 0).map((v) => (
        <span key={v.key} className={`vseg ${v.key}`} style={{ flexGrow: counts[v.key] }} />
      ))}
    </span>
  );
}
