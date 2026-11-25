"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/h/[slug]/actions";

/** When the call never reached the Hub: a dropped connection, or a page older than the last release. */
const UNREACHABLE: FormState = {
  ok: false,
  message: "Harness Hub could not be reached, so nothing was saved. What you typed is still here: copy it, reload the page and try again.",
};

/** A redirect thrown by a server action has to reach Next. Anything else becomes a message on the form. */
function isRedirect(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Runs a server action from a form and keeps its answer.
 *
 * `answered` is false until the action has answered since the form was last
 * opened, so a message never outlives the attempt it belongs to. A call that
 * fails outright shows a sentence instead of taking the page down.
 */
export function useSaved(action: (previous: FormState, form: FormData) => Promise<FormState>, onOk?: (result: FormState) => void) {
  const [answered, setAnswered] = useState(false);
  const [state, run, pending] = useActionState<FormState, FormData>(
    async (previous, form) => {
      let result: FormState;
      try {
        result = await action(previous, form);
      } catch (error) {
        if (isRedirect(error)) throw error;
        result = UNREACHABLE;
      }
      setAnswered(true);
      if (result.ok) onOk?.(result);
      return result;
    },
    { ok: false, message: "" },
  );
  return { state, run, pending, answered, forget: () => setAnswered(false) };
}
