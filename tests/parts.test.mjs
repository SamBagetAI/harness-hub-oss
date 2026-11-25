import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blamedParts, partAnchor, partsOfKind, undeclaredNames, variableDefault } from "../src/lib/hub/parts.ts";
import { link, text, view } from "./helpers.mjs";

const content = (prompt, parts = [], variables = []) => ({ prompt, variables, parts });

describe("names in braces that are not variables of the harness", () => {
  it("finds a name the text uses and the harness does not declare, with where it is used", () => {
    const found = undeclaredNames(content("Write to {handle} as {name}.", [{ ...link("h-voice", "Voice"), body: "Sign as {signature}, {name}." }], [{ key: "handle", label: "The account" }]));
    assert.deepEqual(found, [
      { key: "name", where: ["the prompt", "the piece h-voice"] },
      { key: "signature", where: ["the piece h-voice"] },
    ]);
  });

  it("finds nothing when every name is declared", () => {
    assert.deepEqual(undeclaredNames(content("Hello {handle}.", [], [{ key: "handle", label: "x" }])), []);
  });

  it("finds two names written one right after the other", () => {
    assert.deepEqual(undeclaredNames(content("{first}{last}")).map((n) => n.key), ["first", "last"]);
  });

  it("does not take counts, format slots, code, templates or paths for names", () => {
    const text = "Dates look like \\d{4}-\\d{2}. Format with '{0} of {1}'. In code: ${shell}. In a template: {{mustache}}. Call GET /users/{id}/posts.";
    assert.deepEqual(undeclaredNames(content(text)), []);
  });

  it("names a part whose text is inside the harness by its name, in quotes and on one line", () => {
    const found = undeclaredNames(content("Go.", [text("Odd\nname", "Use {thing}.")]));
    assert.deepEqual(found, [{ key: "thing", where: ['the part "Odd name"'] }]);
  });

  it("does not read team notes: nothing in them is followed", () => {
    assert.deepEqual(undeclaredNames(content("Go.", [{ ...link("h-log", "Log", "memory"), body: "Keep a log.", notes: "note with {braces}" }])), []);
  });
});

describe("a variable's default", () => {
  it("is null when the person has to provide the value", () => {
    assert.equal(variableDefault({ key: "handle", label: "x" }), null);
    assert.equal(variableDefault({ key: "handle", label: "x", default: "   " }), null);
  });

  it("is one line", () => {
    assert.equal(variableDefault({ key: "n", label: "x", default: " 24\nhours " }), "24 hours");
  });
});

describe("the parts of one kind", () => {
  it("keep their position in the harness, which their link on the page depends on", () => {
    const h = view({ content: { parts: [link("a", "A", "tool"), link("b", "B", "skill"), link("c", "C", "tool")] } });
    assert.deepEqual(partsOfKind(h, "tool").map((x) => [x.part.piece, x.index]), [["a", 0], ["c", 2]]);
    assert.equal(partAnchor(2), "part-3");
  });
});

describe("the parts a run blames", () => {
  const parts = [link("h-voice", "Voice"), link("r-rule", "Ben rule"), text("Old note", "Text from before pieces.")];
  it("are kept by their piece's slug, whether named by slug, by name or as a teammate's heading quotes it", () => {
    assert.deepEqual(blamedParts(parts, ["r-rule", "ben rule", '"Ben rule"', "Voice"]), { blamed: ["r-rule", "h-voice"], unknown: [] });
  });
  it("keep the name of a part with no piece, and say which names are no part at all", () => {
    assert.deepEqual(blamedParts(parts, ["Old note", "No such part"]), { blamed: ["Old note"], unknown: ["No such part"] });
  });
});
