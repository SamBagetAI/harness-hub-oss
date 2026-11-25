import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { CopyForm } from "@/components/copy-form";
import { Face } from "@/components/face";
import { type Mode } from "@/components/form-parts";
import { AboutForm } from "@/components/harness-forms";
import { waitingOn } from "@/lib/hub/library";
import type { Member } from "@/lib/hub/members";
import { KIND } from "@/lib/hub/parts";
import type { HarnessView } from "@/lib/hub/types";

export type HarnessTab = "harness" | "versions" | "suggestions" | "runs";

/**
 * The top of every harness or piece page, laid out like a GitHub
 * repository: what it is and whose, the actions, then tabs for the thing
 * itself, its versions, the changes people suggested, and its runs.
 */
export function HarnessHeader({
  h,
  member,
  tab,
  mode = null,
  text,
}: {
  h: HarnessView;
  member: Member;
  tab: HarnessTab;
  /** Whether the viewer saves changes, suggests them, or neither (an older version, or archived). */
  mode?: Mode | null;
  /** The whole harness as one text, for an agent that has no connector. */
  text?: string;
}) {
  const harness = h.kind === "harness";
  const runLine = `Run the harness ${h.slug} from Harness Hub.`;
  const base = `/h/${h.slug}`;
  const tabs: { key: HarnessTab; label: string; href: string; count?: number }[] = [
    { key: "harness", label: harness ? "Harness" : KIND[h.kind as keyof typeof KIND].one, href: base },
    { key: "versions", label: "Versions", href: `${base}/versions`, count: h.latest },
    // For a harness: with the suggestions on the pieces made for it, since a change to a part is suggested on its piece.
    { key: "suggestions", label: "Suggestions", href: `${base}/suggestions`, count: harness ? waitingOn(h) : h.openSuggestions },
    ...(harness ? [{ key: "runs" as const, label: "Runs", href: `${base}/runs`, count: h.runs }] : []),
  ];
  return (
    <header className="hhead">
      <div className="htop">
        <div className="hid">
          <Face slug={h.slug} size={56} />
          <div className="hidtext">
            <h1 className="h1">{h.name}</h1>
            <div className="mono mu">
              {!harness && `${h.kind} · `}
              {h.slug} · owner {h.owner.name}
              {h.visibility === "private" && (
                <>
                  {" · "}
                  <span className="privtag" title="Only its owner and its editors see it">
                    private
                  </span>
                </>
              )}
              {h.editors.length > 0 && ` · ${h.editors.length} editor${h.editors.length === 1 ? "" : "s"}`}
              {h.madeFor && (
                <>
                  {" · made for "}
                  <Link href={`/h/${h.madeFor}`}>{h.madeFor}</Link>
                </>
              )}
              {h.copiedFrom && (
                <>
                  {" · copy of "}
                  <Link href={`/h/${h.copiedFrom}`}>{h.copiedFrom}</Link>
                </>
              )}
            </div>
            {/* What the agent is for. Harnesses saved before goals existed show what they do instead. */}
            {harness && h.goal ? (
              <p className="hdesc">
                <span className="mu">Goal · </span>
                {h.goal}
              </p>
            ) : (
              h.description && <p className="hdesc">{h.description}</p>
            )}
            {harness && h.content.schedule && (
              <p className="hdesc mu" title="Harness Hub runs nothing: each person's agent sets this up in its own scheduler when they ask.">
                Meant to run · {h.content.schedule}
              </p>
            )}
            {harness && h.content.testedOn && (
              <p className="hdesc mu" title="Its owner's words. The runs reported by model, on the Runs tab, are what agents said.">
                Works well on, says its owner · {h.content.testedOn}
              </p>
            )}
            {mode && tab === "harness" && <AboutForm h={h} mode={mode} />}
          </div>
        </div>
        <div className="hacts">
          <div className="hbtns">
            {h.owner.email !== member.email && <CopyForm slug={h.slug} piece={!harness} />}
            {harness && (
              /* Opens a new Claude chat with the sentence already typed. The person still presses send. */
              <a className="btn pri" href={`https://claude.ai/new?q=${encodeURIComponent(runLine)}`} target="_blank" rel="noopener noreferrer">
                <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2 1 L11 6 L2 11 Z" fill="currentColor" />
                </svg>
                Run in Claude
              </a>
            )}
          </div>
          {harness && (
            <div
              className="sayline mu"
              title="Run in Claude opens Claude in the browser. In another agent, or when the harness needs a tool only your desktop app has, copy this line and paste it there."
            >
              Or say to your agent: <span className="mono">{runLine}</span>
              <CopyButton text={runLine} what="sentence to say to your agent" small />
            </div>
          )}
          {text && (
            <div className="sayline mu" title="For an agent that cannot connect to the Hub: the whole harness as one text, run rules first. Paste it into the conversation.">
              No connector? <CopyButton text={text} label="Copy the whole harness as text" what="whole harness as text" small />
            </div>
          )}
        </div>
      </div>

      <nav className="tabs" aria-label="Sections">
        {tabs.map((t) => (
          <Link key={t.key} href={t.href} className={`tab${t.key === tab ? " act" : ""}`} aria-current={t.key === tab ? "page" : undefined}>
            {t.label}
            {t.count !== undefined && (
              <span className={`cnt${t.key === "suggestions" && t.count > 0 ? " flag" : ""}`} title={t.key === "suggestions" ? "Open suggestions" : undefined}>
                {t.count}
                {t.key === "suggestions" && <span className="sr-only"> open</span>}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </header>
  );
}
