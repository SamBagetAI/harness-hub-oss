import type { Metadata } from "next";
import { CopyButton } from "@/components/copy-button";
import { AgentAccessForm } from "@/components/people-forms";
import { MemberPage } from "@/components/member-page";
import { agentsOf, type Agent } from "@/lib/hub/agents";
import { mcpUrl } from "@/lib/hub/config";
import { dayWords } from "@/lib/hub/verdicts";
import { TOOLS } from "@/lib/hub/texts";

// Who is signed in changes per request, so this page is never prerendered.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Connect an agent · Harness Hub" };

const CHECK_LINE = "Who am I on Harness Hub?";
const RUN_LINE = "Run the harness morning-inbox-brief from Harness Hub.";
const NATURAL_LINE = "Run Ada's morning inbox brief.";
const SAVE_LINE = "Save this as a harness in Harness Hub.";
const FIND_PIECES_LINE = "What skills, tools, hooks and memory do we have in Harness Hub?";
const BUILD_LINE = "Make me a harness in Harness Hub from the skill Sorting and brief style and the tool Read-only Gmail.";
const CHANGE_PIECE_LINE = "In Harness Hub, change the skill Sorting and brief style: add that newsletters always go under for information.";

/** How agents other than Claude add a remote MCP server with sign-in, per their documentation in November 2026. */
const OTHERS = (url: string): { name: string; lines: string[]; note?: string }[] => [
  { name: "Codex", lines: [`codex mcp add harness-hub --url ${url}`, "codex mcp login harness-hub"], note: "The Codex app and IDE extension read the same configuration." },
  { name: "Gemini CLI", lines: [`gemini mcp add --transport http harness-hub ${url}`, "/mcp auth harness-hub"], note: "The second line is typed inside the CLI." },
  { name: "ChatGPT", lines: ["chatgpt.com/plugins, then +, then Add custom MCP server"], note: "Paste the address, choose OAuth, create it as a plugin and install it. Depends on your plan and workspace settings." },
  { name: "Hermes Agent", lines: [`hermes mcp add harness-hub --url ${url} --auth oauth`, "hermes mcp login harness-hub"] },
  { name: "OpenClaw", lines: [`openclaw mcp add harness-hub --url ${url} --transport streamable-http --auth oauth`, "openclaw mcp login harness-hub"] },
  { name: "NanoClaw and others", lines: [], note: "No sign-in for remote servers is documented. Use the copied text of a harness instead." },
];

function Say({ line }: { line: string }) {
  return (
    <div className="copyrow">
      <span className="code">{line}</span>
      <CopyButton text={line} label="Copy" what="sentence" />
    </div>
  );
}

export default function ConnectPage() {
  return <MemberPage active="connect" render={async ({ member }) => <Connect email={member.email} agents={await agentsOf(member)} />} />;
}

function Connect({ email, agents }: { email: string; agents: Agent[] }) {
  const url = mcpUrl();

  return (
    <>
      <h1 className="h1">Connect an agent</h1>
      <p className="mu" style={{ maxWidth: 620 }}>
        Harness Hub reaches an agent through a connector. You add it once, sign in, and from then
        on you can ask your agent to find, run and save your team&apos;s harnesses.
      </p>
      <p className="mu" style={{ maxWidth: 620, marginTop: -16 }}>
        The steps below are for Claude, the one this team has set up. The connector is a standard
        remote MCP server with sign-in, so any other agent that supports those (Codex, ChatGPT,
        Gemini and others) can be given the same address.
      </p>

      <section className="sec" aria-labelledby="add">
        <h2 id="add" className="h2">
          1. Add the connector
        </h2>
        <div className="copyrow">
          <span className="code">{url}</span>
          <CopyButton text={url} label="Copy address" />
        </div>
        <div className="box">
          <div className="kv">
            <span className="mu">Your own plan</span>
            <span>
              In Claude, open Customize, then Connectors, then Add, then Add custom connector.
              Paste the address above, give it a name and confirm.
            </span>
          </div>
          <div className="kv">
            <span className="mu">Team or Enterprise</span>
            <span>
              An Owner opens Organization settings, then Connectors, then Add, then Custom, and
              pastes the address. After that each person opens Customize, then Connectors, and
              clicks Connect.
            </span>
          </div>
          <div className="kv">
            <span className="mu">Two choices</span>
            <span>
              Choose <strong>Sign in now</strong> and <strong>Register automatically</strong>.
              These cannot be changed later without removing the connector and adding it again.
            </span>
          </div>
          <div className="kv">
            <span className="mu">Sign in as</span>
            <span>
              <span className="mono">{email}</span>, the same Google account you are
              signed in with here.
            </span>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="check">
        <h2 id="check" className="h2">
          2. Check it works
        </h2>
        <p>Say this to your agent. It should answer with your email address.</p>
        <Say line={CHECK_LINE} />
      </section>

      <section className="sec" aria-labelledby="agents">
        <h2 id="agents" className="h2">
          Your agents · what each one may do
        </h2>
        <p className="mu" style={{ maxWidth: 620 }}>
          Each agent you connect shows here after its first call. A read-only agent finds, loads and runs harnesses and
          reports its runs, but cannot save, copy, suggest or add team notes. A new agent can read and write. Change it any
          time: the next call follows.
        </p>
        {agents.length === 0 ? (
          <p className="mu">No agent has called the connector as you yet.</p>
        ) : (
          <div>
            {agents.map((a) => (
              <div className="line" key={a.client}>
                <span style={{ flex: "0 0 220px" }}>{a.name}</span>
                <span className="mu" style={{ flex: "1 1 auto" }}>
                  {a.access === "read" ? "Read only" : "Read and write"} · last used {dayWords(a.lastSeen)} · first {dayWords(a.firstSeen)}
                </span>
                <AgentAccessForm client={a.client} access={a.access} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="sec" aria-labelledby="run">
        <h2 id="run" className="h2">
          3. Run a harness
        </h2>
        <p>
          Say either line. The agent finds the harness, tells you which version it loaded, asks you
          for its variables, and waits for your go before it posts or sends anything.
        </p>
        <Say line={NATURAL_LINE} />
        <Say line={RUN_LINE} />
      </section>

      <section className="sec" aria-labelledby="save">
        <h2 id="save" className="h2">
          4. Save a new harness
        </h2>
        <p>
          In the chat where you set up your agent or your routine, say this. It shows what it will save and asks for your
          click. Each skill, tool, hook and memory in it is saved as a piece of its own. You can also start one on this site,
          with New harness.
        </p>
        <Say line={SAVE_LINE} />
      </section>

      <section className="sec" aria-labelledby="build">
        <h2 id="build" className="h2">
          5. Build from pieces
        </h2>
        <p>
          Every skill, tool, hook and memory is a piece with versions of its own, and any harness can use it. Ask what
          exists, build a harness from pieces that are already there, or change one piece: every harness that uses it gets
          the new version.
        </p>
        <Say line={FIND_PIECES_LINE} />
        <Say line={BUILD_LINE} />
        <Say line={CHANGE_PIECE_LINE} />
      </section>

      <section className="sec" aria-labelledby="others">
        <h2 id="others" className="h2">
          Other agents · same address, each with its own way to add it
        </h2>
        <p className="mu" style={{ fontSize: 13, maxWidth: 720 }}>
          These steps come from each product&apos;s own documentation. Only Claude has been tried with this Hub so far. Sign in with
          the same Google account each time, then say the lines above.
        </p>
        <div className="box">
          {OTHERS(url).map((o) => (
            <div className="kv agent" key={o.name}>
              <span>{o.name}</span>
              <span>
                {o.lines.map((line) => (
                  <span className="code block" key={line}>
                    {line}
                  </span>
                ))}
                {o.note && <span className="mu">{o.note}</span>}
              </span>
            </div>
          ))}
        </div>
        <p className="mu" style={{ fontSize: 13, maxWidth: 720 }}>
          An agent that cannot connect at all can still use a harness: on its page, &quot;Copy the whole harness as text&quot; gives
          everything as one text to paste into the conversation.
        </p>
      </section>

      <section className="sec" aria-labelledby="tools">
        <h2 id="tools" className="h2">
          What the connector can do
        </h2>
        <div>
          {Object.values(TOOLS).map((tool) => (
            <div className="line" key={tool.name}>
              <span className="mono" style={{ flex: "0 0 220px" }}>
                {tool.name}
              </span>
              <span>{tool.title}</span>
            </div>
          ))}
        </div>
        <p className="mu" style={{ fontSize: 12, maxWidth: 620 }}>
          The first five only read. The others change something: in Claude each asks for your click every
          time, except reporting a run, which a scheduled run must be able to do alone. Every call runs
          as the person signed in to the connector. A read-only agent may use the first five and report runs. Each harness
          you see is also offered as a prompt, with a field for each of its variables, in agents that show a connector&apos;s prompts.
        </p>
      </section>
    </>
  );
}
