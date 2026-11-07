import { Request, Response, Router } from "express";
import { getOpenOrdersByTerminal } from "../../modules/orders/orders.projections.js";
import {
  createTerminal,
  deleteTerminal,
  generateTerminalKey,
  getTerminal,
  getTerminalKey,
  listTerminals,
  updateTerminal,
} from "../../modules/terminals/terminals.repository.js";
import { checkAdmin } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/", (_req: Request, res: Response): void => {
  listTerminals().then((terminals) =>
    res.json(
      terminals.map(({ id, name, groupIds, printPickupReceipts }) => ({
        id,
        name,
        groupIds,
        printPickupReceipts,
      })),
    ),
  );
});

router.post("/", checkAdmin, (req: Request, res: Response): void => {
  const { name, groupIds, printPickupReceipts } = req.body;
  createTerminal(name, groupIds, printPickupReceipts ?? true).then((id) =>
    res.json({ id }),
  );
});

router.put("/:id", checkAdmin, (req: Request, res: Response): void => {
  const { name, groupIds, printPickupReceipts } = req.body;
  updateTerminal(req.params.id as string, name, groupIds, printPickupReceipts).then(() => res.json({ status: "updated" }));
});

router.delete("/:id", checkAdmin, (req: Request, res: Response): void => {
  const openOrders = getOpenOrdersByTerminal(req.params.id as string);
  if (openOrders.length > 0) {
    res.status(409).json({ error: "Cannot delete terminal with open orders" });
    return;
  }
  deleteTerminal(req.params.id as string).then(() => res.json({ status: "deleted" }));
});

router.get("/:id/key", checkAdmin, (req: Request, res: Response): void => {
  const id = req.params.id as string;
  getTerminal(id).then(async (terminal) => {
    if (!terminal) {
      res.status(404).json({ error: "Terminal not found" });
      return;
    }
    res.json({ key: await getTerminalKey(id) });
  });
});

router.post("/:id/key", checkAdmin, (req: Request, res: Response): void => {
  const id = req.params.id as string;
  getTerminal(id).then(async (terminal) => {
    if (!terminal) {
      res.status(404).json({ error: "Terminal not found" });
      return;
    }
    res.json({ key: await generateTerminalKey(id) });
  });
});

export default router;
