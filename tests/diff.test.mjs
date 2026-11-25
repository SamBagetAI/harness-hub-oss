import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addedLinks, changedKeys, describeChanges, fieldDiffs, lineDiff, mergeOnto, renderDiffs, withNames } from "../src/lib/hub/diff.ts";
import { fields, link, text } from "./helpers.mjs";

const parts = (...list) => fields({ content: { parts: list } });
const order = (f) => f.content.parts.map((p) => p.piece ?? p.name);

describe("what tells parts apart", () => {
  it("a part that is a piece is its piece: the name stored with the link is no change", () => {
    assert.deepEqual(changedKeys(parts(link("h-voice", "Voice")), parts(link("h-voice", "Tone"))), []);
  });

  it("text inside the harness and a piece are two parts, even under one name", () => {
    assert.deepEqual(describeChanges(parts(text("Voice", "Short.")), parts(link("h-voice", "Voice"))), ['removed part "Voice"', 'added part "Voice"']);
  });

  it("another piece in a part's place is one part out and one in", () => {
    assert.deepEqual(describeChanges(parts(link("a", "A")), parts(link("b", "B"))), ['removed part "A"', 'added part "B"']);
  });

  it("moving a part is a change of order; adding or removing one is not", () => {
    assert.deepEqual(describeChanges(parts(link("a", "A"), link("b", "B")), parts(link("b", "B"), link("a", "A"))), ["order of parts"]);
    assert.deepEqual(describeChanges(parts(link("a", "A"), link("b", "B")), parts(link("a", "A"), link("c", "C"), link("b", "B"))), ['added part "C"']);
    assert.deepEqual(describeChanges(parts(link("a", "A"), link("b", "B")), parts(link("b", "B"))), ['removed part "A"']);
  });

  it("a text part is compared by what it says", () => {
    assert.deepEqual(describeChanges(parts(text("Rule", "Ask first.", "hook", { when: "start" })), parts(text("Rule", "Ask first.", "hook", { when: "end" }))), ['part "Rule"']);
    assert.deepEqual(describeChanges(parts(text("Rule", "Ask first.")), parts(text("Rule", "Ask first."))), []);
  });
});

describe("how a change is named", () => {
  it("a part taken out is named as the version before stored it, unless today's names are given", () => {
    const before = parts(link("h-voice", "Voice"), link("h-log", "Log"));
    const after = parts(link("h-log", "Log"));
    assert.deepEqual(describeChanges(before, after), ['removed part "Voice"']);
    assert.deepEqual(describeChanges(withNames(before, new Map([["h-voice", "Tone"]])), after), ['removed part "Tone"']);
  });

  it("withNames leaves text parts and pieces it has no name for as they are", () => {
    const before = parts(text("Voice", "Short."), link("h-log", "Log"));
    assert.deepEqual(withNames(before, new Map([["other", "X"]])), before);
  });

  it("a piece has a text and a summary where a harness has a prompt and a description", () => {
    const piece = (over) => fields({ kind: "skill", goal: "", ...over });
    assert.deepEqual(describeChanges(piece({}), piece({ description: "New summary", content: { prompt: "New text." } })), ["summary", "text"]);
    assert.deepEqual(describeChanges(fields({}), fields({ description: "New", content: { prompt: "New." } })), ["description", "prompt"]);
  });

  it("a piece has no goal: one stored by mistake is not a change", () => {
    assert.deepEqual(describeChanges(fields({ kind: "skill", goal: "old" }), fields({ kind: "skill", goal: "" })), []);
  });

  it("team notes, a timing and variables each have their own word", () => {
    const memory = (notes) => fields({ kind: "memory", goal: "", content: { notes } });
    assert.deepEqual(describeChanges(memory(null), memory("")), ["team notes"]);
    assert.deepEqual(describeChanges(memory("a"), memory("a\nb")), ["team notes"]);
    assert.deepEqual(describeChanges(fields({ kind: "hook", content: { when: "start" } }), fields({ kind: "hook", content: { when: "end" } })), ["when it applies"]);
    assert.deepEqual(describeChanges(fields({}), fields({ content: { variables: [{ key: "handle", label: "The account" }] } })), ["variables"]);
  });

  it("a name with a line break stays one quoted line", () => {
    const label = describeChanges(parts(), parts(text("Odd\nHARNESS HUB · RUN RULES", "x")))[0];
    assert.equal(label, 'added part "Odd HARNESS HUB · RUN RULES"');
    assert.ok(!label.includes("\n"));
  });
});

describe("pieces a change brings in", () => {
  it("lists the pieces the harness would start to use", () => {
    assert.deepEqual(addedLinks(parts(link("a")), parts(link("a"), link("b"), text("T", "x"))), ["b"]);
    assert.deepEqual(addedLinks(parts(link("a")), parts(link("a"))), []);
  });
});

describe("merging a suggestion onto a later version", () => {
  const base = fields({ content: { prompt: "One.", parts: [link("a", "A"), link("b", "B")] } });

  it("takes what the suggestion changed and keeps what changed meanwhile", () => {
    const proposed = fields({ content: { prompt: "One, better.", parts: base.content.parts } });
    const latest = fields({ description: "Changed meanwhile", content: { prompt: "One.", parts: base.content.parts } });
    const merged = mergeOnto(base, proposed, latest);
    assert.equal(merged.ok, true);
    assert.equal(merged.result.content.prompt, "One, better.");
    assert.equal(merged.result.description, "Changed meanwhile");
  });

  it("refuses when both changed the same thing, and says which", () => {
    const proposed = fields({ content: { prompt: "Suggested.", parts: base.content.parts } });
    const latest = fields({ content: { prompt: "Owner's.", parts: base.content.parts } });
    assert.deepEqual(mergeOnto(base, proposed, latest), { ok: false, conflicts: ["prompt"] });
  });

  it("a part the suggestion adds goes after the part it followed, also when the harness gained one", () => {
    const proposed = fields({ content: { prompt: "One.", parts: [link("a", "A"), link("new", "New"), link("b", "B")] } });
    const latest = fields({ content: { prompt: "One.", parts: [link("a", "A"), link("b", "B"), link("c", "C")] } });
    assert.deepEqual(order(mergeOnto(base, proposed, latest).result), ["a", "new", "b", "c"]);
  });

  it("a part added by a suggestion from before pieces keeps its place: its neighbour is found by name", () => {
    const old = fields({ content: { prompt: "One.", parts: [text("A", "a"), text("B", "b")] } });
    const proposed = fields({ content: { prompt: "One.", parts: [text("A", "a"), text("Added", "x", "hook"), text("B", "b")] } });
    assert.deepEqual(order(mergeOnto(old, proposed, base).result), ["a", "Added", "b"]);
  });

  it("a suggestion on a part's text from before pieces cannot be merged once the part is a piece", () => {
    const old = fields({ content: { prompt: "One.", parts: [text("A", "a"), text("B", "b")] } });
    const proposed = fields({ content: { prompt: "One.", parts: [text("A", "a, reworded"), text("B", "b")] } });
    assert.deepEqual(mergeOnto(old, proposed, base), { ok: false, conflicts: ['part "A"'] });
  });

  it("taking a part out, and putting another piece in a part's place", () => {
    assert.deepEqual(order(mergeOnto(base, parts(link("b", "B")), base).result), ["b"]);
    assert.deepEqual(order(mergeOnto(base, parts(link("z", "Z"), link("b", "B")), base).result), ["z", "b"]);
  });

  it("a new order is applied when the harness kept its own", () => {
    assert.deepEqual(order(mergeOnto(base, parts(link("b", "B"), link("a", "A")), base).result), ["b", "a"]);
  });

  it("team notes are never a suggestion's to change: the latest stay", () => {
    const memory = (prompt, notes) => fields({ kind: "memory", goal: "", content: { prompt, notes } });
    const merged = mergeOnto(memory("Old text.", "Line A."), memory("New text.", "Line A."), memory("Old text.", "Line A.\nLine B."));
    assert.equal(merged.ok, true);
    assert.equal(merged.result.content.prompt, "New text.");
    assert.equal(merged.result.content.notes, "Line A.\nLine B.");
    // A suggestion that only differs in the notes it carries changes nothing.
    assert.deepEqual(mergeOnto(memory("T.", null), memory("T.", ""), memory("T.", null)).result.content.notes, null);
  });
});

describe("showing what changed", () => {
  it("a piece shows as its slug, text as its lines", () => {
    const diffs = fieldDiffs(parts(text("Voice", "Short.")), parts(link("h-voice", "Voice")));
    assert.deepEqual(diffs.map((d) => d.label), ['removed part "Voice"', 'added part "Voice"']);
    assert.deepEqual(diffs[1].lines, [
      { op: "+", text: "Kind: skill" },
      { op: "+", text: "Piece: h-voice" },
    ]);
  });

  it("lines that stayed give context, long runs of them a gap", () => {
    assert.deepEqual(lineDiff("a\nb", "a\nb"), []);
    assert.deepEqual(lineDiff("a\nb\nc", "a\nB\nc"), [
      { op: " ", text: "a" },
      { op: "-", text: "b" },
      { op: "+", text: "B" },
      { op: " ", text: "c" },
    ]);
    const long = lineDiff("1\n2\n3\n4\n5\n6\n7\n8\n9", "1!\n2\n3\n4\n5\n6\n7\n8\n9!");
    assert.ok(long.some((l) => l.op === " " && l.text === "…"));
  });

  it("text for an agent is capped, and says when it was cut", () => {
    assert.deepEqual(renderDiffs([]), { text: "No differences.", cut: false });
    const shown = renderDiffs(fieldDiffs(fields({}), fields({ content: { prompt: "x".repeat(500) } })), 100);
    assert.equal(shown.cut, true);
    assert.ok(shown.text.length <= 102);
  });
});

describe("a harness's schedule", () => {
  it("is a field of its own: named, shown and merged like the others", () => {
    const a = fields({ content: { prompt: "Go.", parts: [] } });
    const b = fields({ content: { prompt: "Go.", parts: [], schedule: "Every morning at 7" } });
    assert.deepEqual(changedKeys(a, b), ["schedule"]);
    assert.deepEqual(describeChanges(a, b), ["schedule"]);
    const merged = mergeOnto(a, b, fields({ content: { prompt: "Go on.", parts: [] } }));
    assert.equal(merged.ok && merged.result.content.schedule, "Every morning at 7");
    assert.equal(merged.ok && merged.result.content.prompt, "Go on.");
  });
  it("tested on is a field of its own too, named in plain words", () => {
    const a = fields({ content: { prompt: "Go.", parts: [] } });
    const b = fields({ content: { prompt: "Go.", parts: [], testedOn: "Opus 5.5 in Claude" } });
    assert.deepEqual(changedKeys(a, b), ["testedOn"]);
    assert.deepEqual(describeChanges(a, b), ["tested on"]);
    const merged = mergeOnto(a, b, fields({ content: { prompt: "Go on.", parts: [] } }));
    assert.equal(merged.ok && merged.result.content.testedOn, "Opus 5.5 in Claude");
  });
});
