import request from "supertest";
import {describe, expect, it} from "vitest";
import app from "../src/app";

describe("GET /health", () => {
  it("returns runtime health without secrets or demo flags", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      service: "fire-factory",
      status: "ok",
      store: "memory",
    });
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("accepts X-Forwarded-For without a rate-limit crash", async () => {
    const response = await request(app)
      .get("/api/session")
      .set("x-forwarded-for", "203.0.113.195, 70.41.3.18");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("unauthenticated");
  });

  it("returns JSON for an unknown route", async () => {
    const response = await request(app).get("/missing");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("not-found");
  });
});
