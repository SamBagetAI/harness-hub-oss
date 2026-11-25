"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page fails. It says what to do next instead of the framework's blank error. */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  // The reference that matches this failure in the server's logs.
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <main style={{ padding: "64px 24px", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 className="h1">Harness Hub hit a problem</h1>
      <p className="mu">
        This page could not be shown. Nothing was changed. It is usually short-lived: try again, and if it keeps happening tell the
        person who runs your Hub{digest ? `, with this reference: ${digest}` : ""}.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        {/* retry loads the page's data again; the older reset would only redraw what already failed. */}
        <button type="button" className="btn pri" onClick={() => retry()}>
          Try again
        </button>
        <Link className="btn" href="/">
          Back to the harnesses
        </Link>
      </div>
    </main>
  );
}
