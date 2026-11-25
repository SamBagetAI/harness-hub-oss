import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ padding: "64px 24px", maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 className="h1">Nothing at this address</h1>
      <p className="mu">There is no harness, piece or page here. It may have been typed wrong: addresses never change once something is saved.</p>
      <div>
        <Link className="btn pri" href="/">
          Back to the harnesses
        </Link>
      </div>
    </main>
  );
}
