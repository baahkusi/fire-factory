import {afterEach, describe, expect, it} from "vitest";
import {apiBaseUrl, firebaseConfigured, siteUrl} from "../lib/config";

const KEYS = [
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe("frontend config", () => {
  it("defaults the API and site to localhost and strips a trailing slash", () => {
    expect(apiBaseUrl()).toBe("http://127.0.0.1:5001");
    expect(siteUrl()).toBe("http://127.0.0.1:3000");
    process.env.NEXT_PUBLIC_API_BASE_URL = "https://example.com/api/";
    expect(apiBaseUrl()).toBe("https://example.com/api");
  });

  it("treats Firebase as configured only when the web keys are all set", () => {
    expect(firebaseConfigured()).toBe(false);
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "key";
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "fire-factory.firebaseapp.com";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "fire-factory";
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "app";
    expect(firebaseConfigured()).toBe(true);
  });
});
