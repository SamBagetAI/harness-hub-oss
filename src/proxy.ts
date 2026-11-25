import { clerkMiddleware } from "@clerk/nextjs/server";
import { hubUrl } from "@/lib/hub/config";

/**
 * Clerk runs on the dashboard pages so they can read the signed-in person.
 *
 * It must NOT run on the connector endpoint or on the /.well-known documents:
 * Claude needs /api/mcp to answer an unauthenticated request with its own 401
 * and a pointer to the sign-in metadata, never with a redirect to a sign-in
 * page. Those two paths are therefore left out of the matcher, and /api/mcp
 * checks its own tokens (see lib/mcp-auth.ts).
 *
 * clerkMiddleware() on its own protects nothing and redirects nobody. Each
 * page decides who may see it through lib/hub/session.ts.
 *
 * authorizedParties: a browser session only counts if it was started on the
 * Hub's own address. Without it, a session token obtained on any other site
 * that uses the same Clerk application would be accepted here.
 */
export default clerkMiddleware(() => {}, () => ({ authorizedParties: [hubUrl()] }));

export const config = {
  matcher: [
    // Everything except: the connector, /.well-known, Next internals, static files.
    "/((?!api/mcp|\\.well-known|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/(.*)",
  ],
};
