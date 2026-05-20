# Pickup Receipt Printing

**Date**: 2026-05-19
**Status**: approved

## Summary

Implement pickup receipt printing on the thermal printer. After the Final Receipt prints, each order item gets its own pickup receipt with a cut in between. The backend continues to produce one combined PDF.

## Backend Changes

### `orders.commands.ts` — Add `printPickupReceipt` command

```ts
export async function printPickupReceipt(orderId: string, itemId: string): Promise<void> {
  const data: PickupReceiptPrintedEvent = { orderId, itemId };
  await appendOrderEvent(STREAM(orderId), "PickupReceiptPrinted", data as unknown as Record<string, unknown>);
}
```

Import `PickupReceiptPrintedEvent` from types.

### `orders.routes.ts` — Modify `POST /:id/print`

After `printFinalReceipt`, loop through order items and emit `printPickupReceipt` for each. Then generate combined PDF as before.

## Frontend Changes

### `POSLayout.tsx` — Extend `handlePrint`

After printing the Final Receipt with cut, loop through `orderData.items` and format/print each as a pickup receipt with cut.

Pickup receipt thermal layout:
- Company header (same as final)
- `Pickup #N` title
- `Qty× ItemName`
- Timestamp and order reference
- Cut

## No Changes

- `generateCombinedReceiptPdf` — already produces final + all pickups as single PDF
- `OrderPanel` — single Print button unchanged
- `orders.projections.ts` — already handles `PickupReceiptPrinted` (increments `pickupSeq`)
- `orders.types.ts` — `PickupReceiptPrintedEvent` already defined
