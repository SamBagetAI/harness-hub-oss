import type { Run } from "./types";

/*
 * The three verdicts a run can get, and the words for them.
 *
 * The agent that did the run gives the verdict when it reports. The Hub does
 * not check it. Everything that shows a verdict takes its label, its order
 * and its meaning from here, so a page and a chart can never disagree.
 *
 * This file has no server code in it: the chart cells in the browser use it too.
 */

/** How many runs got each verdict. */
export type Verdicts = { ok: number; flagged: number; failed: number };

export const VERDICTS: { key: Run["status"]; label: string; counted: string; means: string }[] = [
  { key: "ok", label: "Went fine", counted: "went fine", means: "It did what the harness asks." },
  { key: "flagged", label: "Needs a look", counted: "needed a look", means: "It finished, but something was off. The note says what." },
  { key: "failed", label: "Failed", counted: "failed", means: "It could not finish." },
];

export const noVerdicts = (): Verdicts => ({ ok: 0, flagged: 0, failed: 0 });

export const verdictTotal = (v: Verdicts) => v.ok + v.flagged + v.failed;

/** "13 went fine, 2 needed a look, 1 failed", leaving out what did not happen. */
export function verdictWords(v: Verdicts, between = " · "): string {
  return VERDICTS.filter((x) => v[x.key] > 0)
    .map((x) => `${v[x.key]} ${x.counted}`)
    .join(between);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A day as "6 Nov", or "Thu 6 Nov". Days are counted in UTC, like every
 * number on the Stats page. Written by hand so the server and the browser
 * always print the same text.
 */
export function dayWords(iso: string, weekday = false): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "unknown day";
  return `${weekday ? `${WEEKDAYS[d.getUTCDay()]} ` : ""}${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
