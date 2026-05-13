import { Router, Request, Response } from "express";
import { authMiddleware, requireAdmin } from "../middleware/auth.middleware";
import {
  createTerminal,
  updateTerminal,
  archiveTerminal,
} from "../../modules/terminals/terminals.commands";
import { terminals, getTerminalItems } from "../../modules/terminals/terminals.projections";

const router = Router();

router.get("/", authMiddleware, (_req: Request, res: Response): void => {
  res.json(Array.from(terminals.values()));
});

router.post("/", authMiddleware, requireAdmin, (req: Request, res: Response): void => {
  const { name, groupIds, printerVendorId, printerProductId } = req.body;
  createTerminal(name, groupIds, printerVendorId, printerProductId).then((id) =>
    res.json({ id })
  );
});

router.put("/:id", authMiddleware, requireAdmin, (req: Request, res: Response): void => {
  const { name, groupIds, printerVendorId, printerProductId } = req.body;
  updateTerminal(req.params.id, name, groupIds, printerVendorId, printerProductId).then(() =>
    res.json({ status: "updated" })
  );
});

router.delete("/:id", authMiddleware, requireAdmin, (req: Request, res: Response): void => {
  archiveTerminal(req.params.id).then(() =>
    res.json({ status: "archived" })
  );
});

router.get("/:id/items", authMiddleware, (req: Request, res: Response): void => {
  res.json(getTerminalItems(req.params.id));
});

export default router;
