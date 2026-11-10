import express from "express";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { mountFrontend } from "../static.js";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "pos-static-"));
  writeFileSync(join(dir, "index.html"), "<p>admin</p>");
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "app.js"), "console.log(1)");
});

function makeApp(staticDir: string | undefined) {
  const app = express();
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  mountFrontend(app, staticDir);
  return app;
}

describe("mountFrontend", () => {
  it("serves index.html at /", async () => {
    const res = await request(makeApp(dir)).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<p>admin</p>");
  });

  it("serves static assets", async () => {
    const res = await request(makeApp(dir)).get("/assets/app.js");
    expect(res.status).toBe(200);
    expect(res.text).toBe("console.log(1)");
  });

  it("deep admin routes fall back to index.html", async () => {
    const res = await request(makeApp(dir)).get("/reporting/2026");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<p>admin</p>");
  });

  it("api routes still win", async () => {
    const res = await request(makeApp(dir)).get("/api/health");
    expect(res.body).toEqual({ status: "ok" });
  });

  it("unknown /api path is 404, not the page", async () => {
    const res = await request(makeApp(dir)).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("<p>admin</p>");
  });

  it("without a dir nothing is served", async () => {
    const res = await request(makeApp(undefined)).get("/");
    expect(res.status).toBe(404);
  });
});
