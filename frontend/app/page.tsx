import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <p className="meta">fire-factory</p>
      <h1>A Firebase base for the next product.</h1>
      <p className="lede">
        Identity, a privileged staff grant, Firestore closed to client writes,
        and an agent pack that keeps the spec ahead of the code. The product
        domain is yours to write.
      </p>
      <nav>
        <Link className="button" href="/login">Sign in</Link>
        <Link className="button secondary" href="/account">Account</Link>
      </nav>
      <section className="card">
        <h2>What already runs</h2>
        <ul>
          <li><code>GET /health</code> on the Functions API</li>
          <li><code>GET /api/session</code> and display-name update</li>
          <li><code>GET /api/admin/staff</code> for admins</li>
          <li>Auth, Firestore, and Storage emulators</li>
        </ul>
      </section>
      <section className="card">
        <h2>Start a product</h2>
        <ol>
          <li>Read <code>GETTING_STARTED.md</code>.</li>
          <li>Bind a Firebase project, then edit <code>agent/SPEC.md</code> §1.4.</li>
          <li>Ask the agent to append plan steps. Do not paste a product in before the spec says so.</li>
        </ol>
      </section>
    </>
  );
}
