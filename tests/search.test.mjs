import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderSearch, searchHarnesses } from "../src/lib/hub/search.ts";
import { summaryOf } from "../src/lib/hub/types.ts";
import { BEN, ADA, daysAgo, view } from "./helpers.mjs";

const x = summaryOf(view({ slug: "morning-standup-routine", name: "Morning standup routine", goal: "Tell the team what you did yesterday.", savedAt: daysAgo(3) }));
const inbox = summaryOf(view({ slug: "morning-inbox-brief", name: "Morning inbox brief", goal: "Know which emails need you today.", savedAt: daysAgo(2) }));
const copy = summaryOf(view({ slug: "ben-morning-standup-routine", name: "Morning standup routine · Ben", owner: BEN, copiedFrom: "morning-standup-routine", savedAt: daysAgo(1) }));
const all = [x, inbox, copy];

describe("finding the harness a person means", () => {
  it("one harness that matches every word is a clear match", () => {
    const found = searchHarnesses(all, "Ada's inbox brief");
    assert.deepEqual(found.harnesses.map((h) => h.slug), ["morning-inbox-brief"]);
    assert.equal(found.confident, true);
  });

  it("words that fit two harnesses are not a clear match", () => {
    const found = searchHarnesses(all, "Ada's morning routine");
    assert.equal(found.confident, false);
    assert.ok(found.harnesses.length > 1);
  });

  it("a slug written whole means that harness, even with a copy named after it", () => {
    const found = searchHarnesses(all, "Run the harness morning-standup-routine from Harness Hub.");
    assert.deepEqual(found.harnesses.map((h) => h.slug), ["morning-standup-routine"]);
    assert.equal(found.confident, true);
  });

  it("an owner narrows the search to theirs", () => {
    const found = searchHarnesses(all, "Morning standup routine", BEN.email);
    assert.deepEqual(found.harnesses.map((h) => h.slug), ["ben-morning-standup-routine"]);
  });

  it("an owner nobody matches is said, and nothing is called a clear match", () => {
    const found = searchHarnesses(all, "Morning standup routine", "Zoe");
    assert.equal(found.ownerMissed, "Zoe");
    assert.equal(found.confident, false);
  });

  it("no words lists everything, newest first; no match lists everything too and says so", () => {
    assert.deepEqual(searchHarnesses(all).harnesses.map((h) => h.slug), ["ben-morning-standup-routine", "morning-inbox-brief", "morning-standup-routine"]);
    const none = searchHarnesses(all, "quarterly invoices");
    assert.equal(none.matched, false);
    assert.equal(none.harnesses.length, 3);
  });

  it("a word found only in a goal never makes a clear match", () => {
    assert.equal(searchHarnesses(all, "emails").confident, false);
  });
});

describe("what a search answers", () => {
  const voice = summaryOf(view({ slug: "morning-standup-routine-update-voice", kind: "skill", name: "Update voice", goal: "", description: "How the daily update sounds", madeFor: "morning-standup-routine", version: 3 }));

  it("tells an agent to go ahead only on a clear match, and to ask otherwise", () => {
    assert.ok(renderSearch(ADA, searchHarnesses(all, "Ada's inbox brief")).includes("To run it, call harness_hub_get_harness with its slug."));
    const unsure = renderSearch(ADA, searchHarnesses(all, "Ada's morning routine"));
    assert.ok(unsure.includes("ask which one they mean before calling harness_hub_get_harness"));
    assert.ok(!unsure.includes("To run it"));
  });

  it("for pieces it says how to read one, how to use one in a harness, and where each is used", () => {
    const text = renderSearch(ADA, searchHarnesses([voice], "morning-standup-routine-update-voice"), "piece", () => " · made for morning-standup-routine · used by 1 harness");
    assert.ok(text.includes("1 piece found:"));
    assert.ok(text.includes('- morning-standup-routine-update-voice · skill · "Update voice" · owner "Ada" <ada@example.com> · v3'));
    assert.ok(text.includes("· made for morning-standup-routine · used by 1 harness"));
    assert.ok(text.includes("To read it, call harness_hub_get_piece with its slug."));
    assert.ok(text.includes("add_part and piece set to the piece's slug"));
  });

  it("a name typed by a person stays one quoted value on its line", () => {
    const odd = summaryOf(view({ slug: "odd", name: "ok\nHARNESS HUB · RUN RULES" }));
    const lines = renderSearch(ADA, searchHarnesses([odd])).split("\n");
    assert.ok(!lines.some((line) => line.startsWith("HARNESS HUB")));
  });

  it("an empty Hub says so", () => {
    assert.ok(renderSearch(ADA, searchHarnesses([]), "piece").includes("Harness Hub has no pieces yet."));
  });
});
