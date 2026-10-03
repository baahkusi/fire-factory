"use client";

import Link from "next/link";
import {useRouter} from "next/navigation";
import {FormEvent, useState} from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {firebaseConfigured} from "../../lib/config";
import {getFirebaseAuth} from "../../lib/firebase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const configured = firebaseConfigured();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const auth = getFirebaseAuth();
      if (mode === "create") {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
      router.push("/account");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }

  if (!configured) {
    return (
      <>
        <h1>Sign in</h1>
        <p className="lede">
          Add the web config from the Firebase console to <code>frontend/.env.local</code>.
          The keys are listed in <code>frontend/.env.example</code>.
        </p>
        <Link href="/">Back</Link>
      </>
    );
  }

  return (
    <>
      <h1>{mode === "create" ? "Create account" : "Sign in"}</h1>
      <p className="lede">Email and password through Firebase Auth. The API reads the ID token.</p>
      <form className="card" onSubmit={onSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete={mode === "create" ? "new-password" : "current-password"}
          value={password}
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <button type="submit" disabled={pending}>
            {pending ? "Working…" : mode === "create" ? "Create account" : "Sign in"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setMode(mode === "create" ? "sign-in" : "create")}
          >
            {mode === "create" ? "Have an account?" : "Need an account?"}
          </button>
        </div>
      </form>
      <Link href="/">Back</Link>
    </>
  );
}
