"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { FormState } from "@/app/h/[slug]/actions";

/** What the dashboard's forms share: how a form answers, a labelled field, a select, and the options for a hook's timing and a tool's icon. */

export type Mode = "save" | "suggest";

export const WHEN_OPTIONS = [
  ["start", "At the start"],
  ["before_tool", "Before a tool"],
  ["after_tool", "After a tool"],
  ["end", "At the end"],
] as const;
export const ICON_OPTIONS = [
  ["connector", "Connector"],
  ["browser", "Browser"],
  ["code", "Code"],
  ["send", "Send"],
] as const;

export const KIND_OPTIONS = [
  ["skill", "Skill: how to judge or write something"],
  ["tool", "Tool: what the agent uses, and what it may do with it"],
  ["hook", "Hook: one rule at a set moment"],
  ["memory", "Memory: what is kept between runs"],
] as const;

/** The answer of the last attempt: grey when it went through, in the flag colour when it did not. */
export function Status({ state, answered, link = "See it" }: { state: FormState; answered: boolean; link?: string }) {
  return (
    <span className={state.ok ? "mu" : "flag"} role="status">
      {answered && state.message}
      {answered && state.ok && state.href && (
        <>
          {" "}
          <Link href={state.href}>{link}</Link>
        </>
      )}
    </span>
  );
}

export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <>
      <label className="mu" htmlFor={id}>
        {label}
      </label>
      {children}
    </>
  );
}

export function Select({ id, name, value, onChange, options, none }: { id: string; name: string; value: string; onChange: (v: string) => void; options: readonly (readonly [string, string])[]; none?: string }) {
  return (
    <select id={id} name={name} className="fld" value={value} onChange={(e) => onChange(e.target.value)}>
      {none !== undefined && <option value="">{none}</option>}
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
}
