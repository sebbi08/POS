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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div role="dialog" aria-labelledby="settings-title" className="bg-gray-800 rounded-xl p-6 w-[28rem] shadow-2xl">
        <h2 id="settings-title" className="text-white text-xl font-bold mb-4">Einstellungen</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between bg-gray-700 rounded-lg px-3 py-3">
            <div>
              <div className="text-gray-400 text-xs">Drucker und Papierbreite</div>
              <div className="text-white text-sm">
                {settings.printer ? settings.printer.name : "Kein Drucker eingerichtet"} · {settings.paperWidth} mm
              </div>
            </div>
            <PrinterSettings
              settings={settings}
              onSave={(next) => onSave({ printer: next.printer, paperWidth: next.paperWidth })}
            />
          </div>

          <label className="flex items-center gap-3 bg-gray-700 rounded-lg px-3 py-3 text-white cursor-pointer">
            <input
              type="checkbox"
              checked={settings.changeCalculator}
              onChange={(e) => onSave({ changeCalculator: e.target.checked })}
              className="w-5 h-5"
            />
            Rückgeldrechner anzeigen
          </label>

          <div>
            <button
              onClick={onResetup}
              disabled={blocker !== null}
              className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white rounded-lg py-3 font-semibold"
            >
              Terminal neu einrichten
            </button>
            {blocker && <p className="text-yellow-300 text-sm mt-1">{blocker}</p>}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-3 font-semibold"
        >
          Schließen
        </button>
      </div>
    </div>
  );
}

export default SettingsDialog;
