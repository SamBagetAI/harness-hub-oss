import type { FieldDiff } from "@/lib/hub/diff";

/** What changed, field by field, as red and green lines. Shown as plain text. */
export function DiffView({ diffs, empty = "No differences." }: { diffs: FieldDiff[]; empty?: string }) {
  if (diffs.length === 0) return <p className="mu diffempty">{empty}</p>;
  return (
    <div className="diffs">
      {diffs.map((d) => (
        <div className="diff" key={d.label}>
          <div className="diffhead mono">{d.label}</div>
          <pre className="difflines">
            {d.lines.map((line, i) => (
              <span key={i} className={line.op === "+" ? "add" : line.op === "-" ? "del" : "ctx"}>
                {line.op === " " ? " " : line.op} {line.text}
                {"\n"}
              </span>
            ))}
          </pre>
        </div>
      ))}
    </div>
  );
}
