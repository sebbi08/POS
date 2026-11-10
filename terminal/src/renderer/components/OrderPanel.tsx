import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LocalOrder } from "../domain/orders";
import { euro } from "./format";

interface Props {
  order: LocalOrder | undefined;
  disabled: boolean;
  onChangeQty: (itemId: string, delta: 1 | -1) => void;
  onRemoveLine: (itemId: string) => void;
  onPay: () => void;
  onDiscard: () => void;
}

/** Radix sizes the viewport content as a table, which would stop long names from truncating. */
const LINES_FIT_WIDTH = "[&_[data-slot=scroll-area-viewport]>div]:block!";

function OrderPanel({ order, disabled, onChangeQty, onRemoveLine, onPay, onDiscard }: Props) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (!order) {
    return (
      <section aria-label="Bestellung" className="h-full">
        <Card className="h-full p-4 items-center justify-center text-muted-foreground text-center">
          Keine offene Bestellung. Artikel antippen zum Starten.
        </Card>
      </section>
    );
  }

  return (
    <section aria-label="Bestellung" className="h-full">
      <Card className="h-full gap-3 p-4">
        <h2 className="font-bold text-lg">Bestellung #{order.id.slice(0, 8)}</h2>

        {/* type="auto": the scrollbar shows whenever lines overflow, not only on hover */}
        <ScrollArea type="auto" className={`flex-1 min-h-0 ${LINES_FIT_WIDTH}`}>
          <div className="space-y-2">
            {order.lines.map((line) => (
              <div key={line.itemId} className="flex items-center justify-between gap-2 bg-muted rounded-lg p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{line.name}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="touch"
                      onClick={() => onChangeQty(line.itemId, -1)}
                      disabled={disabled}
                      className="text-lg"
                      aria-label="Menge verringern"
                    >
                      −
                    </Button>
                    <span className="font-bold w-8 text-center">{line.qty}</span>
                    <Button
                      variant="outline"
                      size="touch"
                      onClick={() => onChangeQty(line.itemId, 1)}
                      disabled={disabled}
                      className="text-lg"
                      aria-label="Menge erhöhen"
                    >
                      +
                    </Button>
                    <span className="text-muted-foreground text-sm ml-1">× {euro(line.unitPrice)}</span>
                  </div>
                </div>
                <div className="font-bold">{euro(line.total)}</div>
                <Button
                  variant="outline"
                  size="touch"
                  onClick={() => onRemoveLine(line.itemId)}
                  disabled={disabled}
                  className="text-destructive text-xl"
                  aria-label="Artikel entfernen"
                >
                  ×
                </Button>
              </div>
            ))}
            {order.lines.length === 0 && (
              <div className="text-muted-foreground text-center py-4">Artikel links antippen</div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t pt-3">
          <div className="flex justify-between font-bold text-xl">
            <span>Summe</span>
            <span>{euro(order.totalGross)}</span>
          </div>
        </div>

        {confirmDiscard ? (
          <div className="bg-background rounded-lg p-3">
            <p className="text-center font-semibold mb-3">Bestellung verwerfen?</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="destructive"
                size="touch-lg"
                onClick={() => { setConfirmDiscard(false); onDiscard(); }}
                disabled={disabled}
              >
                Ja, verwerfen
              </Button>
              <Button variant="secondary" size="touch-lg" onClick={() => setConfirmDiscard(false)}>
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Button variant="destructive" size="touch" onClick={() => setConfirmDiscard(true)} disabled={disabled} className="font-semibold">
              Verwerfen
            </Button>
            <Button
              size="touch-lg"
              onClick={onPay}
              disabled={disabled || order.lines.length === 0}
              className="col-span-2"
            >
              Bezahlen & Drucken
            </Button>
          </div>
        )}
      </Card>
    </section>
  );
}

export default OrderPanel;
