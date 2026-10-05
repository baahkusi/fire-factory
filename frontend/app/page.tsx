import Link from "next/link";
import {Fire} from "./fire";

export default function HomePage() {
  return (
    <div className="landing">
      <header className="landing-bar">
        <p className="meta">fire-factory-si</p>
        <nav>
          <Link className="button secondary" href="/login">Sign in</Link>
          <Link href="/account">Account</Link>
        </nav>
      </header>
      <div className="fire-stage">
        <Fire />
      </div>
      <h1 className="landing-title">A Firebase base, kept ready.</h1>
    </div>
  );
}
