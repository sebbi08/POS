import { Router, Request, Response } from "express";
import { checkAdmin } from "../middleware/auth.middleware";
import {
  listTerminals,
  createTerminal,
  updateTerminal,
  deleteTerminal,
  getTerminalItems,
} from "../../modules/terminals/terminals.repository";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  listTerminals().then((terminals) =>
    res.json(
      terminals.map(({ id, name, groupIds }) => ({ id, name, groupIds }))
    )
  );
});

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
  deleteTerminal(req.params.id).then(() =>
    res.json({ status: "deleted" })
  );
});

router.get("/:id/items", (req: Request, res: Response): void => {
  getTerminalItems(req.params.id).then((items) => res.json(items));
});

export default router;
