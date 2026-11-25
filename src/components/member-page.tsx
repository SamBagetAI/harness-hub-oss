import { SignInButton, SignOutButton } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { Shell, type Section } from "@/components/shell";
import type { Member } from "@/lib/hub/members";
import { session } from "@/lib/hub/session";
import { everything } from "@/lib/hub/read";
import { libraryCounts } from "@/lib/hub/library";
import { isAdmin } from "@/lib/hub/people";
import type { HarnessView } from "@/lib/hub/types";

/**
 * Every dashboard page is rendered through this. It is the page-side twin of
 * forMembers in the connector: it works out who is looking, shows the sign-in
 * or "not on the list" view to everyone who is not a member, and only then
 * renders the page's own content. A page written with it cannot
 * show Hub content to someone who is merely signed in.
 */
export async function MemberPage({
  active,
  render,
}: {
  active: Section;
  /** The page's content, given who is looking and what the Hub holds. */
  render: (ctx: {
    member: Member;
    /** Every harness, latest version, with the text of its pieces filled in. */
    harnesses: HarnessView[];
    /** Every piece, latest version. */
    pieces: HarnessView[];
    /** Whether the viewer can add people to the team. */
    admin: boolean;
  }) => ReactNode | Promise<ReactNode>;
}) {
  const s = await session();

  if (s.state === "signed-out") {
    return (
      <Shell member={null} active={active}>
        <h1 className="h1">Harness Hub</h1>
        <p className="mu" style={{ maxWidth: 560 }}>
          Where your team keeps its harnesses. A harness is everything that makes an agent run:
          its goal, its prompt, and its skills, tools, hooks and memory. It is not tied to one
          platform: Claude, Codex, ChatGPT, Gemini or any other agent can run it. One teammate
          saves it once. The others run it with their own agent and their own accounts. Sign in
          with the Google
          account your team uses for Harness Hub.
        </p>
        <div>
          <SignInButton>
            <button type="button" className="btn pri">
              Sign in with Google
            </button>
          </SignInButton>
        </div>
      </Shell>
    );
  }

  if (s.state === "not-allowed") {
    return (
      <Shell member={null} active={active}>
        <h1 className="h1">This account is not on the list</h1>
        <div className="notice bad" role="alert" style={{ maxWidth: 640 }}>
          {s.blocked ? (
            <p>This account has been blocked from Harness Hub.</p>
          ) : s.email ? (
            <p>
              You are signed in as <strong>{s.email}</strong>, which is not one of the addresses
              allowed into Harness Hub.
            </p>
          ) : (
            <p>The account you signed in with has no verified email address.</p>
          )}
          <p style={{ marginTop: 8 }}>
            Sign out and sign in again with your work Google account. If this is your work
            account, ask the person who runs Harness Hub to add this address.
          </p>
        </div>
        <div>
          <SignOutButton>
            <button type="button" className="btn pri">
              Sign out
            </button>
          </SignOutButton>
        </div>
      </Shell>
    );
  }

  const { harnesses, pieces } = await everything(s.member);
  const admin = isAdmin(s.member);
  return (
    <Shell member={s.member} active={active} counts={libraryCounts(harnesses, pieces)} admin={admin}>
      {await render({ member: s.member, harnesses, pieces, admin })}
    </Shell>
  );
}
