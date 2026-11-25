/**
 * Where the Hub lives.
 *
 * Claude compares the URL a person types for the connector with the "resource"
 * in our sign-in metadata, character for character, and Clerk compares it with
 * the audience of every token. So the public address comes from configuration
 * (HUB_URL), in one canonical spelling, and never from the incoming request.
 */

export const MCP_PATH = "/api/mcp";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname.toLowerCase());
}

/**
 * Canonical origin of a configured address: lower-case host, no default port,
 * no path, no trailing slash. A pasted connector address ("…/api/mcp") or a
 * stray slash is therefore harmless. A value that is not a web address at all
 * is a configuration error and says so, instead of quietly publishing a wrong
 * connector address.
 */
function originOf(value: string, source: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${source} must be a full web address such as https://hub.example.com (got ${JSON.stringify(value)})`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${source} must start with https:// (got ${JSON.stringify(value)})`);
  }
  if (process.env.VERCEL && isLocalHost(url.hostname)) {
    throw new Error(`${source} points at ${url.hostname} on Vercel. Set it to the Hub's public address.`);
  }
  return url.origin;
}

let warnedAboutFallback = false;

/** Public origin of the Hub, without a trailing slash. */
export function hubUrl(): string {
  const explicit = process.env.HUB_URL?.trim();
  if (explicit) return originOf(explicit, "HUB_URL");

  // Fallback for a Vercel project where HUB_URL was not set: the project's
  // production domain. Vercel picks it, and it changes when a custom domain is
  // added, which would break every connector added with the old address. So
  // this is only a safety net: set HUB_URL.
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) {
    if (!warnedAboutFallback) {
      warnedAboutFallback = true;
      console.warn(
        JSON.stringify({ at: "config", warning: "HUB_URL is not set; using the Vercel production domain. Set HUB_URL so the connector address cannot change.", using: production }),
      );
    }
    return originOf(`https://${production}`, "VERCEL_PROJECT_PRODUCTION_URL");
  }

  return `http://localhost:${process.env.PORT ?? "3210"}`;
}

/** The exact address people paste into Claude as the connector URL. */
export function mcpUrl(): string {
  return hubUrl() + MCP_PATH;
}

/** Link to a harness on the website. */
export function harnessUrl(slug: string): string {
  return `${hubUrl()}/h/${slug}`;
}

/**
 * True only for `next dev` on a developer's machine, serving a local address.
 * It guards the test identities in lib/mcp-auth.ts. In a production build
 * NODE_ENV is "production", so this is false on Vercel (production and
 * preview) and under `next start`. Pointing HUB_URL at a tunnel or any other
 * public address also switches it off.
 */
export function isLocalDev(): boolean {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) return false;
  try {
    return isLocalHost(new URL(hubUrl()).hostname);
  } catch {
    return false;
  }
}
