"use client";

import Link from "next/link";
import { useState } from "react";
import { archive, editor, visibility } from "@/app/h/[slug]/actions";
import { useSaved } from "@/components/use-saved";
import type { HarnessView, Person } from "@/lib/hub/types";
import { Status } from "@/components/form-parts";

// ---------------------------------------------------------------------------
// What only the owner does: who else may change it, and setting it aside
// ---------------------------------------------------------------------------

export function OwnerPanel({ h, people }: { h: HarnessView; people: Person[] }) {
  const [email, setEmail] = useState("");
  const editors = useSaved(editor, () => setEmail(""));
  const archived = useSaved(archive);
  const shared = useSaved(visibility);
  const known = people.filter((p) => p.email !== h.owner.email && !h.editors.some((e) => e.email === p.email));
  // A piece made for a harness can also be changed by whoever can change that harness. Those are not taken back here.
  const fromHome = h.editors.filter((e) => !h.ownEditors.some((own) => own.email === e.email));
  return (
    <details className="piece owner">
      <summary className="flatsum">
        <span className="pname">Permissions and archive</span>
        <span className="psum mu">
          {h.editors.length ? `${h.editors.length} editor${h.editors.length === 1 ? "" : "s"}` : "Only you can change it"} ·{" "}
          {h.visibility === "private"
            ? `private: only you${h.editors.length ? " and its editors" : ""}${h.madeFor ? `, and whoever can change ${h.madeFor},` : ""} see it`
            : "everyone on the team can read, run, copy and suggest"}
        </span>
      </summary>
      <div className="ownerbody">
        <div className="sec">
          <h3 className="h2">Editors · people who can change it and merge suggestions, like you</h3>
          {h.editors.length === 0 && <p className="mu">Nobody yet.</p>}
          {fromHome.length > 0 && (
            <p className="mu">
              {fromHome.map((e) => e.name).join(", ")} can change it too, as {fromHome.length === 1 ? "an editor" : "editors"} of{" "}
              <Link href={`/h/${h.madeFor}`}>{h.madeFor}</Link>, the harness this piece was made for.
            </p>
          )}
          {h.ownEditors.map((e) => (
            <form action={editors.run} className="inlineform spread" key={e.email}>
              <input type="hidden" name="slug" value={h.slug} />
              <input type="hidden" name="email" value={e.email} />
              <input type="hidden" name="add" value="0" />
              <span>
                {e.name} <span className="mono mu">{e.email}</span>
              </span>
              <button type="submit" className="btn sm" disabled={editors.pending}>
                Remove
              </button>
            </form>
          ))}
          <form action={editors.run} className="inlineform">
            <input type="hidden" name="slug" value={h.slug} />
            <input type="hidden" name="add" value="1" />
            <label className="sr-only" htmlFor={`editor-${h.slug}`}>
              Email of the teammate
            </label>
            <input id={`editor-${h.slug}`} name="email" type="email" required className="fld narrow" placeholder="teammate@example.com" list={`people-${h.slug}`} value={email} onChange={(e) => setEmail(e.target.value)} />
            <datalist id={`people-${h.slug}`}>
              {known.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.name}
                </option>
              ))}
            </datalist>
            <button type="submit" className="btn sm" disabled={editors.pending}>
              Add an editor
            </button>
            <Status state={editors.state} answered={editors.answered} />
          </form>
        </div>
        <div className="sec">
          <h3 className="h2">Who sees it · {h.visibility === "private" ? "private" : "the whole team"}</h3>
          <form action={shared.run} className="inlineform">
            <input type="hidden" name="slug" value={h.slug} />
            <input type="hidden" name="to" value={h.visibility === "private" ? "team" : "private"} />
            <button type="submit" className="btn sm" disabled={shared.pending}>
              {h.visibility === "private" ? "Share with the team" : "Make private"}
            </button>
            <span className="mu">
              {h.visibility === "private"
                ? `Only you and its editors${h.madeFor ? `, and whoever can change ${h.madeFor},` : ""} see it, with its versions, suggestions and runs.`
                : "Everyone on the team can read, run, copy and suggest. Made private, only you and its editors see it."}
            </span>
            <Status state={shared.state} answered={shared.answered} />
          </form>
        </div>
        <div className="sec">
          <h3 className="h2">Archive · nothing is ever deleted</h3>
          <form action={archived.run} className="inlineform">
            <input type="hidden" name="slug" value={h.slug} />
            <input type="hidden" name="archived" value={h.archived ? "0" : "1"} />
            <button type="submit" className="btn sm" disabled={archived.pending}>
              {h.archived ? "Bring it back" : "Archive it"}
            </button>
            <span className="mu">
              {h.archived ? "It is out of the lists and the search. Its versions are all kept." : "Takes it out of the lists and the search. Its address still opens, and you can bring it back."}
            </span>
            <Status state={archived.state} answered={archived.answered} />
          </form>
        </div>
      </div>
    </details>
  );
}
