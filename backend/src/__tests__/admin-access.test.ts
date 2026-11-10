import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config", () => ({ config: { adminPin: "0000" } }));

import {
  checkAdmin,
  resetAdminAccessForTests,
} from "../api/middleware/auth.middleware.js";
import authRoutes from "../api/routes/auth.routes.js";

const app = express();
// Lets the tests pick the client IP via X-Forwarded-For.
app.set("trust proxy", true);
app.use(express.json());
app.use("/api/auth", authRoutes);
app.get("/admin", checkAdmin, (_req, res) => {
  res.json({ ok: true });
});

const LOCKED = {
  error: "Zu viele falsche PIN-Versuche – bitte in 5 Minuten erneut versuchen",
};

let nowMs = 1_000_000;

function login(pin: unknown, ip = "203.0.113.1") {
  return request(app)
    .post("/api/auth/login")
    .set("x-forwarded-for", ip)
    .send({ pin });
}

function admin(pin: string | undefined, ip = "203.0.113.1") {
  const r = request(app).get("/admin").set("x-forwarded-for", ip);
  if (pin !== undefined) r.set("x-admin-pin", pin);
  return r;
}

beforeEach(() => {
  nowMs = 1_000_000;
  resetAdminAccessForTests(() => nowMs);
});

describe("admin PIN lockout — login", () => {
  it("wrong PIN → 401, short PIN → 400, correct → 200", async () => {
    expect((await login("1234")).status).toBe(401);
    expect((await login("12")).status).toBe(400);
    expect((await login(undefined)).status).toBe(400);
    expect((await login("0000")).status).toBe(200);
  });

  it("non-string PIN → 400 instead of a crash", async () => {
    expect((await login(1234)).status).toBe(400);
  });

  it("5 wrong PINs → 6th request 429 even with the correct PIN", async () => {
    for (let i = 0; i < 5; i++) expect((await login("1234")).status).toBe(401);
    const res = await login("0000");
    expect(res.status).toBe(429);
    expect(res.body).toEqual(LOCKED);
  });

  it("short PINs do not count as failures", async () => {
    for (let i = 0; i < 6; i++) expect((await login("12")).status).toBe(400);
    expect((await login("0000")).status).toBe(200);
  });

  it("lock expires after 300 000 ms", async () => {
    for (let i = 0; i < 5; i++) await login("1234");
    nowMs += 299_999;
    expect((await login("0000")).status).toBe(429);
    nowMs += 1;
    expect((await login("0000")).status).toBe(200);
  });

  it("success resets the counter", async () => {
    for (let i = 0; i < 4; i++) await login("1234");
    expect((await login("0000")).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login("1234")).status).toBe(401);
    expect((await login("0000")).status).toBe(200);
  });

  it("a different IP is not locked", async () => {
    for (let i = 0; i < 5; i++) await login("1234", "203.0.113.1");
    expect((await login("0000", "203.0.113.1")).status).toBe(429);
    expect((await login("0000", "203.0.113.2")).status).toBe(200);
  });
});

describe("admin PIN lockout — checkAdmin", () => {
  it("wrong or missing PIN → 403, correct → next", async () => {
    expect((await admin("1234")).status).toBe(403);
    expect((await admin(undefined)).status).toBe(403);
    expect((await admin("0000")).status).toBe(200);
  });

  it("5 wrong PINs → 6th request 429 even with the correct PIN", async () => {
    for (let i = 0; i < 5; i++) expect((await admin("1234")).status).toBe(403);
    const res = await admin("0000");
    expect(res.status).toBe(429);
    expect(res.body).toEqual(LOCKED);
  });

  it("lock expires after 300 000 ms", async () => {
    for (let i = 0; i < 5; i++) await admin("1234");
    nowMs += 299_999;
    expect((await admin("0000")).status).toBe(429);
    nowMs += 1;
    expect((await admin("0000")).status).toBe(200);
  });

  it("a different IP is not locked", async () => {
    for (let i = 0; i < 5; i++) await admin("1234", "203.0.113.1");
    expect((await admin("0000", "203.0.113.2")).status).toBe(200);
  });
});

describe("admin PIN lockout — shared counter", () => {
  it("failures on login and checkAdmin add up", async () => {
    for (let i = 0; i < 3; i++) await login("1234");
    for (let i = 0; i < 2; i++) await admin("1234");
    expect((await login("0000")).status).toBe(429);
    expect((await admin("0000")).status).toBe(429);
  });

  it("a successful checkAdmin resets the login counter", async () => {
    for (let i = 0; i < 4; i++) await login("1234");
    expect((await admin("0000")).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login("1234")).status).toBe(401);
    expect((await login("0000")).status).toBe(200);
  });
});
