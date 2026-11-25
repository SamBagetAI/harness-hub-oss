import { oneLine } from "./safe-text";
import type { HarnessContent, HarnessView, Part, PartKind, Variable } from "./types";

/**
 * Everything that is said about a kind of piece, in one place: its glyph on
 * the pages, its names, and when a hook applies. Pages and the text sent to
 * Claude both read from here, so they cannot describe a piece differently.
 */
export const KINDS: PartKind[] = ["skill", "tool", "hook", "memory"];

export const KIND: Record<PartKind, { glyph: string; one: string; many: string }> = {
  skill: { glyph: "gs", one: "Skill", many: "Skills" },
  tool: { glyph: "gt", one: "Tool", many: "Tools" },
  hook: { glyph: "gh", one: "Hook", many: "Hooks" },
  memory: { glyph: "gm", one: "Memory", many: "Memory" },
};

/** When a hook applies, as a sentence start ("Before a tool"). */
export const WHEN: Record<NonNullable<Part["when"]>, string> = {
  start: "At the start",
  before_tool: "Before a tool",
  after_tool: "After a tool",
  end: "At the end",
};

export type NumberedPart = { part: Part; index: number };

/** The parts of one kind, each with its position in the harness, which its link depends on. */
export function partsOfKind(h: HarnessView, kind: PartKind): NumberedPart[] {
  return h.content.parts.map((part, index) => ({ part, index })).filter((x) => x.part.kind === kind);
}

/** The id of a part's row on its harness page. */
export function partAnchor(index: number): string {
  return `part-${index + 1}`;
}

/** A variable's default, or null when the person has to provide the value. */
export function variableDefault(v: Variable): string | null {
  const value = v.default === undefined ? "" : oneLine(v.default, 200);
  return value === "" ? null : value;
}

/**
 * Names in braces that the text of a harness uses and the harness does not
 * declare as variables, each with where it is used. A piece written for one
 * harness may use that harness's variables: put into another, it asks for
 * values nobody is asked for. The prompt and each piece's text are read;
 * team notes are not, since nothing in them is followed.
 */
export function undeclaredNames(content: HarnessContent): { key: string; where: string[] }[] {
  const declared = new Set(content.variables.map((v) => v.key));
  const found = new Map<string, string[]>();
  const read = (text: string, where: string) => {
    // A variable's name starts with a letter here: {4} in a pattern and {0} in a format are not names.
    for (const match of text.matchAll(/\{([a-z][a-z0-9_]{0,39})\}/g)) {
      const key = match[1];
      const at = match.index ?? 0;
      const before = text[at - 1] ?? "";
      // Nor are ${name} in code, {{name}} in a template, or a placeholder in a path such as /users/{id}.
      if (before === "$" || before === "{" || before === "/" || text[at + match[0].length] === "}") continue;
      if (declared.has(key)) continue;
      const places = found.get(key) ?? [];
      if (!places.includes(where)) places.push(where);
      found.set(key, places);
    }
  };
  read(content.prompt, "the prompt");
  for (const part of content.parts) read(part.body, part.piece ? `the piece ${part.piece}` : `the part ${JSON.stringify(oneLine(part.name, 80))}`);
  return [...found].map(([key, where]) => ({ key, where }));
}

/**
 * The parts a run blames, by the slug of their piece: a part is told apart by its piece, and goes by a name that
 * can change. A name is found as the slug of a piece, as the name a part is read under now, or as that name in the
 * quotes a teammate's heading prints it in. A part whose text is still
 * inside the harness has no slug and keeps its name. Names that are no part of the harness come back apart.
 */
export function blamedParts(parts: Part[], names: string[]): { blamed: string[]; unknown: string[] } {
  const blamed: string[] = [];
  const unknown: string[] = [];
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const unquote = (name: string) => {
    const t = name.trim();
    if (!/^".*"$/.test(t)) return t;
    try {
      const read: unknown = JSON.parse(t);
      return typeof read === "string" ? read : t;
    } catch {
      return t;
    }
  };
  for (const sent of names) {
    const name = unquote(sent);
    const part =
      parts.find((p) => p.piece && p.piece === name.trim().toLowerCase()) ??
      parts.find((p) => same(p.name, name));
    if (!part) unknown.push(sent);
    else {
      const id = part.piece ?? part.name;
      if (!blamed.includes(id)) blamed.push(id);
    }
  }
  return { blamed, unknown };
}
