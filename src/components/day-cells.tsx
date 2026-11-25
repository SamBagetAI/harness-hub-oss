"use client";

import { useState } from "react";
import { dayWords, VERDICTS, verdictTotal, verdictWords, type Verdicts } from "@/lib/hub/verdicts";

/**
 * One harness's runs, day by day: a thin column per day, stacked by verdict.
 *
 * The count sits under each column, so nothing is told by the hover alone.
 * Hovering or tabbing onto a day shows the same numbers in words. The note is
 * placed against the window, not the table, so the table's scrolling edge
 * cannot cut it.
 */
export function DayCells({ days, byDay, unit }: { days: string[]; byDay: Verdicts[]; /** Pixels of height for one run: the same in every row. */ unit: number }) {
  const [tip, setTip] = useState<{ at: number; x: number; y: number; below: boolean } | null>(null);
  const show = (at: number, cell: HTMLElement) => {
    const box = cell.getBoundingClientRect();
    // Above the day when there is room for it, under it when the day is near the top of the window.
    const below = box.top < 110;
    setTip({ at, x: box.left + box.width / 2, y: below ? box.bottom : box.top, below });
  };
  return (
    <>
      {byDay.map((v, i) => {
        const n = verdictTotal(v);
        const day = dayWords(days[i], true);
        return (
          <td
            key={days[i]}
            className="daycell"
            // A day with a report can be reached with the keyboard. Its count is on the page either way.
            tabIndex={n === 0 ? undefined : 0}
            aria-label={`${day}: ${n === 0 ? "no report" : verdictWords(v, ", ")}`}
            onMouseEnter={(e) => show(i, e.currentTarget)}
            onMouseLeave={() => setTip(null)}
            onFocus={(e) => show(i, e.currentTarget)}
            onBlur={() => setTip(null)}
          >
            {/* Went fine at the bottom, then needs a look, then failed: trouble is what sticks out at the top. */}
            <span className="stack" aria-hidden="true">
              {n === 0 ? (
                <span className="seg none" />
              ) : (
                VERDICTS.filter((x) => v[x.key] > 0).map((x) => <span key={x.key} className={`seg ${x.key}`} style={{ height: Math.max(3, Math.round(v[x.key] * unit)) }} />)
              )}
            </span>
            <span className="daycount mono" aria-hidden="true">
              {n || ""}
            </span>
            {tip?.at === i && (
              <span className="daytip" role="tooltip" data-below={tip.below || undefined} style={{ left: tip.x, top: tip.y }}>
                <span className="mu">{day}</span>
                {n === 0 ? (
                  <span>No report</span>
                ) : (
                  VERDICTS.filter((x) => v[x.key] > 0).map((x) => (
                    <span key={x.key} className="tiprow">
                      <span className={`rmark ${x.key}`} />
                      <strong>{v[x.key]}</strong> {x.counted}
                    </span>
                  ))
                )}
              </span>
            )}
          </td>
        );
      })}
    </>
  );
}
