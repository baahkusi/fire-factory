import request from "supertest";
import {beforeEach, describe, expect, it} from "vitest";
import app from "../src/app";
import {listAudit} from "../src/stores/audit";
import {resetMemoryStore} from "../src/stores/memory";
import {upsertStaff} from "../src/stores/staff";

const member = "user-1|ada@example.com|member";

describe("session and roles", () => {
  beforeEach(() => {
    resetMemoryStore();
  });

  it("opens a member session and ignores a role smuggled in the body", async () => {
    const created = await request(app)
      .get("/api/session")
      .set("x-test-user", member);

    expect(created.status).toBe(200);
    expect(created.body.roles).toEqual(["member"]);
    expect(created.body.profile.email).toBe("ada@example.com");

    const patched = await request(app)
      .patch("/api/session")
      .set("x-test-user", member)
      .send({displayName: "Ada <Lovelace>", roles: ["admin"]});

    expect(patched.status).toBe(200);
    expect(patched.body.profile.displayName).toBe("Ada Lovelace");
    expect(patched.body.profile.roles).toEqual(["member"]);
    expect(patched.body.roles).toEqual(["member"]);

    const audit = await listAudit();
    expect(audit.map((entry) => entry.action)).toContain(
      "profile.display_name_updated"
    );
  });

  it("lets an active staff grant override a member claim", async () => {
    await upsertStaff({
      email: "ada@example.com",
      roles: ["admin"],
      active: true,
      displayName: "Ada",
      updatedAt: new Date().toISOString(),
    });

    const response = await request(app)
      .get("/api/session")
      .set("x-test-user", member);

    expect(response.status).toBe(200);
    expect(response.body.roles).toEqual(["admin"]);
  });

  it("forces member when the staff grant is inactive", async () => {
    await upsertStaff({
      email: "ada@example.com",
      roles: ["admin"],
      active: false,
      displayName: "Ada",
      updatedAt: new Date().toISOString(),
    });

    const response = await request(app)
      .get("/api/session")
      .set("x-test-user", "user-1|ada@example.com|admin");

    expect(response.body.roles).toEqual(["member"]);
  });

  it("hides the staff directory from members and shows it to admins", async () => {
    await upsertStaff({
      email: "boss@example.com",
      roles: ["admin"],
      active: true,
      displayName: "Boss",
      updatedAt: new Date().toISOString(),
    });

    const denied = await request(app)
      .get("/api/admin/staff")
      .set("x-test-user", member);
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .get("/api/admin/staff")
      .set("x-test-user", "admin-1|boss@example.com|member");
    expect(allowed.status).toBe(200);
    expect(allowed.body.staff).toEqual([
      expect.objectContaining({email: "boss@example.com", roles: ["admin"]}),
    ]);
  });

  it("rejects an empty display name", async () => {
    await request(app).get("/api/session").set("x-test-user", member);
    const response = await request(app)
      .patch("/api/session")
      .set("x-test-user", member)
      .send({displayName: "   "});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid-request");
    expect(response.body.error.message).not.toMatch(/^\s*\[/);
  });
});
