import { currentUser } from "@clerk/nextjs/server";
import { admit, identityOf } from "./clerk";
import { isLocalDev } from "./config";
import { displayName, normalizeEmail, type Member } from "./members";
import { isMember } from "./people";

/**
 * Who is looking at the dashboard.
 *
 * Every page asks this before showing anything. "Signed in" is not enough:
 * anyone with a Google account can sign in to the Clerk application, so a
 * page shows Hub content only for the "member" state.
 */
export type Session =
  | { state: "signed-out" }
  | { state: "not-allowed"; email: string | null; blocked: boolean }
  | { state: "member"; member: Member };

export async function session(): Promise<Session> {
  // Local development only: DEV_SESSION_EMAIL stands in for a signed-in person,
  // so the pages can be looked at without a Google sign-in. isLocalDev() is
  // false in every production build and whenever HUB_URL is not a local address.
  const devEmail = isLocalDev() ? process.env.DEV_SESSION_EMAIL?.trim() : undefined;
  if (devEmail) {
    const email = normalizeEmail(devEmail);
    return (await isMember(email))
      ? { state: "member", member: { email, name: displayName(email) } }
      : { state: "not-allowed", email, blocked: false };
  }

  const user = await currentUser();
  if (!user) return { state: "signed-out" };

  const identity = await admit(identityOf(user));
  if (identity.allowed) return { state: "member", member: identity.member };
  return { state: "not-allowed", email: identity.email, blocked: identity.blocked === true };
}
