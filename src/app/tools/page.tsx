import type { Metadata } from "next";
import { MemberPage } from "@/components/member-page";
import { PieceList } from "@/components/piece-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tools · Harness Hub" };

export default function Page() {
  return (
    <MemberPage
      active="tools"
      render={({ harnesses, pieces }) => (
        <>
          <h1 className="h1">Tools</h1>
          <p className="mu" style={{ maxWidth: 620 }}>
            What the agent needs on the person&apos;s own side, and what it may do with it. Harness Hub stores the description only: each
            person connects their own tools. To build with one, open a harness and choose &quot;Add a piece&quot;.
          </p>
          <PieceList pieces={pieces} harnesses={harnesses} kind="tool" />
        </>
      )}
    />
  );
}
