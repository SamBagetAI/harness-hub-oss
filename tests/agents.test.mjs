import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mayUse } from "../src/lib/hub/access.ts";

describe("what a connected agent may do", () => {
  it("an agent that may write uses every tool", () => {
    assert.equal(mayUse("write", { writes: false }), true);
    assert.equal(mayUse("write", { writes: true }), true);
  });
  it("a read-only agent reads, and still reports its runs, but changes nothing", () => {
    assert.equal(mayUse("read", { writes: false }), true);
    assert.equal(mayUse("read", { writes: true, reportsRun: true }), true);
    assert.equal(mayUse("read", { writes: true }), false);
    // Saving the person's values is a write too: a value can point a later run that writes at another place.
  });
});
