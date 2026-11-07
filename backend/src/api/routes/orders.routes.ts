import { Request, Response, Router } from "express";
import { cancelOrder } from "../../modules/orders/orders.commands.js";
import { orders } from "../../modules/orders/orders.projections.js";
import { checkAdmin } from "../middleware/auth.middleware.js";

const router = Router();

router.post(
  "/:id/cancel",
  checkAdmin,
  async (req: Request, res: Response): Promise<void> => {
    // The reason is optional, and so is the whole body.
    const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
    const order = orders.get(req.params.id as string);
    if (!order) {
      res.status(404).json({ error: "Bestellung nicht gefunden" });
      return;
    }
    try {
      const cancellationId = await cancelOrder(req.params.id as string, order.terminalId, reason);
      res.json({ status: "cancelled", cancellationId });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

export default router;
