import {describe, expect, it} from "vitest";
import {resolveRoles} from "../src/middlewares";
import {sanitizeErrorMessage, statusForCode} from "../src/error";
import {assertProductionSafety} from "../src/config";
import {sanitizeText} from "../src/lib/sanitize";

describe("resolveRoles", () => {
  it("defaults to member", () => {
    expect(resolveRoles({})).toEqual(["member"]);
  });

  it("prefers an active staff grant over claims", () => {
    expect(resolveRoles({
      claimsRoles: ["member"],
      staff: {
        email: "a@example.com",
        roles: ["operator"],
        active: true,
        displayName: "A",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    })).toEqual(["operator"]);
  });

  it("drops unknown role strings", () => {
    expect(resolveRoles({claimsRoles: ["root", "admin"]})).toEqual(["admin"]);
  });
});

describe("errors and sanitizing", () => {
  it("maps codes to HTTP status", () => {
    expect(statusForCode("forbidden")).toBe(403);
    expect(statusForCode("invalid-request")).toBe(400);
  });

  it("hides stack traces and filesystem paths", () => {
    const hidden = sanitizeErrorMessage(
      "Error: boom at Module.run (/Users/me/app/node_modules/pkg/index.js:1:1)"
    );
    expect(hidden).not.toMatch(/node_modules/);
    expect(hidden).not.toMatch(/\/Users\//);
  });

  it("removes angle brackets from text", () => {
    expect(sanitizeText("Ada <script>")).toBe("Ada script");
  });
});

describe("production safety", () => {
  it("refuses the memory store when NODE_ENV is production", () => {
    const previousNode = process.env.NODE_ENV;
    const previousStore = process.env.USE_MEMORY_STORE;
    const previousEmulator = process.env.FUNCTIONS_EMULATOR;
    process.env.NODE_ENV = "production";
    process.env.USE_MEMORY_STORE = "1";
    delete process.env.FUNCTIONS_EMULATOR;

    expect(() => assertProductionSafety()).toThrow(/USE_MEMORY_STORE/);

    process.env.NODE_ENV = previousNode;
    process.env.USE_MEMORY_STORE = previousStore;
    if (previousEmulator === undefined) {
      delete process.env.FUNCTIONS_EMULATOR;
    } else {
      process.env.FUNCTIONS_EMULATOR = previousEmulator;
    }
  });
});
