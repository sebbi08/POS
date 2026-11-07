import { Request, Response, Router } from "express";
import { cancelOrder } from "../../modules/orders/orders.commands.js";
import { orders } from "../../modules/orders/orders.projections.js";
import { checkAdmin } from "../middleware/auth.middleware.js";

const router = Router();

router.post(
  "/:id/cancel",
  checkAdmin,
  (req: Request, res: Response): void => {
    const { reason } = req.body;
    const order = orders.get(req.params.id as string);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    cancelOrder(req.params.id as string, order.terminalId, reason)
      .then((cancellationId) =>
        res.json({ status: "cancelled", cancellationId }),
      )
      .catch((err: Error) => res.status(400).json({ error: err.message }));
  },
);

export default router;
