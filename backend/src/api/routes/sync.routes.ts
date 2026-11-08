import express, {
  NextFunction,
  Request,
  Response,
  Router,
} from "express";
import {
  getCatalogSnapshot,
  ingestUploads,
} from "../../modules/sync/sync.service.js";
import { Terminal } from "../../modules/terminals/terminals.types.js";
import { checkSyncAccess } from "../middleware/sync-access.middleware.js";
import { checkTerminalKey } from "../middleware/terminal-auth.middleware.js";

const MAX_ORDERS_PER_UPLOAD = 200;

const router = Router();

router.get(
  "/catalog",
  checkTerminalKey,
  checkSyncAccess,
  async (_req: Request, res: Response): Promise<void> => {
    const terminal = res.locals.terminal as Terminal;
    res.json(await getCatalogSnapshot(terminal));
  },
);

router.post(
  "/bookings",
  checkTerminalKey,
  checkSyncAccess,
  // Parsed only after the key and access checks; a festival's bookings exceed the default limit.
  express.json({ limit: "10mb" }),
  async (req: Request, res: Response): Promise<void> => {
    const uploads = req.body?.orders;
    if (!Array.isArray(uploads) || uploads.length > MAX_ORDERS_PER_UPLOAD) {
      res.status(400).json({ error: "Ungültige Anfrage" });
      return;
    }
    const terminal = res.locals.terminal as Terminal;
    res.json(await ingestUploads(terminal.id, uploads));
  },
);

router.use(
  (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    const status = (err as { status?: unknown }).status;
    // Body parser errors (malformed JSON, too large) carry a 4xx status.
    if (typeof status === "number" && status >= 400 && status < 500) {
      res.status(status).json({ error: "Ungültige Anfrage" });
      return;
    }
    console.error("[backend:sync] request failed", err);
    res.status(500).json({ error: "Serverfehler" });
  },
);

export default router;
