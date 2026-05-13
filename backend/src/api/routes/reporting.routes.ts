import { Router, Request, Response } from "express";
import { checkAdmin } from "../middleware/auth.middleware";
import { getDailyReport, transactionHistory } from "../../modules/reporting/reporting.projections";

const router = Router();

router.use(checkAdmin);

router.get("/daily", (req: Request, res: Response): void => {
  const date = req.query.date as string | undefined;
  res.json(getDailyReport(date));
});

router.get("/transactions", (req: Request, res: Response): void => {
  let result = [...transactionHistory];

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
        t.items.toLowerCase().includes(s)
    );
  }

  res.json(result);
});

export default router;
