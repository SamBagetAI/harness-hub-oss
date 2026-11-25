# Harness Hub: how it works

Save an agent's harness once; teammates run it with their own agent, on whatever platform they use.

Harness Hub is a small web app with two doors onto the same store: a dashboard for people, and a
connector (a remote MCP server) for agents: Claude, ChatGPT, and any other agent that supports
remote MCP servers with sign-in. It stores text only. It never runs anything and never holds
anyone's credentials: the agent reads a harness through the connector and does the run with the
person's own tools.

## Where it stands

Everything lives in a Neon Postgres database (`src/lib/hub/db.ts`). Every save is a new version;
versions are never edited or deleted, and runs use the latest. A Hub starts with one built-in
harness (`src/lib/hub/built-in.ts`), added once as version 1 if its slug is not there yet: the Morning
inbox brief, a small read-only example with one skill, one tool, two hooks and one memory. Built-in
harnesses are never removed from a Hub's database: one taken out of the code stays where it was
already added.

A harness has a name, a goal (what the agent is for, shown under its name), a description (what
it does), a prompt, variables, and parts of four kinds: skills, tools, hooks, memory.

**A harness is built from pieces, like bricks.** Every skill, tool, hook and memory is a
**piece**: an item of its own in the same store as harnesses, with its own slug, owner, versions,
suggestions and page. A harness holds its prompt, its variables and an ordered list of the pieces
it uses, and reads the latest version of each when it is loaded. So each piece is found, loaded,
saved, copied and suggested on by itself, through the same connector tools and the same pages as a
harness, and any harness can use any piece.

- **Where pieces come from.** Text sent as a part of a harness (pasted with a save, or written on
  its page) becomes a piece made for that harness, named `<harness-slug>-<part-name>` and owned by
  the harness's owner. A piece can also be made by itself (`kind`), or be an existing one named by
  its slug. A harness saved before pieces existed gets its pieces once, when the Hub starts
  (`convertOldParts`): one new version that links them, no text changed. Each piece is dated like
  its own text (the version in which that part got to say what it says) and signed by the
  harness's owner, whose text everything in a harness was before pieces. The website has no list
  or edit box for text from before pieces: once the move has run, there is none left to show.
- **What tells parts apart.** A part is told apart by the slug of its piece, and goes by its
  piece's name: rename the piece and every harness reads the new name. The name stored with a link
  is only a record of what the piece was called when the harness was last saved
  (`src/lib/hub/diff.ts` compares by slug).
- **Changing a piece.** A change to a part's name or text is a new version of its piece; the
  harness stays at its version. The harness a piece was made for changes it freely, and whoever
  can change that harness can change the piece. A piece a harness only borrows is changed by its
  own slug, or suggested on; or the harness gets its own copy of it (`own_copy`), which leaves the
  original alone. A change through a harness is all or nothing: if the rest of the save breaks a
  rule of the harness, the piece is not saved either.
- **Not undoing a teammate's version.** A harness's own version does not move when one of its
  pieces changes, so it cannot guard them. A change to a piece that arrives through a harness says
  which version of the piece it was written on (`piece_version`): always when it comes in a whole
  list of parts sent back, and with `update_part` whenever the save names the harness's version.
  And because a piece changes without a new version of the harness, a load says which pieces
  changed since that person's last reported run, and whether the harness itself moved. A piece
  changed when what an agent reads of it did: its text, its name, or when it applies. A hook moved
  from "before a tool" to "at the start" is named like one with a new text, with the note of the
  version that moved it. A line of team notes, a new summary or a new icon is not a change.
- **Who sees what.** An item is team (everyone let in sees it) or private (only its owner and
  its editors, and for a piece made for a harness, whoever can change that harness). A new item
  is private unless its creator shares it, and so is a copy; everything from before visibility
  is team. Someone who cannot see a private item gets no sign of it: not in lists, search,
  Stats, open runs or suggestions, and saving on its slug only says the slug is taken. Only the
  owner switches it (`setVisibility`; on the website under Permissions; through the connector
  with `visibility` on `harness_hub_save`, in a save of its own). A team harness is run by anyone, so it uses only
  team pieces: a private piece cannot be added to one, a piece a team harness uses cannot be made
  private, and sharing a harness shares the pieces made for it, except a copy of someone else's
  private piece. A harness made private takes every piece made for it along, unless another team
  harness uses one. These rules are checked again inside the write, in a serializable transaction,
  so a save and a change of visibility at the same moment cannot break them. What points at an
  item a reader cannot see says nothing about it: "made for", "copy of", a piece's name and slug
  in a harness (it reads "a private piece"), harnesses or pieces named in a refusal or a size
  warning (counted instead). Two things stay: a piece made for a harness starts its slug with the
  harness's slug, and a version's "changes" line keeps the name a piece had when it was saved. The rule is `src/lib/hub/visibility.ts`;
  `seesSql` is the same rule for queries.
- **Who changes what.** The owner and the editors the owner names change an item. Anyone else
  suggests a change, which is merged into a new version or closed, or makes their own copy. A copy
  of a harness has its own prompt and variables and uses the same pieces. Owners archive what they
  no longer want; nothing is deleted.
- **Whose words an agent follows.** The Hub decides it, not the text. A piece is the harness
  owner's own text, under its heading, only when nobody can change it who could not change the
  harness, and its text as it stands was saved by someone who can: an editor who was let go since
  still wrote what they wrote. "Saved the text" means the version in which the text itself last
  changed: a later version that only fixed its summary did not write it. The same holds for the
  two other things an agent reads of a piece, both printed in its heading: its name, and when it
  applies (only a hook has a timing). Someone who can change the piece takes all three over by
  sending its text as it stands, by the piece's slug or with `update_part` on a harness, even
  when the same save changes its name or summary too. A save that does not send the text takes
  nothing over: a copy of a piece, by `harness_hub_copy` or `own_copy`, whose text was not sent
  is signed by whoever set the words it copies, and stays theirs until it is taken over. Any other piece
  is a teammate's: it sits between tagged lines that name the piece, its version, its owner and
  who saved it, under a heading that carries its name in quotes. A memory may take **team
  notes**, when its owner turns them on: lines that anyone's run adds. They are kept apart from
  the memory's own text, sit between tagged lines of their own, and the run rules call them
  notes, never instructions. Turned off, they leave the memory; turned on again, they come back
  if they still fit; and whoever can change the memory can empty them while they are on.
- **Lines only the Hub writes.** The tagged lines around a harness, a teammate's piece and team
  notes are written fresh at every load and never stored. An agent that saves a part back as it
  read it sends them too: they are taken off before the text is compared, but only as a load
  prints them: team notes after the text, and a teammate's two lines around the whole text. A
  text that still holds one anywhere else is refused, so that what sat between them can never be
  stored as someone's own words.
- **Sizes.** A harness holds 60,000 characters with its pieces when it is saved; a piece holds
  20,000 with its team notes. A piece may grow afterwards and take a harness past its limit:
  nobody's harness can stop a piece from growing. The harness still loads, says so on its page, and
  can then only be saved shorter; past 80,000 the connector refuses to load it and says why. Both
  limits count the same thing (`loadSize`): the prompt and the pieces' text with their team notes,
  not the run rules the Hub adds. Whoever grows a piece is told which harnesses it took past
  either limit. A copy is a new item and keeps to the limits, whatever size its original grew to.
- **Runs.** An agent reports a run when it ends (`harness_hub_log_run`): its own verdict (went
  fine, needs a look, failed), the version it loaded, the model it ran on as it names it, one
  sentence, and the parts that gave trouble. The Hub adds which agent reported it, from the token
  (the name on the person's Connect page), never from what the agent sent. Each harness shows its
  runs by model and agent (`resultsByModel`): on its page in one line, on its Runs tab in full,
  and in what an agent loads. That is how a team sees whether a harness works beyond Claude. A version that does not exist is refused, and so is a part the harness does not have;
  a blamed part is kept by its piece's slug, so its count follows it through a rename. Nobody checks the
  verdict, and the Hub keeps nothing else of a run. The Stats page and each harness's Runs tab
  count those reports, not runs: a run that never reports is invisible. Stats covers the last 14
  days, for everyone or for the reader alone: each harness day by day, and the parts that were
  blamed, with what the agent said and whether it was seen again. Both pages open with how a run
  gets there, because that is what makes the numbers readable (`src/components/runs-explainer.tsx`,
  `src/lib/hub/verdicts.ts`). A run that was not fine stays open until the person whose run it was,
  or the owner or an editor of the harness, marks it as dealt with, with a line on what was done:
  on the Runs page, or through their agent, only when they say they looked at it.
  The verdict stays the agent's. The home page lists the open runs that wait for the reader.
- **Each person's own values.** A person can save their values for a harness's variables
  (`src/lib/hub/values.ts`): on its page under Variables, or through their agent with
  `harness_hub_save_values` once they agree. They are theirs only, never shown to anyone else,
  the owner included. A load lists them next to each variable, a picked prompt uses them for a
  field left empty, and a scheduled run uses them after the values in its own prompt. Each value
  keeps the label of the variable it was given for, and is used only while that variable still
  exists with the same label: a variable taken out or given another meaning asks again. A value
  can always be cleared. At most 500 characters each, never anything that looks like a token. A
  read-only agent cannot save them: a value can point a later run at another place.
- **Schedule.** A harness can say when it is meant to run, in one line its owner writes, for
  example "At 06:44, Sunday through Thursday". It is a field of the harness, versioned and
  compared like the others. It is printed on its own labelled line, never inside a rule. The Hub
  runs nothing: a load tells the agent that, only if the person asks, it may create a scheduled
  task in their own agent that runs the harness from the Hub, after showing them the exact days
  and time.
- **Tested on.** A harness's owner can say, in one line, which models and agents it works well
  on, for example "Opus 5.5 in Claude; GPT-5 in Codex". It is a field of the harness like the
  schedule, shown under its goal and on its own labelled line in a load. It is the owner's claim;
  the runs reported by model, on the Runs tab, are what agents said.
- **What a run may write.** Anything that reaches other people, spends or cannot be undone needs
  the person's go, and is held back with nobody present. One kind of writing is part of a run:
  updating the one document, file or artifact the person named for the harness themself, through
  a value they gave or saved (never a default or the harness text alone), never their settings,
  agent instructions, code or configuration.
- **What each agent may do.** Each agent a person connects (an OAuth client: Claude, Codex, a
  scheduled run's app) is listed on their Connect page after its first call, read only or read
  and write. The sign-in provider cannot put custom scopes in its tokens, so this is the Hub's own
  setting, per person and agent (`src/lib/hub/agents.ts`, the rule in `src/lib/hub/access.ts`). A new
  agent can read and write, and so can one that registers again under a new client id after a
  reconnect: switch it again on the Connect page. A read-only agent uses the five reading tools
  and still reports its runs; every other tool refuses it and says where its person can change
  that. `whoami` says
  which one an agent is. Only the person can change their own agents, and the next call follows.
- **People.** The addresses in `ALLOWED_EMAILS` (and `ALLOWED_DOMAINS`, if set) are let in and are
  the admins. Admins add anyone else on the Members page or through their agent (`harness_hub_team`), with no
  redeploy.
- **The agent does, the website shows.** Everything a person can change, they can ask their
  agent to change through the connector: saving, sharing, values, archiving
  (`harness_hub_archive`), editors (`harness_hub_set_editor`), marking a run as dealt with
  (`harness_hub_mark_run`, which `whoami`'s list of open runs gives numbers for) and, for an
  admin, teammates (`harness_hub_team`). The website is there to see it all, and its forms do the
  same things. One setting stays on the website only: whether an agent may write, since an agent
  that could change it could make itself write.


## How it works

| Part | Where | What it does |
|---|---|---|
| Connector | `src/app/api/mcp/route.ts`, with `inputs.ts` (what each tool takes) and `render.ts` (a piece as an agent reads it) | Five tools that read (`harness_hub_whoami`, `_search`, `_get_harness`, `_get_piece`, `_history`) and eleven that write (`_save`, `_copy`, `_suggest_change`, `_review_suggestion`, `_append_memory`, `_save_values`, `_archive`, `_set_editor`, `_mark_run`, `_team`, `_log_run`). In Claude each write asks for a click on every call, except reporting a run. An agent its person made read-only can only read and report runs. It also offers each harness the caller sees as an MCP prompt, with a field per variable (`src/lib/hub/prompts.ts`): the prompt only asks the agent to load the harness with the tool, so a teammate's text never arrives as the person's own words. |
| Token check | `src/lib/mcp-auth.ts` | Verifies Claude's access token with Clerk, for this exact connector address, then maps it to a person. |
| Sign-in metadata | `src/app/.well-known/oauth-protected-resource/…` | Tells Claude which sign-in server to use. The connector's `401` points here. |
| Who is let in | `src/lib/hub/members.ts`, `src/lib/hub/clerk.ts` | A person is their primary, verified email. `ALLOWED_EMAILS` lists the exact addresses allowed. |
| Store | `src/lib/hub/harnesses.ts` (saving, editing, suggestions), `read.ts` (reading items and versions), `setup.ts` (tables, built-in harnesses, one-time moves of old data), `db.ts` (tables and connection), `slugs.ts` | The one place items are read and saved: pages, forms and the connector never import `db.ts` or the database driver, and `pnpm lint` fails if they do (the health check is the one exception). Tables `harnesses` (harnesses and pieces, by `kind`; a piece made for a harness names it in `made_for`), `versions`, `suggestions`, `roles` (editors), `runs`, `members` and `agents` (what each connected agent may do), created on first use. A save or a merge lands only on top of the version it was worked out from, and the pieces a save makes are written in the same transaction as the harness version that links them. |
| Runs and people | `src/lib/hub/runs.ts`, `src/lib/hub/people.ts` | What agents report about runs, with the numbers for the Stats page; and the people admins added from the Hub. |
| Changes | `src/lib/hub/diff.ts` | Compares two versions field by field, shows the changed lines, and merges a suggestion onto the latest version when nothing it touches changed since. |
| Built-in harnesses | `src/lib/hub/built-in.ts`, `src/lib/hub/routines/` | What a Hub starts with. |
| Parts | `src/lib/hub/parts.ts`, `src/lib/hub/library.ts` | Kind names, glyphs and hook timings; which names in braces a harness uses without declaring them; the library lists every piece by kind, with where it is used. |
| Run rules | `src/lib/hub/run-rules.ts` | The fixed text an agent receives ahead of every harness (among them: nothing that reaches other people, spends or cannot be undone without the person's go, while keeping their own files and artifacts up to date is part of a run), then the prompt and each part under a heading that names its piece and version, inside a tagged block. A teammate's piece and a memory's team notes get tagged lines of their own inside it. |
| Search | `src/lib/hub/search.ts` | Word matching that tells Claude to go ahead only on one clear match. |
| Dashboard | `src/app/`, `src/components/` | Harnesses, a page per harness or piece (the item, Versions, Suggestions, Runs), New, Skills, Tools, Hooks and memory, Stats, Members, Connect an agent. Every page goes through `src/components/member-page.tsx`; every form goes through `src/app/h/[slug]/actions.ts`. |
| Clerk on pages | `src/proxy.ts` | Runs Clerk on dashboard pages only. The connector and `/.well-known` are deliberately left out. |

Two rules the code depends on:

- **One address, set once.** Claude compares the connector address a person pastes with the
  `resource` in the sign-in metadata, character for character. `HUB_URL` is that address's origin.
  It is read from configuration, never from the incoming request.
- **Signed in is not let in.** Anyone with a Google account can sign in to the Clerk application.
  Pages and tools show Hub content only to addresses on the list (`src/lib/hub/session.ts` for pages,
  `callerOf` in `src/lib/mcp-auth.ts` for tools).

## Run your own Hub

A Hub is one Vercel project, one Neon database and one Clerk application. Each team or company
runs its own: nothing is shared between Hubs.

The README's "Deploy with Vercel" button does steps 1 to 3 in one go: it copies the code to your
GitHub account, creates the Vercel project, adds a Neon database and asks for the variables of
steps 4 to 6. Have the Clerk application of step 5 ready first, or deploy, finish it, then set the
variables and redeploy.

1. **Get the code.** Fork or copy this repository to your own GitHub account.
2. **Create the Vercel project.** In Vercel, import the repository. The first deploy may fail
   until the steps below are done; that is expected.
3. **Add the database.** In the project, Storage, add a Neon Postgres database. The integration
   sets `DATABASE_URL`. The Hub creates its tables on first use.
4. **Choose the address.** Decide the Hub's public address now (a domain of your own, or the
   project's `vercel.app` address) and set `HUB_URL` to it, with no trailing slash. Claude compares
   it character for character, so changing it later means everyone connects again.
5. **Create the Clerk application.** In Clerk, create an application with Google as its sign-in
   method. For real use, make it a production instance on your own domain, with your own Google
   OAuth client (Clerk's development instance is for trying it out). Then:
   - copy its keys into `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`;
   - under Agents, MCP servers, register the connector address, `HUB_URL` + `/api/mcp`;
   - under OAuth applications, Settings, Client onboarding: turn "Publish DCR support" on and
     "Publish CIMD support" off, and set "Allowed scopes for dynamic clients" to `email`,
     `profile`, `openid` and `offline_access`. (Why: see Adding the connector in Claude.)
6. **Set the rest of the variables** in the Vercel project (the table under Environment):
   `ALLOWED_EMAILS` with the admins' Google addresses, `NEXT_PUBLIC_CLERK_KEYLESS_DISABLED=true`
   and `NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED=1`. Leave `HUB_TABLE_PREFIX`, `DEV_SESSION_EMAIL` and
   `DEV_IDENTITY_EMAILS` unset. Redeploy.
7. **Check it.**
   - `HUB_URL` + `/api/health` answers `{"ok": true}`.
   - `node scripts/smoke.mjs <HUB_URL> --public` passes: it checks what an agent sees before
     sign-in, including that Clerk lets an agent register.
   - Sign in on the website with an admin address.
   - Connect Claude (Adding the connector in Claude) and ask "Who am I on Harness Hub?".
8. **Bring the team in.** Admins add people on the Members page, or ask their agent to. A new Hub
   starts with two example harnesses, owned by the first allowed address; archive them if you do
   not want them.

## Environment

See `.env.example`. On Vercel these go in the project's environment variables.

| Variable | Meaning |
|---|---|
| `HUB_URL` | Public origin of the Hub, no trailing slash. The connector address is `HUB_URL` + `/api/mcp`. |
| `DATABASE_URL` | Neon Postgres, set by the Vercel Neon integration. |
| `HUB_TABLE_PREFIX` | Local development only: `dev_` keeps local and check-script data in separate tables. Leave unset on Vercel. |
| `ALLOWED_EMAILS` | Exact Google addresses that are let in, comma-separated. They are the admins: they add other people on the Members page. |
| `ALLOWED_DOMAINS` | Optional. Email domains whose every address is let in, comma-separated (for example `example.com`). Unset by default. |
| `BUILT_IN_OWNER_EMAIL`, `BUILT_IN_OWNER_NAME` | Optional. Owner shown for the built-in harnesses. Default: the first allowed address. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | The Clerk application used for sign-in. |
| `NEXT_PUBLIC_CLERK_KEYLESS_DISABLED` | `true` stops Clerk from creating a temporary application when keys are missing. |
| `NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED` | `1` turns off the Clerk SDK's telemetry. |
| `DEV_SESSION_EMAIL` | Local development only. Shows the pages as this address without a Google sign-in. Leave it unset when running `pnpm smoke`, which checks the signed-out pages. |
| `DEV_IDENTITY_EMAILS` | Local development only. Test identities for the check script. Ignored outside `next dev`. |

On Vercel, redeploy after changing a variable: a running deployment keeps the values it was built
with. People added on the Members page need no redeploy. To cut someone off at once, also ban the
user in Clerk.

`/api/health` answers `{"ok": true}` when the Hub can reach its database, and 503 when it cannot:
point an uptime monitor at it.

Sign-in problems are logged as one JSON line starting `{"at":"mcp-auth"` with the reason Clerk gave
(for example an audience that does not match `HUB_URL` + `/api/mcp`).

## Commands

```bash
pnpm dev          # the app on http://localhost:3210
pnpm test         # unit tests: no database, no server, about a second
pnpm smoke        # checks the connector over HTTP, the way Claude uses it (needs pnpm dev running)
pnpm check:store  # checks the store's own rules by calling it directly, on the local tables
pnpm clean:dev    # removes what the two check scripts leave in the local tables
pnpm typecheck
pnpm lint
pnpm build
```

### Tests

GitHub runs `pnpm test`, `lint`, `typecheck` and `build` on every pull request and every push to
main (`.github/workflows/checks.yml`). The two checks that need a database run locally.

Three layers, from the fastest to the widest. A change comes with tests in the layer that can see
it, and with this page brought up to date.

`pnpm test` runs the unit tests in `tests/*.test.mjs` with Node's own test runner: no test
library, no database, no server. `scripts/register-ts.mjs` lets them import the TypeScript modules
as they are. They cover the logic that is plain functions of its arguments:

| File | What it pins down |
|---|---|
| `tests/diff.test.mjs` | What tells parts apart, how a change is named, merging a suggestion onto a later version, the diff shown to people and agents. |
| `tests/run-rules.test.mjs` | The text an agent receives: tags, whose words each part is, team notes, what changed since the person's last run (a new text, a new name or a new timing; never team notes alone). |
| `tests/edit.test.mjs` | The Hub's own lines taken off text sent back, slugs of pieces, how a part is found, what a piece carries as a part (its text's date, and its last change apart from it), every refusal of `applyEdit`, team notes on, off and emptied, the size a load is measured at. |
| `tests/prompts.test.mjs` | A harness as a prompt: its fields, and a message that never carries the harness's text. |
| `tests/visibility.test.mjs` | Who sees a team item and a private one. |
| `tests/agents.test.mjs` | What a read-only agent may and may not do. |
| `tests/parts.test.mjs` | Names in braces that are not variables, defaults, positions of parts, which part a run blames. |
| `tests/search.test.mjs` | Which harness a sentence means, and when an agent is told to ask instead of going ahead. |
| `tests/safe-text.test.mjs` | Quoting of what people typed, slugs, tagged blocks. |

`tests/helpers.mjs` builds versions, items and parts for them. To test a rule, put it where it can
be called without the database (most of `src/lib/hub/` is), export it, and add a case.

`pnpm check:store` covers the store's own rules (who may mark a run as dealt with, add an editor,
archive, or make an agent read-only), who sees what, the rules of pieces (who may change one, what
a harness may do with a piece it borrows, team notes), and the move of a Hub from before pieces,
which it sets up by writing an old harness straight into the local tables. It refuses to run unless
the tables are the local ones.

`pnpm smoke` signs in with test identities (`Authorization: Bearer dev:<address>`). They are accepted
only by `next dev`, with a local `HUB_URL`, for requests addressed to localhost; the dev server
listens on localhost only. Against a deployed Hub, run the checks that need no
sign-in:

```bash
node scripts/smoke.mjs https://your-hub.example.com --public
```

That run also asks the Clerk sign-in server whether Claude can register with it.

## Adding the connector in Claude

The dashboard's "Connect an agent" page has the address and the steps. In short: add a custom
connector with the address `HUB_URL` + `/api/mcp`, choose "Sign in now" and "Register automatically", sign in with an allowed Google account, then say "Who am I on Harness Hub?".

In the Clerk dashboard the connector address is registered under Agents, MCP servers. Under OAuth
applications, Settings, Client onboarding, "Publish DCR support" is on and "Publish CIMD support" is
off: with CIMD on, Clerk failed to resolve Claude's identity document. "Allowed scopes for dynamic
clients" includes `openid` besides `email`, `profile` and `offline_access`: ChatGPT always asks for
`openid`, and Clerk refuses a scope that list leaves out (`invalid_scope`). The sign-in metadata
lists `openid` too (`src/lib/hub/resource-metadata.ts`), so a client registers with it.

## Adding it in ChatGPT

Plugins, Add, "Add a custom MCP server": the same address, authentication OAuth, then Connect and
sign in with an allowed Google account. Tried on 2026-11-15: ChatGPT ran a harness, followed the run
rules and reported its runs (as `gpt-6` in ChatGPT). ChatGPT keeps the tool list it read when the
plugin was added: its "Refresh tools" did not load tools the Hub added later, so a plugin added
before them may need to be removed and added again.
