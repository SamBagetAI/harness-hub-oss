import type { Metadata } from "next";
import { MemberPage } from "@/components/member-page";
import { PieceList } from "@/components/piece-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Skills · Harness Hub" };

export default function Page() {
  return (
    <MemberPage
      active="skills"
      render={({ harnesses, pieces }) => (
        <>
          <h1 className="h1">Skills</h1>
          <p className="mu" style={{ maxWidth: 620 }}>
            Know-how the agent applies: voice, style, rules and methods. Click a skill to read it. To build with one, open a harness and choose
            &quot;Add a piece&quot;.
          </p>
          <PieceList pieces={pieces} harnesses={harnesses} kind="skill" />
        </>
      )}
    />
  );
}
