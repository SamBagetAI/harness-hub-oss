import { SignOutButton } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";
import type { LibraryCounts } from "@/lib/hub/library";
import type { Member } from "@/lib/hub/members";

export type Section = "harnesses" | "skills" | "tools" | "hooks" | "stats" | "members" | "connect";

/**
 * The frame every dashboard page sits in: the mock's left sidebar and main
 * area. The sidebar lists only screens that exist.
 *
 * The main menu is the library: the harnesses and the pieces they are made
 * of, and how to connect an agent. What is about the team, not the library,
 * sits apart at the bottom with the account: who is on it, and how it uses the Hub.
 */
export function Shell({
  member,
  active,
  counts,
  admin = false,
  children,
}: {
  /** The signed-in member, or null on pages shown to people who are not let in. */
  member: Member | null;
  active: Section;
  /** How many of each thing the Hub holds, shown next to the nav entries. */
  counts?: LibraryCounts;
  /** Admins also get the page where people are added to the team. */
  admin?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="app">
      <aside className="side" aria-label="Navigation">
        <Link href="/" className="brand">
          <span className="mark" aria-hidden="true" />
          Harness Hub
        </Link>

        <nav aria-label="Library" className="navlist">
          {counts &&
            (
              [
                ["harnesses", "/", "Harnesses", counts.harnesses],
                ["skills", "/skills", "Skills", counts.skill],
                ["tools", "/tools", "Tools", counts.tool],
                ["hooks", "/hooks-memory", "Hooks and memory", counts.hook + counts.memory],
              ] as const
            ).map(([key, href, label, n]) => (
              <Link
                key={key}
                href={href}
                className={`nav${active === key ? " on" : ""}`}
                aria-current={active === key ? "page" : undefined}
              >
                {label}
                <span className="cnt">{n}</span>
              </Link>
            ))}
          <Link
            href="/connect"
            className={`nav navbox${active === "connect" ? " on" : ""}`}
            aria-current={active === "connect" ? "page" : undefined}
          >
            Connect an agent
            <span aria-hidden="true">→</span>
          </Link>
        </nav>

        {member && (
          <div className="sidefoot">
            {counts && (
              <nav aria-label="Team" className="navlist team">
                <div className="navh">Team</div>
                <Link href="/stats" className={`nav quiet${active === "stats" ? " on" : ""}`} aria-current={active === "stats" ? "page" : undefined}>
                  Stats
                </Link>
                {/* Admins also get the page where people are added to the team. */}
                {admin && (
                  <Link href="/members" className={`nav quiet${active === "members" ? " on" : ""}`} aria-current={active === "members" ? "page" : undefined}>
                    Members
                  </Link>
                )}
              </nav>
            )}
            <div className="mono mu" style={{ padding: "0 8px", overflowWrap: "anywhere" }}>
              Signed in as {member.email}
            </div>
            <SignOutButton>
              <button type="button" className="btn">
                Sign out
              </button>
            </SignOutButton>
          </div>
        )}
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
