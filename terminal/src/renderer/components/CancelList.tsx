import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TouchDialog } from "@/components/ui/touch-dialog";
import type { LocalOrder } from "../domain/orders";
import { euro } from "./format";

interface Props {
  orders: LocalOrder[];
  onCancelOrder: (orderId: string) => void;
  onClose: () => void;
}

/** Closed bookings not yet transferred; cancelling one needs an explicit confirmation. */
function CancelList({ orders, onCancelOrder, onClose }: Props) {
  const [selected, setSelected] = useState<LocalOrder | null>(null);
  const newestFirst = [...orders].reverse();

  return (
    <TouchDialog title="Buchung stornieren" onClose={onClose} className="w-[32rem] max-h-[80vh] flex flex-col">
      {selected ? (
        <div className="space-y-4">
          <p className="text-lg text-center">
            {`Buchung #${selected.id.slice(0, 8)} über ${euro(selected.totalGross)} wirklich stornieren?`}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="destructive"
              size="touch-lg"
              onClick={() => { onCancelOrder(selected.id); onClose(); }}
            >
              Ja, stornieren
            </Button>
            <Button type="button" variant="secondary" size="touch-lg" onClick={() => setSelected(null)}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
            {newestFirst.map((o) => (
              <Button
                key={o.id}
                type="button"
                variant="secondary"
                size="touch"
                onClick={() => setSelected(o)}
                className="w-full justify-between"
              >
                <span className="font-mono">#{o.id.slice(0, 8)}</span>
                <span className="text-muted-foreground text-sm">
                  {o.closedAt ? new Date(o.closedAt).toLocaleTimeString("de-DE") : ""}
                </span>
                <span className="font-bold">{euro(o.totalGross)}</span>
              </Button>
            ))}
            {orders.length === 0 && (
              <div className="text-muted-foreground text-center py-6">Keine stornierbaren Buchungen</div>
            )}
          </div>
          <p className="text-muted-foreground text-sm">Bereits übertragene Buchungen werden im Admin-Bereich storniert.</p>
          <Button type="button" variant="secondary" size="touch-lg" onClick={onClose}>
            Schließen
          </Button>
        </>
      )}
    </TouchDialog>
  );
}

export default CancelList;
