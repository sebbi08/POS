import { Request, Response, Router } from "express";
import { orders } from "../../modules/orders/orders.projections.js";
import {
  getDailyReport,
  transactionHistory,
} from "../../modules/reporting/reporting.projections.js";
import { checkAdmin } from "../middleware/auth.middleware.js";

const router = Router();

router.use(checkAdmin);

router.get("/daily", (req: Request, res: Response): void => {
  const date = req.query.date as string | undefined;
  res.json(getDailyReport(date));
});

router.get("/transactions", (req: Request, res: Response): void => {
  let result = [...transactionHistory];

  for (const order of orders.values()) {
    if (order.status === "open" && !order.cancelsOrderId) {
      const itemsText = order.items
        .map((i) => `${i.qty}x ${i.name}`)
        .join(", ");
      const total = order.items.reduce((sum, i) => sum + i.total, 0);
      result.push({
        orderId: order.id,
        terminalId: order.terminalId,
        items: itemsText,
        itemCount: order.items.length,
        totalGross: Math.round(total * 100) / 100,
        totalVat: 0,
        status: "open",
        closedAt: "",
      });
    }
  }

  const status = req.query.status as string;
  if (status && status !== "all") {
    result = result.filter((t) => t.status === status);
  }

  const terminal = req.query.terminal as string;
  if (terminal) {
    result = result.filter((t) => t.terminalId === terminal);
  }

  const search = req.query.search as string;
  if (search) {
    const s = search.toLowerCase();
    result = result.filter(
      (t) =>
        t.orderId.toLowerCase().includes(s) ||
        t.items.toLowerCase().includes(s),
    );
  }

  res.json(result);
});

export default router;
