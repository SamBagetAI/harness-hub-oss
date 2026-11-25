import type { Metadata } from "next";
import { AddPersonForm, RemovePersonForm } from "@/components/people-forms";
import { MemberPage } from "@/components/member-page";
import { allowedDomains, allowedEmails } from "@/lib/hub/members";
import { addedPeople } from "@/lib/hub/people";
import { day } from "@/lib/hub/safe-text";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Members · Harness Hub" };

/** Who is on the team. Admins add and remove people here; no redeploy is needed. */
export default function MembersPage() {
  return (
    <MemberPage
      active="members"
      render={async ({ admin }) => {
        if (!admin) {
          return (
            <>
              <h1 className="h1">Members</h1>
              <p className="mu">Only an admin of this Hub can see and change who is on the team.</p>
            </>
          );
        }
        const added = await addedPeople();
        const domains = allowedDomains();
        return (
          <>
            <h1 className="h1">Members</h1>
            <p className="mu tabnote" style={{ marginTop: -14 }}>
              Everyone here can read, run, copy and suggest on every harness, and make their own. A person is their Google account&apos;s
              primary, verified address.
            </p>

            <section className="sec" aria-labelledby="admins">
              <h2 id="admins" className="h2">
                Admins · set in the Hub&apos;s configuration. They can add people.
              </h2>
              <div className="box">
                {allowedEmails().map((email) => (
                  <div className="kv wide" key={email}>
                    <span className="mono">{email}</span>
                    <span className="mu">admin</span>
                  </div>
                ))}
                {domains.map((d) => (
                  <div className="kv wide" key={d}>
                    <span className="mono">anyone @{d}</span>
                    <span className="mu">admin, by domain</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="sec" aria-labelledby="added">
              <h2 id="added" className="h2">
                Added here · {added.length}
              </h2>
              {added.length === 0 && <p className="mu">Nobody yet.</p>}
              {added.length > 0 && (
                <div className="box">
                  {added.map((p) => (
                    <div className="kv wide" key={p.email}>
                      <span>
                        {p.name && `${p.name} · `}
                        <span className="mono">{p.email}</span>
                        <span className="mu">
                          {" "}
                          · added by {p.addedBy} on {day(p.addedAt)}
                        </span>
                      </span>
                      <RemovePersonForm email={p.email} />
                    </div>
                  ))}
                </div>
              )}
              <AddPersonForm />
              <p className="mu" style={{ fontSize: 13 }}>
                They sign in with that Google account on this site, or connect it from their agent. Removing someone closes their access
                within a minute; what they saved stays.
              </p>
            </section>
          </>
        );
      }}
    />
  );
}
