import { KIND } from "@/lib/hub/parts";
import type { Part } from "@/lib/hub/types";

/**
 * Small line icons for tools, in the mock's ink colour. The icon is chosen by
 * the tool's `icon` field.
 */
const PATHS: Record<NonNullable<Part["icon"]>, string[]> = {
  // A browser window with an address bar.
  browser: ["M3 5h18v14H3z", "M3 9h18", "M6 7h.01", "M9 7h.01"],
  // Code: angle brackets and a slash.
  code: ["M8 8l-4 4 4 4", "M16 8l4 4-4 4", "M13.5 6l-3 12"],
  // A sent message.
  send: ["M21 3L10 14", "M21 3l-7 18-4-7-7-4z"],
  // A plug, for a connector.
  connector: ["M9 3v5", "M15 3v5", "M6 8h12v3a6 6 0 0 1-12 0z", "M12 17v4"],
};

/** The mark shown in front of a piece: a line icon for tools that have one, the kind's glyph otherwise. */
export function PartGlyph({ part, size = 20 }: { part: Part; size?: number }) {
  if (part.kind === "tool" && part.icon) return <ToolIcon icon={part.icon} size={size} />;
  return <span className={`g ${KIND[part.kind].glyph}`} />;
}

function ToolIcon({ icon, size }: { icon: NonNullable<Part["icon"]>; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--ink)"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      className="ticon"
    >
      {PATHS[icon].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
