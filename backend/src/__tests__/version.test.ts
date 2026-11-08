import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { describe, expect, it } from "vitest";
import versionRoutes from "../api/routes/version.routes.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("shared version", () => {
  it("all package.json files carry the same version", () => {
    const versions = ["", "backend/", "frontend/", "terminal/"].map(
      (dir) => JSON.parse(readFileSync(`${root}${dir}package.json`, "utf8")).version,
    );
    expect([...new Set(versions)]).toEqual(["0.2.0"]);
  });

  it("GET /api/version returns the backend version", async () => {
    const app = express();
    app.use("/api/version", versionRoutes);
    const res = await request(app).get("/api/version");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ version: "0.2.0" });
  });
});
