"use client";

import { useState } from "react";
import { addTeammate, agentAccess, removeTeammate } from "@/app/h/[slug]/actions";
import { useSaved } from "@/components/use-saved";
import { Status } from "@/components/form-parts";

// ---------------------------------------------------------------------------
// The team: adding someone, and taking that back
// ---------------------------------------------------------------------------

export function AddPersonForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const { state, run, pending, answered } = useSaved(addTeammate, () => {
    setEmail("");
    setName("");
  });
  return (
    <form action={run} className="inlineform wrap">
      <label className="sr-only" htmlFor="person-email">
        Email address
      </label>
      <input id="person-email" name="email" type="email" required className="fld narrow" placeholder="teammate@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <label className="sr-only" htmlFor="person-name">
        Name
      </label>
      <input id="person-name" name="name" className="fld narrow" placeholder="Name (optional)" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="btn pri sm" disabled={pending}>
        {pending ? "Adding…" : "Add to the team"}
      </button>
      <Status state={state} answered={answered} />
    </form>
  );
}

export function RemovePersonForm({ email }: { email: string }) {
  const { state, run, pending, answered } = useSaved(removeTeammate);
  return (
    <form action={run} className="inlineform">
      <input type="hidden" name="email" value={email} />
      <button type="submit" className="btn sm" disabled={pending}>
        Remove
      </button>
      <Status state={state} answered={answered && !state.ok} />
    </form>
  );
}

/** The switch for one connected agent: read only, or read and write. */
export function AgentAccessForm({ client, access }: { client: string; access: "read" | "write" }) {
  const { state, run, pending, answered } = useSaved(agentAccess);
  const next = access === "read" ? "write" : "read";
  return (
    <form action={run} className="inlineform">
      <input type="hidden" name="client" value={client} />
      <input type="hidden" name="access" value={next} />
      <button type="submit" className="btn sm" disabled={pending}>
        {next === "read" ? "Make read-only" : "Let it write"}
      </button>
      <Status state={state} answered={answered && !state.ok} />
    </form>
  );
}
