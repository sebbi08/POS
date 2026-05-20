import { Router, Request, Response } from "express";
import {
  openOrder,
  addItemToOrder,
  removeItemFromOrder,
  printPickupReceipt,
  printFinalReceipt,
  closeOrder,
  cancelOrder,
} from "../../modules/orders/orders.commands";
import { orders, getOpenOrdersByTerminal } from "../../modules/orders/orders.projections";
import { generateCombinedReceiptPdf } from "../../modules/receipts/receipts.pdf";
import { getCompanySettings } from "../../modules/company/company.repository";
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

  const openOrders = getOpenOrdersByTerminal(terminalId);
  if (openOrders.length > 0) {
    res.status(409).json({ error: "Terminal already has an open order", orderId: openOrders[0].id });
    return;
  }

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

router.post("/:id/print", async (req: Request, res: Response): Promise<void> => {
  await printFinalReceipt(req.params.id);

  const order = orders.get(req.params.id);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  for (const item of order.items) {
    await printPickupReceipt(order.id, item.itemId);
  }

  generateCombinedReceiptPdf(req.params.id);

  const company = await getCompanySettings();

  const totalGross = order.items.reduce((sum: number, i: { total: number }) => sum + i.total, 0);
  const totalVat: Record<number, number> = {};
  for (const item of order.items) {
    totalVat[item.vatRate] =
      (totalVat[item.vatRate] || 0) + item.vatAmount;
  }

  res.json({
    status: "printed",
    order: {
      id: order.id,
      items: order.items.map((i) => ({
        name: i.name,
        qty: i.qty,
        total: i.total,
        vatRate: i.vatRate,
        vatAmount: i.vatAmount,
      })),
      totalGross: Math.round(totalGross * 100) / 100,
      totalVat: Object.fromEntries(
        Object.entries(totalVat).map(([k, v]) => [k, Math.round((v as number) * 100) / 100])
      ),
    },
    company,
  });
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
