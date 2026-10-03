"use client";

import Link from "next/link";
import {FormEvent, useEffect, useState} from "react";
import {onAuthStateChanged, signOut, type User} from "firebase/auth";
import {firebaseConfigured} from "../../lib/config";
import {getFirebaseAuth} from "../../lib/firebase";
import {getSession, updateDisplayName, type SessionResponse} from "../../lib/api";

export default function AccountPage() {
  const configured = firebaseConfigured();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!configured) return;
    return onAuthStateChanged(getFirebaseAuth(), (next) => {
      setUser(next);
    });
  }, [configured]);

  useEffect(() => {
    if (!user) {
      setSession(null);
      return;
    }
    let cancelled = false;
    user.getIdToken().then((token) => getSession(token)).then((body) => {
      if (cancelled) return;
      setSession(body);
      setDisplayName(body.profile?.displayName ?? "");
      setError(null);
    }).catch((caught: unknown) => {
      if (cancelled) return;
      setError(caught instanceof Error ? caught.message : "Could not load session.");
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    setPending(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const updated = await updateDisplayName(token, displayName);
      setSession((current) => current ? {...current, profile: updated.profile} : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Update failed.");
    } finally {
      setPending(false);
    }
  }

  if (!configured) {
    return (
      <>
        <h1>Account</h1>
        <p className="lede">Firebase web config is not set. See <code>frontend/.env.example</code>.</p>
        <Link href="/">Back</Link>
      </>
    );
  }

  if (user === undefined) return <h1>Account</h1>;

  if (!user) {
    return (
      <>
        <h1>Account</h1>
        <p className="lede">Sign in to load your profile from the API.</p>
        <Link className="button" href="/login">Sign in</Link>
      </>
    );
  }

  return (
    <>
      <h1>Account</h1>
      <p className="meta">{user.email}</p>
      {session ? (
        <p className="meta">Roles: {session.roles.join(", ") || "member"}</p>
      ) : (
        <p className="meta">Loading session…</p>
      )}
      <form className="card" onSubmit={onSubmit}>
        <label htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          value={displayName}
          maxLength={80}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
        {error ? <p className="error">{error}</p> : null}
        <div className="row">
          <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          <button
            type="button"
            className="secondary"
            onClick={() => signOut(getFirebaseAuth())}
          >
            Sign out
          </button>
        </div>
      </form>
      <Link href="/">Back</Link>
    </>
  );
}
