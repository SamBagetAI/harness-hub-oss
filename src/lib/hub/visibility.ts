/**
 * Who sees an item. A team item is seen by everyone let into the Hub. A private one only by its owner and the people
 * who can change it: its editors, and for a piece made for a harness, whoever can change that harness. Everyone else
 * gets no sign that it exists. Kept apart from the store so the rule can be tested without a database.
 */
export type Visibility = "team" | "private";

type Seen = { visibility: Visibility; owner: { email: string }; editors: { email: string }[] };

/** Whether this person sees the item. `null` is the Hub itself, which sees everything. */
export function canSee(item: Seen, viewer: { email: string } | null): boolean {
  if (viewer === null || item.visibility === "team") return true;
  return item.owner.email === viewer.email || item.editors.some((e) => e.email === viewer.email);
}

/** A stored value read back: anything but "private" is a team item, as every item was before visibility existed. */
export const visibilityOf = (raw: unknown): Visibility => (raw === "private" ? "private" : "team");
