import express from "express";

/**
 * Serves the built admin frontend (single-page app) from `dir`.
 * Must be mounted after all /api routes. No-op without a dir.
 */
export function mountFrontend(app: express.Express, dir: string | undefined): void {
  if (!dir) return;
  app.use(express.static(dir));
  app.get(/^(?!\/api(\/|$)).*/, (_req, res) => {
    res.sendFile("index.html", { root: dir });
  });
}
