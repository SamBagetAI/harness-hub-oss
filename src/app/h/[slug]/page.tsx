import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { EditForm } from "@/components/edit-form";
import { Face } from "@/components/face";
import { type Mode } from "@/components/form-parts";
import { AddPartForm, OwnCopyButton, TeamNotesForm, VariablesForm } from "@/components/harness-forms";
import { MyValuesForm } from "@/components/my-values-form";
import { OwnerPanel } from "@/components/owner-panel";
import { valuesOf } from "@/lib/hub/values";
import { ModelLine } from "@/components/model-results";
import { HarnessHeader } from "@/components/harness-header";
import { MemberPage } from "@/components/member-page";
import { PartRow } from "@/components/part-row";
import { PieceRow } from "@/components/piece-row";
import { RemoveLink } from "@/components/remove-link";
import { RunLine } from "@/components/run-line";
import { PartGlyph } from "@/components/tool-icon";
import { canEdit, LOAD_LIMIT, loadSize, MAX_TEXT } from "@/lib/hub/harnesses";
import { findHarness } from "@/lib/hub/read";
import { usersOf } from "@/lib/hub/library";
import { locate, peopleIn } from "@/lib/hub/locate";
import type { Member } from "@/lib/hub/members";
import { KIND, KINDS, partAnchor, partsOfKind, undeclaredNames, variableDefault, WHEN } from "@/lib/hub/parts";
import { renderHarness } from "@/lib/hub/run-rules";
import { type ModelResult, resultsByModel, runsOf } from "@/lib/hub/runs";
import { day } from "@/lib/hub/safe-text";
import type { HarnessView, Part, Run } from "@/lib/hub/types";
import { dayWords } from "@/lib/hub/verdicts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Harness · Harness Hub" };

export default async function ItemPage({ params, searchParams }: PageProps<"/h/[slug]">) {
  const { slug } = await params;
  const { v } = await searchParams;
  const asked = typeof v === "string" && /^[1-9][0-9]{0,5}$/.test(v) ? Number(v) : undefined;
  return (
    <MemberPage
      active="harnesses"
      render={async ({ member, harnesses, pieces }) => {
        // The lists the page already has hold everything at its latest version.
        const h = asked === undefined ? await locate(member, slug, { harnesses, pieces }) : await findHarness(member, slug, asked);
        if (!h) notFound();
        const latest = h.version === h.latest;
        // On the latest version the owner and the editors save; anyone else suggests.
        const mode: Mode | null = !latest || h.archived ? null : canEdit(h, member) ? "save" : "suggest";
        const harness = h.kind === "harness";
        const runs = harness && h.runs > 0 ? await runsOf(member, h.slug, 5) : [];
        const byModel = harness && h.runs > 0 ? await resultsByModel(h.slug) : [];
        // This person's own values for its variables: shown to them only.
        // Saved against the latest version's variables, so they are shown and changed there only.
        const mine = harness && latest && h.content.variables.length ? await valuesOf(member, h) : {};
        // Its prompt plus the text of the pieces it uses, with their team notes: what an agent loads.
        const size = loadSize(h);
        return (
          <>
            <HarnessHeader h={h} member={member} tab="harness" mode={mode} text={harness ? renderHarness(h) : undefined} />
            {h.archived && (
              <div className="notice" role="status">
                {h.owner.name} archived this. It is out of the lists and the search
                {harness
                  ? ", and its prompt, its variables and its list of pieces cannot change until it is brought back. Its pieces stay in the library, where each can still be read, changed and used."
                  : ", and it cannot change until it is brought back. It still fills the harnesses that use it."}
              </div>
            )}
            {harness && latest && size > MAX_TEXT && (
              <div className="notice" role="status">
                With its pieces this harness is {size.toLocaleString("en-US")} characters, past the {MAX_TEXT.toLocaleString("en-US")} a
                harness is saved at: a piece it uses has grown.{" "}
                {size > LOAD_LIMIT
                  ? `Past ${LOAD_LIMIT.toLocaleString("en-US")} it no longer loads: every run of it is refused until it is shorter.`
                  : "It still loads."}{" "}
                Until it is shorter, a change can only be saved if it adds nothing: shorten the prompt, or take out a piece.
              </div>
            )}
            {!latest && (
              <div className="notice" role="status">
                You are looking at version {h.version}, an older version. Runs use the latest, <Link href={`/h/${h.slug}`}>version {h.latest}</Link>. To
                change something, open the latest.{harness && h.content.parts.some((p) => p.piece) ? " Its pieces are shown as they are today: each has versions of its own." : ""}
              </div>
            )}
            {harness ? (
              <Harness h={h} mode={mode} member={member} runs={runs} pieces={pieces} harnesses={harnesses} mine={mine} byModel={byModel} />
            ) : (
              <Piece h={h} mode={mode} usedBy={usersOf(harnesses, h.slug)} home={harnesses.find((x) => x.slug === h.madeFor)} />
            )}
            {h.owner.email === member.email && <OwnerPanel h={h} people={peopleIn([...harnesses, ...pieces])} />}
          </>
        );
      }}
    />
  );
}

/** Who saved the version on screen, their note, and the way to every version: GitHub's latest-commit bar. */
function LastChange({ h }: { h: HarnessView }) {
  return (
    <div className="lastchange">
      <span className="avatar" aria-hidden="true">
        {h.savedBy.name.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <span className="lcwho">{h.savedBy.name}</span>
      <span className="lcnote mu" title={h.note}>
        {h.note}
      </span>
      <span className="lcmeta mono mu">
        v{h.version} · {day(h.savedAt)}
      </span>
      <Link href={`/h/${h.slug}/versions`} className="lcall">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        {h.latest} version{h.latest === 1 ? "" : "s"}
      </Link>
    </div>
  );
}

/** The mock's map: prompt and skills on the left, the harness in the middle, tools, hooks and memory on the right. */
function PieceMap({ harness }: { harness: HarnessView }) {
  const skills = partsOfKind(harness, "skill");
  // A piece gets versions of its own, so the harness's version alone does not say whether anything changed since.
  // A piece changed when what an agent reads of it did: its text, its name, or when it applies.
  const saved = Date.parse(harness.savedAt);
  const changed = harness.version === harness.latest ? harness.content.parts.map((part, index) => ({ part, index })).filter(({ part }) => part.piece && part.pieceChange && Date.parse(part.pieceChange.at) > saved) : [];
  return (
    <section className="box" aria-label="What this harness is made of">
      <LastChange h={harness} />
      {changed.length > 0 && (
        <p className="rundoes first">
          <span className="mu">Changed since v{harness.version} · </span>
          {changed.slice(0, 4).map(({ part, index }, i) => (
            <span key={index}>
              {i > 0 && ", "}
              <a href={`#${partAnchor(index)}`}>{part.name}</a>
              <span className="mu">
                {" "}
                (v{part.pieceVersion}, {dayWords(part.pieceChange?.at ?? "")})
              </span>
            </span>
          ))}
          {changed.length > 4 && <span className="mu"> and {changed.length - 4} more</span>}
          <span className="mu">. A piece gets versions of its own, and the harness always uses the latest.</span>
        </p>
      )}
      <div className="map">
        <div className="mapgrid">
          <div className="mapcol">
            <div className="gl" style={{ marginTop: 0 }}>
              Prompt
            </div>
            <div className="nr">
              <a href="#prompt" className="nd">
                <span className="g gp" />
                Main prompt
              </a>
              <span className="wire" />
            </div>
            {skills.length > 0 && <div className="gl">{KIND.skill.many}</div>}
            {skills.map(({ part, index }) => (
              <div className="nr" key={index}>
                <a href={`#${partAnchor(index)}`} className="nd">
                  <PartGlyph part={part} size={16} />
                  {part.name}
                </a>
                <span className="wire" />
              </div>
            ))}
          </div>
          <div className="mapcenter">
            <div className="mapface">
              <Face slug={harness.slug} size={92} />
            </div>
          </div>
          <div className="mapcol">
            {(["tool", "hook", "memory"] as const).map((kind) => {
              const parts = partsOfKind(harness, kind);
              if (parts.length === 0) return null;
              return (
                <div className="mapgroup" key={kind}>
                  <div className="gl" style={{ textAlign: "right" }}>
                    {KIND[kind].many}
                  </div>
                  {parts.map(({ part, index }) => (
                    <div className="nr" key={index}>
                      <span className="wire" />
                      <a href={`#${partAnchor(index)}`} className="nd">
                        {part.name}
                        <PartGlyph part={part} size={16} />
                      </a>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* The goal is in the header. What it does sits with the picture of the harness. */}
      {harness.goal && harness.description && (
        <p className="rundoes">
          <span className="mu">What it does · </span>
          {harness.description}
        </p>
      )}
    </section>
  );
}

/**
 * What stands under a part's text on its harness's page: which piece it is and
 * at which version, whose it is, who else uses it, and what the reader can do
 * with it. The text is changed on the piece, for every harness that uses it;
 * the harness itself only takes the piece out, or gets its own copy of it.
 */
function PartFoot({
  h,
  part,
  mode,
  member,
  piece,
  users,
}: {
  h: HarnessView;
  part: Part;
  /** What the reader can do to the harness on this page: save, suggest, or nothing. */
  mode: Mode | null;
  member: Member;
  /** The piece behind the part, when it is in the lists: not archived, and found. */
  piece: HarnessView | undefined;
  /** The other harnesses that use the same piece. */
  users: HarnessView[];
}) {
  // A part from before pieces gets its piece when the Hub starts. Until then it is only read here.
  if (!part.piece) return null;
  const borrowed = part.madeFor !== h.slug;
  const acts = mode && (
    <>
      {mode === "save" && borrowed && part.by && <OwnCopyButton slug={h.slug} piece={part.piece} label={part.name} version={h.version} />}
      <RemoveLink slug={h.slug} version={h.version} name={part.piece} label={part.name} mode={mode} />
    </>
  );
  return (
    <>
      <div className="piecefoot mu">
        {part.by ? (
          <>
            Piece{" "}
            <Link href={`/h/${part.piece}`} className="mono">
              {part.piece}
            </Link>{" "}
            · <Link href={`/h/${part.piece}/versions`}>version {part.pieceVersion}</Link>
            {part.savedBy && part.pieceSavedAt ? ` · text saved ${dayWords(part.pieceSavedAt)} by ${part.savedBy.name}` : ""}
            {part.pieceNote ? `: “${part.pieceNote}”` : ""}
            {part.ownText === false &&
              (part.outsiders?.some((person) => person.email === part.by?.email)
                ? ` · ${part.by.name} owns it: it changes here whenever they save a new version.`
                : part.outsiders?.length
                  ? ` · ${part.outsiders.map((person) => person.name).join(", ")} can change it too, without being able to change this harness.`
                  : ` · ${(part.stranger ?? part.savedBy)?.name ?? "Someone"} last wrote its text, its name or its timing, and can no longer change it. Edit it and save, even without changing a word: it is then this harness's own.`)}
            {(part.pieceSuggestions ?? 0) > 0 && (
              <>
                {" · "}
                <Link href={`/h/${part.piece}/suggestions`} className="flag">
                  {part.pieceSuggestions} open suggestion{part.pieceSuggestions === 1 ? "" : "s"}
                </Link>
              </>
            )}
            {users.length > 0 && (
              <>
                {" · Also used by "}
                {users.map((u, i) => (
                  <span key={u.slug}>
                    {i > 0 && ", "}
                    <Link href={`/h/${u.slug}`}>{u.name}</Link>
                  </span>
                ))}
                .
              </>
            )}
            {!piece && " · Its owner archived this piece. It still fills this harness."}
          </>
        ) : (
          <>
            {part.hidden
              ? "A private piece: only its owner and its editors can read it, so this part shows no text here."
              : <>The piece <span className="mono">{part.piece}</span> could not be found, so this part has no text.</>}
          </>
        )}
      </div>
      {mode && piece ? (
        // The form saves the piece itself, by its own slug and version: someone who cannot change it suggests instead.
        <EditForm
          slug={piece.slug}
          version={piece.version}
          part={{ ...part, name: piece.name, summary: piece.description }}
          item
          body={piece.content.prompt.trim()}
          mode={canEdit(piece, member) ? "save" : "suggest"}
          reach={users.length ? `${users.length === 1 ? "One other harness uses" : `${users.length} other harnesses use`} this piece and ${users.length === 1 ? "gets" : "get"} the change too.` : undefined}
          actions={acts}
        />
      ) : (
        acts && <div className="editbar">{acts}</div>
      )}
    </>
  );
}

function Harness({
  h,
  mode,
  member,
  runs,
  pieces,
  harnesses,
  mine,
  byModel,
}: {
  h: HarnessView;
  mode: Mode | null;
  /** The person looking: what they can change is decided piece by piece. */
  member: Member;
  runs: Run[];
  /** Every piece in the library, and every harness: where each part's piece is found, and who else uses it. */
  pieces: HarnessView[];
  harnesses: HarnessView[];
  /** The values the person looking saved for its variables. */
  mine: Record<string, string>;
  /** Its reported runs, by model and agent. */
  byModel: ModelResult[];
}) {
  const prompt = h.content.prompt.trim();
  const used = new Set(h.content.parts.map((p) => p.piece).filter(Boolean));
  const undeclared = undeclaredNames(h.content);
  const edits = canEdit(h, member);

  return (
    <>
      <ModelLine results={byModel} slug={h.slug} />
      <PieceMap harness={h} />

      <section className="sec" aria-labelledby="vars">
        <h2 id="vars" className="h2">
          Variables · what each person sets for their own run
        </h2>
        <div className="box">
          {h.content.variables.length === 0 && <div className="kv mu">None</div>}
          {h.content.variables.map((v) => {
            const fallback = variableDefault(v);
            return (
              <div className="kv" key={v.key}>
                <span className="mono">{v.key}</span>
                <span>
                  {v.label}
                  <span className={fallback === null && !mine[v.key] ? "flag" : "mu"}>
                    {" · "}
                    {mine[v.key] ? `yours: ${mine[v.key]}` : fallback === null ? "you provide this" : `default: ${fallback}`}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        {undeclared.length > 0 && (
          <div className="notice" role="status">
            The text uses {undeclared.length === 1 ? "a name" : "names"} in braces that {undeclared.length === 1 ? "is" : "are"} not among these variables:{" "}
            {undeclared.slice(0, 12).map((u, i) => (
              <span key={u.key}>
                {i > 0 && ", "}
                <span className="mono">{`{${u.key}}`}</span> in {u.where.slice(0, 2).join(" and ")}
              </span>
            ))}
            . A piece written for another harness may use that harness&apos;s variables. Where one is meant as a variable, add it here: otherwise the
            agent has to ask for it at every run.
          </div>
        )}
        <div className="editbar">
          {h.content.variables.length > 0 && h.version === h.latest && <MyValuesForm slug={h.slug} variables={h.content.variables} saved={mine} />}
          {mode && <VariablesForm slug={h.slug} version={h.version} variables={h.content.variables} mode={mode} />}
        </div>
      </section>

      <section className="sec" aria-labelledby="built">
        <h2 id="built" className="h2">
          How it is built · every piece has versions of its own. Click one to read it.
        </h2>

        <div className="group">
          <div className="gl">Prompt</div>
          <PieceRow
            id="prompt"
            summary={
              <>
                <span className="g gp" />
                <span className="pname">Main prompt</span>
                <span className="psum mu">What the agent is told to do.</span>
                <span className="mono mu">{prompt.length.toLocaleString("en-US")} chars</span>
              </>
            }
          >
            {/* Stored text is shown as plain text: no Markdown or HTML is ever rendered from it. */}
            <pre className="prompt">{prompt}</pre>
            {mode && <EditForm slug={h.slug} version={h.version} body={prompt} mode={mode} what="Prompt" />}
          </PieceRow>
        </div>

        {KINDS.map((kind) => {
          const parts = partsOfKind(h, kind);
          if (parts.length === 0) return null;
          return (
            <div className="group" key={kind}>
              <div className="gl">
                {KIND[kind].many} · {parts.length}
              </div>
              {parts.map(({ part, index }) => (
                <PartRow
                  // Rows keep their place and their message across a save: keyed by the piece, not by its version.
                  key={part.piece ?? part.name}
                  part={part}
                  id={partAnchor(index)}
                  footer={
                    <PartFoot
                      h={h}
                      part={part}
                      mode={mode}
                      member={member}
                      piece={pieces.find((p) => p.slug === part.piece)}
                      users={part.piece ? usersOf(harnesses, part.piece).filter((u) => u.slug !== h.slug) : []}
                    />
                  }
                />
              ))}
            </div>
          );
        })}
        {mode && (
          <AddPartForm
            slug={h.slug}
            version={h.version}
            mode={mode}
            library={pieces.filter((p) => !used.has(p.slug)).map((p) => ({ slug: p.slug, name: p.name, kind: p.kind, owner: p.owner.name }))}
          />
        )}
      </section>

      {runs.length > 0 && (
        <section className="sec" aria-labelledby="runs">
          <h2 id="runs" className="h2">
            Last runs · as the agents that did them reported
          </h2>
          <div className="box">
            {runs.map((r) => (
              <RunLine run={r} me={member.email} edits={edits} marks={!h.archived} key={r.id} />
            ))}
          </div>
          <div>
            <Link href={`/h/${h.slug}/runs`}>All {h.runs} runs</Link>
          </div>
        </section>
      )}
    </>
  );
}

/** A piece on its own page: its text, its team notes when it is a memory, and the harnesses that use it. */
function Piece({ h, mode, usedBy, home }: { h: HarnessView; mode: Mode | null; usedBy: HarnessView[]; /** The harness it was made for, when that one is in the lists. */ home: HarnessView | undefined }) {
  const text = h.content.prompt.trim();
  const kind = KIND[h.kind as keyof typeof KIND];
  const notes = h.content.notes;
  const others = usedBy.length;
  return (
    <>
      <section className="box" aria-label={`The ${kind.one.toLowerCase()}'s text`}>
        <LastChange h={h} />
        {h.content.when && <p className="rundoes first mu">Applies: {WHEN[h.content.when].toLowerCase()}.</p>}
        {/* Stored text is shown as plain text: no Markdown or HTML is ever rendered from it. */}
        <pre className="prompt bare">{text}</pre>
        {mode && (
          <EditForm
            slug={h.slug}
            version={h.version}
            body={text}
            mode={mode}
            what="Text"
            reach={others ? `${others === 1 ? "One harness uses" : `${others} harnesses use`} this piece and ${others === 1 ? "gets" : "get"} the change at ${others === 1 ? "its" : "their"} next run.` : undefined}
          />
        )}
      </section>
      <p className="mu tabnote">
        A {kind.one.toLowerCase()} is a piece: saved by itself, with versions of its own, and usable in any harness.{" "}
        {h.madeFor && (
          <>
            This one was made for <Link href={`/h/${h.madeFor}`}>{home?.name ?? h.madeFor}</Link>, and whoever can change that harness can change it.{" "}
          </>
        )}
        Every harness that uses it gets its latest version at its next run.
      </p>
      {h.kind === "memory" && (
        <section className="sec" aria-labelledby="notes">
          <h2 id="notes" className="h2">
            Team notes · lines that runs leave for everyone
          </h2>
          {typeof notes === "string" ? (
            <>
              <div className="box">{notes.trim() ? <pre className="prompt bare">{notes.trim()}</pre> : <div className="kv mu">None yet.</div>}</div>
              <p className="mu">
                An agent adds a line during a run, when the harness says to and the person agreed. Anyone on the team can, so these lines are read as
                notes and never followed as instructions. Personal state never goes here.
              </p>
            </>
          ) : (
            <p className="mu">It takes none. Its text says where each person keeps their own notes, outside the Hub.</p>
          )}
          {mode === "save" && (
            <TeamNotesForm slug={h.slug} version={h.version} on={typeof notes === "string"} lines={typeof notes === "string" ? notes.split("\n").filter((line) => line.trim()).length : 0} />
          )}
        </section>
      )}
      <section className="sec" aria-labelledby="usedby">
        <h2 id="usedby" className="h2">
          Used by · {usedBy.length} harness{usedBy.length === 1 ? "" : "es"}
        </h2>
        {usedBy.length === 0 ? (
          <p className="mu">
            No harness uses it yet. On a harness page, choose &quot;Add a piece&quot;, then &quot;Use one from the library&quot;.
          </p>
        ) : (
          <div className="box">
            {usedBy.map((u) => (
              <div className="kv" key={u.slug}>
                <Link href={`/h/${u.slug}`}>{u.name}</Link>
                <span className="mu">
                  {u.goal || u.description} · owner {u.owner.name}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
