import type { Metadata } from "next";
import { NewForm } from "@/components/new-form";
import { MemberPage } from "@/components/member-page";
import type { ItemKind } from "@/lib/hub/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New · Harness Hub" };

const KINDS: ItemKind[] = ["harness", "skill", "tool", "hook", "memory"];

/** A new harness, or a new piece by itself, made on the site. An agent can save one too. */
export default async function NewPage({ searchParams }: PageProps<"/new">) {
  const { kind } = await searchParams;
  const first = typeof kind === "string" && KINDS.includes(kind as ItemKind) ? (kind as ItemKind) : "harness";
  return (
    <MemberPage
      active="harnesses"
      render={() => (
        <>
          <h1 className="h1">New</h1>
          <p className="mu tabnote" style={{ marginTop: -14 }}>
            Start with the essentials. You become its owner, it is saved as version 1, and everyone on the team can read it and run it.
            You can also ask your agent: &quot;Save this as a harness in Harness Hub.&quot;
          </p>
          <NewForm kind={first} />
        </>
      )}
    />
  );
}
