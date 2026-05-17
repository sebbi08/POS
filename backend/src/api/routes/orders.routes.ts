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
import { getItem } from "../../modules/catalog/catalog.repository";
import { getGroup } from "../../modules/catalog/catalog.repository";

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
  openOrder(terminalId).then((id) => res.json({ id }));
});

router.post("/:id/items", async (req: Request, res: Response): Promise<void> => {
  const { itemId, qty } = req.body;
  try {
    const item = await getItem(itemId);
    if (!item) {
      res.status(404).json({ error: `Item ${itemId} not found` });
      return;
    }
    const group = await getGroup(item.groupId);
    const vatRate = group ? group.vatRate : 0;
    addItemToOrder(req.params.id, item.id, item.name, qty || 1, item.price, vatRate).then(() =>
      res.json({ status: "item added" })
    );
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
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
  const order = orders.get(req.params.id);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  cancelOrder(req.params.id, order.terminalId, reason).then((cancellationId) =>
    res.json({ status: "cancelled", cancellationId })
  ).catch((err: Error) =>
    res.status(400).json({ error: err.message })
  );
});

export default router;
