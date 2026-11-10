import { Request, Response, Router } from "express";
import {
  getBookingDays,
  getReport,
  listTransactions,
} from "../../modules/reporting/reporting.projections.js";
import { checkAdmin } from "../middleware/auth.middleware.js";

const router = Router();

router.use(checkAdmin);

function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

function parseRange(
  req: Request,
  res: Response,
): { from: string; to: string } | null {
  const { from, to } = req.query;
  if (!isDay(from) || !isDay(to) || from > to) {
    res.status(400).json({ error: "Zeitraum ungültig" });
    return null;
  }
  return { from, to };
}

router.get("/booking-days", (_req: Request, res: Response): void => {
  res.json(getBookingDays());
});

router.get("/summary", (req: Request, res: Response): void => {
  const range = parseRange(req, res);
  if (!range) return;
  res.json(getReport(range.from, range.to));
});

router.get("/transactions", (req: Request, res: Response): void => {
  const range = parseRange(req, res);
  if (!range) return;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" ? v : undefined;
  const status = req.query.status;
  res.json(
    listTransactions({
      ...range,
      status: status === "closed" || status === "cancelled" ? status : "all",
      terminal: str(req.query.terminal),
      search: str(req.query.search),
    }),
  );
});

export default router;
