import { findHarness } from "./read";
import type { Member } from "./members";
import type { HarnessView } from "./types";

/**
 * A harness or a piece by its address, from the lists a page already
 * has. Those lists leave out what is archived, so an archived one is fetched.
 */
export async function locate(viewer: Member, slug: string, lists: { harnesses: HarnessView[]; pieces: HarnessView[] }): Promise<HarnessView | undefined> {
  const wanted = slug.trim().toLowerCase();
  return [...lists.harnesses, ...lists.pieces].find((x) => x.slug === wanted) ?? (await findHarness(viewer, wanted));
}

/** Everyone who owns or last saved something: the people a harness's owner can pick editors from. */
export function peopleIn(items: HarnessView[]): { email: string; name: string }[] {
  const people = new Map<string, string>();
  for (const x of items) {
    people.set(x.owner.email, x.owner.name);
    people.set(x.savedBy.email, x.savedBy.name);
    for (const e of x.editors) people.set(e.email, e.name);
  }
  return [...people].map(([email, name]) => ({ email, name }));
}
