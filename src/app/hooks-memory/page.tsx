import type { Metadata } from "next";
import { MemberPage } from "@/components/member-page";
import { PieceList } from "@/components/piece-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hooks and memory · Harness Hub" };

export default function Page() {
  return (
    <MemberPage
      active="hooks"
      render={({ harnesses, pieces }) => (
        <>
          <h1 className="h1">Hooks and memory</h1>
          <p className="mu" style={{ maxWidth: 620 }}>
            Hooks are rules the agent follows at a set moment. Memory is what is kept between runs: a memory says where each person keeps their
            own notes, in their own agent, and may also take team notes, which runs leave here for everyone.
          </p>
          <PieceList pieces={pieces} harnesses={harnesses} kind="hook" />
          <PieceList pieces={pieces} harnesses={harnesses} kind="memory" />
        </>
      )}
    />
  );
}
