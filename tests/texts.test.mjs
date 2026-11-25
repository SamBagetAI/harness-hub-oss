import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SERVER_INSTRUCTIONS, TOOLS } from "../src/lib/hub/texts.ts";

const tools = Object.values(TOOLS);

describe("what the connector tells agents about its tools", () => {
  it("names every tool once, with the harness_hub_ prefix, a title and a description", () => {
    const names = tools.map((t) => t.name);
    assert.equal(new Set(names).size, names.length);
    for (const t of tools) {
      assert.match(t.name, /^harness_hub_[a-z_]+$/);
      assert.ok(t.title.length > 0 && t.description.length > 0, t.name);
    }
  });

  it("points agents at every tool that does what the website does", () => {
    for (const name of ["harness_hub_archive", "harness_hub_set_editor", "harness_hub_mark_run", "harness_hub_team"]) {
      assert.ok(SERVER_INSTRUCTIONS.includes(name), name);
    }
    // Whether an agent may write stays the person's, on the website: no tool sets it.
    assert.ok(!tools.some((t) => /access|read-only/i.test(t.name)));
  });

  it("makes every tool that changes something wait for the person's own ask", () => {
    for (const key of ["archive", "editor", "markRun", "team"]) {
      assert.ok(TOOLS[key].description.includes("only when the person"), key);
      assert.ok(TOOLS[key].description.includes("Never"), key);
    }
    // A run is dealt with once a person looked at it: the agent never decides that.
    assert.ok(TOOLS.markRun.description.includes("Never mark a run on your own judgment"));
  });
});
