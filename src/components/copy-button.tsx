"use client";

import { useState } from "react";

/** Copies a line to the clipboard. Used for the connector address and the sentences to say in Claude. */
export function CopyButton({
  text,
  label = "Copy",
  what = "address",
  small = false,
}: {
  text: string;
  label?: string;
  /** What is being copied, for the spoken name of the button. */
  what?: string;
  /** A text-sized button, for use inside a line. */
  small?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      // Clipboard access can be refused. The text stays visible next to the
      // button, so the person can select it by hand.
      setStatus("failed");
    }
    setTimeout(() => setStatus("idle"), 2000);
  }

  return (
    <>
      <button type="button" className={small ? "btn sm" : "btn"} onClick={copy} aria-label={text.length > 160 ? `Copy ${what}` : `Copy ${what}: ${text}`}>
        {status === "copied" ? "Copied" : label}
      </button>
      <span role="status" className="sr-only">
        {status === "copied" ? "Copied" : status === "failed" ? "Could not copy. Select the text instead." : ""}
      </span>
    </>
  );
}
