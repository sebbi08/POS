import { Request, Response, Router } from "express";
import { getOpenOrdersByTerminal } from "../../modules/orders/orders.projections.js";
import {
  createTerminal,
  deleteTerminal,
  getTerminalItems,
  listTerminals,
  updateTerminal,
} from "../../modules/terminals/terminals.repository.js";
import { checkAdmin } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  listTerminals().then((terminals) =>
    res.json(
      terminals.map(({ id, name, groupIds }) => ({ id, name, groupIds })),
    ),
  );
});

router.post("/", checkAdmin, (req: Request, res: Response): void => {
  const { name, groupIds, printerVendorId, printerProductId } = req.body;
  createTerminal(name, groupIds, printerVendorId, printerProductId).then((id) =>
    res.json({ id }),
  );
});

router.put("/:id", checkAdmin, (req: Request, res: Response): void => {
  const { name, groupIds, printerVendorId, printerProductId } = req.body;
  updateTerminal(
    req.params.id,
    name,
    groupIds,
    printerVendorId,
    printerProductId,
  ).then(() => res.json({ status: "updated" }));
});

router.delete("/:id", checkAdmin, (req: Request, res: Response): void => {
  const openOrders = getOpenOrdersByTerminal(req.params.id);
  if (openOrders.length > 0) {
    res.status(409).json({ error: "Cannot delete terminal with open orders" });
    return;
  }
  deleteTerminal(req.params.id).then(() => res.json({ status: "deleted" }));
});

router.get("/:id/items", (req: Request, res: Response): void => {
  getTerminalItems(req.params.id).then((items) => res.json(items));
});

export default router;
