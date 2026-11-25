"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * One collapsible row: a summary line, and the piece's text on click.
 *
 * A link to the row's id (from the map, or from the library) opens it on
 * arrival; a plain <details> would only be scrolled to and stay closed.
 */
export function PieceRow({
  id,
  wide = false,
  rowClass,
  summary,
  children,
}: {
  id?: string;
  /** Library rows carry one more column. */
  wide?: boolean;
  /** Another column layout for the summary line, for example "hist" for version and suggestion rows. */
  rowClass?: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (!id) return;
    const openIfTarget = () => {
      if (window.location.hash === `#${id}` && ref.current) {
        ref.current.open = true;
        ref.current.scrollIntoView({ block: "start" });
      }
    };
    openIfTarget();
    window.addEventListener("hashchange", openIfTarget);
    return () => window.removeEventListener("hashchange", openIfTarget);
  }, [id]);

  return (
    <details className="piece" id={id} ref={ref}>
      <summary className={rowClass ?? (wide ? "lib" : undefined)}>{summary}</summary>
      {children}
    </details>
  );
}
