import { Button } from "@/components/ui/button";
import { TouchDialog } from "@/components/ui/touch-dialog";
import type { TerminalSettings } from "../../shared/types";
import PrinterSettings from "./PrinterSettings";

interface Props {
  settings: TerminalSettings;
  hasOpenOrder: boolean;
  syncing: boolean;
  /** Only the changed fields; they are merged into the latest settings when written. */
  onSave: (patch: Partial<TerminalSettings>) => void;
  onResetup: () => void;
  onClose: () => void;
}

/**
 * Why „Terminal neu einrichten“ is not possible right now, or null. Pending bookings do not block
 * it (a rotated key must be replaceable); the wizard then keeps the same terminal.
 */
function resetupBlocker({ hasOpenOrder, syncing }: Props): string | null {
  if (hasOpenOrder) return "Erst offene Bestellung abschließen oder verwerfen";
  if (syncing) return "Abgleich läuft – bitte warten";
  return null;
}

function SettingsDialog(props: Props) {
  const { settings, onSave, onResetup, onClose } = props;
  const blocker = resetupBlocker(props);

  return (
    <TouchDialog title="Einstellungen" onClose={onClose} className="w-[28rem]">
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-muted rounded-lg px-3 py-3">
          <div>
            <div className="text-muted-foreground text-xs">Drucker und Papierbreite</div>
            <div className="text-sm">
              {settings.printer ? settings.printer.name : "Kein Drucker eingerichtet"} · {settings.paperWidth} mm
            </div>
          </div>
          <PrinterSettings
            settings={settings}
            onSave={(next) => onSave({ printer: next.printer, paperWidth: next.paperWidth })}
          />
        </div>

        <label className="flex min-h-12 items-center gap-3 bg-muted rounded-lg px-3 py-3 cursor-pointer select-none touch-manipulation">
          <input
            type="checkbox"
            checked={settings.changeCalculator}
            onChange={(e) => onSave({ changeCalculator: e.target.checked })}
            className="size-6 accent-primary"
          />
          Rückgeldrechner anzeigen
        </label>

        <div>
          <Button
            type="button"
            variant="secondary"
            size="touch"
            onClick={onResetup}
            disabled={blocker !== null}
            className="w-full"
          >
            Terminal neu einrichten
          </Button>
          {blocker && <p className="text-yellow-300 text-sm mt-1">{blocker}</p>}
        </div>
      </div>

      <Button type="button" variant="secondary" size="touch-lg" onClick={onClose} className="w-full mt-2">
        Schließen
      </Button>
    </TouchDialog>
  );
}

export default SettingsDialog;
