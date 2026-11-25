import { createClerkClient } from "@clerk/nextjs/server";
import { displayName, isAllowed, normalizeEmail, type Member } from "./members";
import { invited, isMember } from "./people";

/**
 * The only place that talks to Clerk about people.
 *
 * Both doors use it: the dashboard (a browser session) and the connector (an
 * OAuth token from Claude). Either way a Clerk user becomes a Hub member by
 * the same rule: not banned or locked in Clerk, primary email verified, and
 * that email on the list.
 */

type ClerkClient = ReturnType<typeof createClerkClient>;
let client: ClerkClient | undefined;

/**
 * A Clerk client built from the environment keys. Unlike `clerkClient()` it
 * does not depend on Clerk's proxy having run, which matters because /api/mcp
 * is deliberately outside the proxy.
 */
export function clerk(): ClerkClient {
  if (!client) {
    client = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      // This client is built by hand, so it does not read the
      // NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED setting. Switch telemetry off here too.
      telemetry: { disabled: true },
    });
  }
  return client;
}

/** The parts of a Clerk user the Hub looks at. */
export type ClerkPerson = {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  /** Set in the Clerk dashboard. Either one shuts the person out of the Hub at once. */
  banned: boolean;
  locked: boolean;
  primaryEmailAddress: {
    emailAddress: string;
    verification: { status: string } | null;
  } | null;
};

export type Identity =
  | { allowed: true; member: Member }
  /**
   * Signed in, but not let in. `email` is null when the account has no
   * verified primary address. `blocked` means the account is banned or locked
   * in Clerk, whatever the list says. `candidate` is who they would be if an
   * admin had added their address from the Hub: see `admit`.
   */
  | { allowed: false; email: string | null; blocked?: true; candidate?: Member };

/** Primary address, only if Clerk has verified it. Extra or unverified addresses never count. */
export function identityOf(person: ClerkPerson): Identity {
  const primary = person.primaryEmailAddress;
  const verified = primary?.verification?.status === "verified";
  const email = primary && verified ? normalizeEmail(primary.emailAddress) : null;

  if (person.banned || person.locked) return { allowed: false, email, blocked: true };
  if (!email) return { allowed: false, email };

  const fullName = [person.firstName, person.lastName].filter(Boolean).join(" ");
  const member = { email, name: displayName(email, fullName || person.username) };
  return isAllowed(email) ? { allowed: true, member } : { allowed: false, email, candidate: member };
}

/** Lets in someone the configuration does not name, if an admin added their address from the Hub. */
export async function admit(identity: Identity): Promise<Identity> {
  if (identity.allowed || !identity.candidate) return identity;
  return (await invited()).has(identity.candidate.email) ? { allowed: true, member: identity.candidate } : identity;
}

// Connector calls arrive with a Clerk user id only. Looking the person up costs
// one Clerk API call, so a positive answer is kept for a few minutes per server
// instance. The allow-list itself is re-read on every call, so a change to it
// applies as soon as the running deployment has it. What the cache delays, by at
// most TTL_MS, is a change made on Clerk's side: a ban, a lock, a new primary
// address. Refusals are never cached, so fixing an account takes effect at once.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; member: Member }>();

export async function identityForUserId(userId: string): Promise<Identity> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && now - hit.at < TTL_MS) {
    return (await isMember(hit.member.email))
      ? { allowed: true, member: hit.member }
      : { allowed: false, email: hit.member.email };
  }

  // Drop whatever has expired, so the map cannot grow without bound.
  for (const [id, entry] of cache) {
    if (now - entry.at >= TTL_MS) cache.delete(id);
  }

  const user = await clerk().users.getUser(userId);
  const identity = await admit(identityOf(user));
  if (identity.allowed) cache.set(userId, { at: now, member: identity.member });
  return identity;
}
