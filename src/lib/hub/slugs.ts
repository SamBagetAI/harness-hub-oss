import { SLUG } from "./safe-text";

/** Slugs made from names: for a piece, and for a piece made for a harness. They read nothing from the database. */

/**
 * How much of a harness's slug leads the slugs of the pieces made for it. A
 * slug holds 80 characters: a harness with a very long one keeps this much of
 * it, so that the part's own name always fits behind.
 */
export const headOf = (harness: string) => harness.slice(0, 52).replace(/-+$/, "");

/** The slug of a piece made for a harness: the harness's own slug, then the part's name. */
export function madeSlug(harness: string, name: string, taken: Set<string>): string | null {
  const stem = `${headOf(harness)}-${slugOf(name)}`.slice(0, 76).replace(/-+$/, "");
  for (let n = 1; n <= 30; n++) {
    const slug = n === 1 ? stem : `${stem}-${n}`;
    if (SLUG.test(slug) && !taken.has(slug)) return slug;
  }
  return null;
}

/** A slug made from a name: "Inbox notes" gives "inbox-notes". */
export function slugOf(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "piece";
}
