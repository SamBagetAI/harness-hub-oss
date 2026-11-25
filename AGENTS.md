<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## graphify: a map of the code

If `graphify-out/graph.json` exists (made with [graphify](https://github.com/Graphify-Labs/graphify),
see .github/CONTRIBUTING.md), use it before searching or reading files:

- `graphify query "<question>"` to find where something lives, before the first grep or file read.
  Put this rule in the prompt of every subagent that explores the code.
- `graphify explain "<path>::<name>()"` for what a function calls and what calls it, before
  changing it. `graphify path "<A>" "<B>"` for how two things connect.
- `graphify section "<heading>"` prints a section of the docs without opening the file.
- Read whole files only for the lines the graph pointed to.
- After changing code, run `pnpm graph` (it uses no model and takes seconds). The git hooks also
  rebuild it after each commit.

`graphify-out/` is ignored by git: each person builds their own.
