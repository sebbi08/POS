import { Router, Request, Response } from "express";
import { checkAdmin } from "../middleware/auth.middleware";
import {
  createTerminal,
  updateTerminal,
  archiveTerminal,
} from "../../modules/terminals/terminals.commands";
import { terminals, getTerminalItems } from "../../modules/terminals/terminals.projections";

const router = Router();

// Public: list active (non-archived) terminals
router.get("/", (_req: Request, res: Response): void => {
  res.json(
    Array.from(terminals.values())
      .filter((t) => !t.archived)
      .map(({ id, name, groupIds }) => ({ id, name, groupIds }))
  );
});

// Admin-only mutations
router.post("/", checkAdmin, (req: Request, res: Response): void => {
  const { name, groupIds, printerVendorId, printerProductId } = req.body;
  createTerminal(name, groupIds, printerVendorId, printerProductId).then((id) =>
    res.json({ id })
  );
});

router.put("/:id", checkAdmin, (req: Request, res: Response): void => {
  const { name, groupIds, printerVendorId, printerProductId } = req.body;
  updateTerminal(req.params.id, name, groupIds, printerVendorId, printerProductId).then(() =>
    res.json({ status: "updated" })
  );
});

router.delete("/:id", checkAdmin, (req: Request, res: Response): void => {
  archiveTerminal(req.params.id).then(() =>
    res.json({ status: "archived" })
  );
});

// Public: get items for a terminal
router.get("/:id/items", (req: Request, res: Response): void => {
  res.json(getTerminalItems(req.params.id));
});

export default router;
