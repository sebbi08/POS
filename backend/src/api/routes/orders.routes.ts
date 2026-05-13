import { Router, Request, Response } from "express";
import {
  openOrder,
  addItemToOrder,
  removeItemFromOrder,
  printPickupReceipt,
  printFinalReceipt,
  payOrder,
  closeOrder,
  cancelOrder,
} from "../../modules/orders/orders.commands";
import { orders } from "../../modules/orders/orders.projections";
import { generatePickupReceiptPdf, generateFinalReceiptPdf } from "../../modules/receipts/receipts.pdf";

const router = Router();

router.get("/", (req: Request, res: Response): void => {
  const terminalId = req.query.terminalId as string;
  const list = Array.from(orders.values()).filter(
    (o) => o.terminalId === terminalId
  );
  res.json(list);
});

router.post("/open", (req: Request, res: Response): void => {
  const { terminalId } = req.body;
  openOrder(terminalId, terminalId).then((id) => res.json({ id }));
});

router.post("/:id/items", (_req: Request, res: Response): void => {
  const { itemId, qty } = _req.body;
  addItemToOrder(_req.params.id, itemId, qty || 1).then(() =>
    res.json({ status: "item added" })
  );
});

router.delete("/:id/items/:itemId", (req: Request, res: Response): void => {
  removeItemFromOrder(req.params.id, req.params.itemId).then(() =>
    res.json({ status: "item removed" })
  );
});

router.post("/:id/print-pickup", (req: Request, res: Response): void => {
  const { itemId } = req.body;
  printPickupReceipt(req.params.id, itemId).then(() => {
    const order = orders.get(req.params.id);
    generatePickupReceiptPdf(req.params.id, itemId, order?.pickupSeq ?? 1);
    res.json({ status: "printed" });
  });
});

router.post("/:id/print-final", (req: Request, res: Response): void => {
  printFinalReceipt(req.params.id).then(() => {
    generateFinalReceiptPdf(req.params.id);
    res.json({ status: "printed" });
  });
});

router.post("/:id/pay", (req: Request, res: Response): void => {
  payOrder(req.params.id).then(() => res.json({ status: "paid" }));
});

router.post("/:id/close", (req: Request, res: Response): void => {
  closeOrder(req.params.id).then(() => res.json({ status: "closed" }));
});

router.post("/:id/cancel", (req: Request, res: Response): void => {
  const { reason } = req.body;
  cancelOrder(req.params.id, reason || "Cancelled from terminal", "terminal").then(() =>
    res.json({ status: "cancelled" })
  );
});

export default router;
