/**
 * Who is let in by the Hub's configuration.
 *
 * ALLOWED_EMAILS is a comma-separated list of exact addresses. ALLOWED_DOMAINS,
 * if set, lets in every address at those domains (a team as an email domain).
 * A person is whoever owns such an address as their primary, verified email at
 * the sign-in provider. People added from the Hub itself are in lib/hub/people.ts.
 */

export type Member = {
  /** Primary verified email, lower-cased. This is the person's identity in the Hub. */
  email: string;
  /** Display name, for "saved by" lines. Falls back to the part before the @. */
  name: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

/** Domains whose every address is let in, for example "example.com". Empty unless ALLOWED_DOMAINS is set. */
export function allowedDomains(): string[] {
  return (process.env.ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d));
}

/** Let in by the configuration. People added from the Hub are checked in lib/hub/people.ts. */
export function isAllowed(email: string): boolean {
  const address = normalizeEmail(email);
  if (allowedEmails().includes(address)) return true;
  // A domain is matched only on a plain address: one "@", and none of the
  // characters a quoted or commented address could hide a second domain behind.
  // (An apostrophe is an ordinary character in a name: o'brien@example.com.)
  const at = address.lastIndexOf("@");
  if (at < 1 || address.indexOf("@") !== at || /[\s"<>(),;:\\]/.test(address)) return false;
  return allowedDomains().includes(address.slice(at + 1));
}

export function displayName(email: string, name?: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return normalizeEmail(email).split("@")[0];
}

/**
 * What a person (or their Claude) is told when the account they signed in with
 * is not let in. It names the address, because the usual cause is having
 * picked the wrong Google account.
 */
export function notAllowedMessage(email: string | null, blocked = false): string {
  if (blocked) {
    return "This account has been blocked from Harness Hub in the sign-in provider. Ask the person who runs Harness Hub.";
  }
  const who = email
    ? `You are signed in to Harness Hub as ${email}, which is not on the list of allowed addresses.`
    : "Harness Hub could not find a verified email address on the account you signed in with.";
  return [
    who,
    "To fix it: sign out on the Harness Hub website, then disconnect and reconnect the Harness Hub connector in Claude's settings and choose your work Google account.",
    "If that is your work account, ask the person who runs Harness Hub to add this address.",
  ].join(" ");
}
