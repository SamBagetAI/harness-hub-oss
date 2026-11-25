import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSee, visibilityOf } from "../src/lib/hub/visibility.ts";

const owner = { email: "sam@example.com" };
const editor = { email: "edith@example.com" };
const other = { email: "olga@example.com" };
const item = (visibility) => ({ visibility, owner, editors: [editor] });

describe("who sees an item", () => {
  it("a team item is seen by everyone", () => {
    assert.equal(canSee(item("team"), other), true);
  });
  it("a private item only by its owner and the people who can change it", () => {
    assert.equal(canSee(item("private"), owner), true);
    assert.equal(canSee(item("private"), editor), true);
    assert.equal(canSee(item("private"), other), false);
  });
  it("the Hub itself sees everything", () => {
    assert.equal(canSee(item("private"), null), true);
  });
  it("anything stored that is not private is a team item, as everything was before", () => {
    assert.equal(visibilityOf("private"), "private");
    assert.equal(visibilityOf(undefined), "team");
    assert.equal(visibilityOf("team"), "team");
  });
});
