import { Request, Response, Router } from "express";
import {
  getCatalogSnapshot,
  ingestUploads,
} from "../../modules/sync/sync.service.js";
import { Terminal } from "../../modules/terminals/terminals.types.js";
import { checkTerminalKey } from "../middleware/terminal-auth.middleware.js";

const MAX_ORDERS_PER_UPLOAD = 200;

const router = Router();

router.get(
  "/catalog",
  checkTerminalKey,
  async (_req: Request, res: Response): Promise<void> => {
    const terminal = res.locals.terminal as Terminal;
    res.json(await getCatalogSnapshot(terminal));
  },
);

router.post(
  "/bookings",
  checkTerminalKey,
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

export default router;
