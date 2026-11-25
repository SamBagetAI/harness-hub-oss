import { verifyClerkToken } from "@clerk/mcp-tools/server";
import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
} from "@modelcontextprotocol/server";
import { clerk, identityForUserId, type Identity } from "@/lib/hub/clerk";
import { isLocalDev, isLocalHost, mcpUrl } from "@/lib/hub/config";
import {
  displayName,
  normalizeEmail,
  notAllowedMessage,
  type Member,
} from "@/lib/hub/members";
import { isMember } from "@/lib/hub/people";

/**
 * Who is calling the connector.
 *
 * Step 1, verifyToken: is this a real access token, issued by our Clerk
 * application, for this exact connector address? Runs before any tool.
 * Step 2, callerOf: which person is it, and are they on the list? Runs inside
 * each tool, so that a person who signed in with the wrong Google account gets
 * a sentence explaining what happened instead of an endless sign-in loop.
 *
 * Every refusal writes one log line saying why. The token itself is never
 * logged and never passed on to a tool.
 */

function log(level: "warn" | "error", entry: Record<string, unknown>) {
  console[level](JSON.stringify({ at: "mcp-auth", ok: false, ...entry }));
}

const TOKEN_REFUSED = "The access token is invalid or has expired";
const PROVIDER_FAULT = "Harness Hub could not check the token with its sign-in provider. Try again shortly.";

/**
 * Refusals that say something is wrong on our side (Clerk unreachable or
 * rate-limiting, or our own secret key rejected), not with the token. They are
 * answered as a server error, so Claude does not throw away a good token and
 * send the person through sign-in again.
 */
const OUR_FAULT = new Set<string>(["unexpected-error", "secret-key-invalid"]);

// ---------------------------------------------------------------------------
// Test identities, for `next dev` on a developer's machine only.
// "Authorization: Bearer dev:someone@example.com" is accepted when that address
// is listed in DEV_IDENTITY_EMAILS, the Hub is configured with a local address
// (isLocalDev), and the request itself was addressed to localhost. In any other
// situation such a token is treated like every other unknown token.
// ---------------------------------------------------------------------------
const DEV_PREFIX = "dev:";

function devEmails(): string[] {
  return (process.env.DEV_IDENTITY_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

function addressedToLocalhost(req: Request): boolean {
  try {
    const host = req.headers.get("host");
    const hostname = host ? new URL(`http://${host}`).hostname : new URL(req.url).hostname;
    return isLocalHost(hostname);
  } catch {
    return false;
  }
}

/**
 * Passed to withMcpAuth. Returning undefined means "no credentials": the
 * caller gets a 401 that points Claude at the sign-in metadata.
 */
export async function verifyToken(
  req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  if (bearerToken.startsWith(DEV_PREFIX) && isLocalDev() && addressedToLocalhost(req)) {
    const email = normalizeEmail(bearerToken.slice(DEV_PREFIX.length));
    if (!devEmails().includes(email)) {
      throw new OAuthError(OAuthErrorCode.InvalidToken, "Unknown test identity");
    }
    return {
      token: "dev",
      clientId: "local-dev",
      scopes: ["profile", "email"],
      extra: { devEmail: email },
    };
  }

  // Clerk checks the signature or looks the token up, checks expiry, and checks
  // that the token was issued for this connector address (the audience). Without
  // the audience option that last check is skipped.
  const audience = mcpUrl();
  const state = await clerk()
    .authenticateRequest(req, { acceptsToken: "oauth_token", audience })
    .catch((error: unknown) => {
      log("error", {
        step: "verify",
        reason: "sign-in provider call failed",
        message: error instanceof Error ? error.message : String(error),
      });
      throw new OAuthError(OAuthErrorCode.ServerError, PROVIDER_FAULT);
    });

  if (!state.isAuthenticated) {
    // The reason says exactly what was wrong: audience mismatch, expired, wrong
    // token type, our secret key rejected, Clerk unreachable. It is what makes a
    // failed first connection diagnosable from the logs.
    log("warn", {
      step: "verify",
      reason: state.reason,
      message: state.message,
      expectedAudience: audience,
    });
    if (OUR_FAULT.has(state.reason)) {
      throw new OAuthError(OAuthErrorCode.ServerError, PROVIDER_FAULT);
    }
    throw new OAuthError(OAuthErrorCode.InvalidToken, TOKEN_REFUSED);
  }

  const authInfo = verifyClerkToken(state.toAuth(), bearerToken);
  if (!authInfo) {
    log("warn", { step: "verify", reason: "token has no client, scopes or user" });
    throw new OAuthError(OAuthErrorCode.InvalidToken, TOKEN_REFUSED);
  }
  // Tools never need the raw token, so it is not passed on.
  return { ...authInfo, token: "redacted" };
}

export type Caller =
  /** `client` is the OAuth client that obtained the token: which app is calling on the person's behalf. */
  | { ok: true; member: Member; client: string }
  | { ok: false; email: string | null; client: string | null; message: string };

/** The part of a tool's context that carries the verified token. */
export type ToolContext = { http?: { authInfo?: AuthInfo } };

export async function callerOf(ctx: ToolContext): Promise<Caller> {
  const authInfo = ctx.http?.authInfo;
  if (!authInfo) {
    return { ok: false, email: null, client: null, message: "Not signed in to Harness Hub." };
  }
  const client = authInfo.clientId;
  const extra = authInfo.extra ?? {};

  let identity: Identity;
  if (isLocalDev() && client === "local-dev" && typeof extra.devEmail === "string") {
    const email = extra.devEmail;
    identity = (await isMember(email))
      ? { allowed: true, member: { email, name: displayName(email) } }
      : { allowed: false, email };
  } else if (extra.verifiedBy === "clerk" && typeof extra.userId === "string") {
    try {
      identity = await identityForUserId(extra.userId);
    } catch (error) {
      // Access stays closed. Say so in words, and leave a trace.
      log("error", {
        step: "user-lookup",
        userId: extra.userId,
        status: (error as { status?: number } | null)?.status ?? null,
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        ok: false,
        email: null,
        client,
        message:
          "Harness Hub could not check your account with its sign-in provider just now. Try again in a minute.",
      };
    }
  } else {
    return {
      ok: false,
      email: null,
      client,
      message: "Harness Hub could not tell who is calling.",
    };
  }

  if (identity.allowed) return { ok: true, member: identity.member, client };
  return {
    ok: false,
    email: identity.email,
    client,
    message: notAllowedMessage(identity.email, identity.blocked === true),
  };
}
