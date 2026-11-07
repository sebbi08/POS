import { useState } from "react";
import type { TerminalSettings } from "../../shared/types";
import { syncErrorText, TERMINAL_LOCKED } from "../state/messages";
import { listTerminals, normalizeServerUrl } from "../sync/client";

interface Props {
  /** Current settings when re-setting up; their local preferences (printer, …) are kept. */
  initial: TerminalSettings | null;
  /** Set while bookings wait for the upload: only this terminal may be chosen (new server or key). */
  lockedTerminalId?: string | null;
  /** Fetches the catalog with the new credentials and stores everything on success. */
  onSetup: (candidate: TerminalSettings) => Promise<boolean>;
  /** Only offered when there is a working setup to return to. */
  onCancel?: () => void;
}

const DEFAULTS = { changeCalculator: false, printer: null, paperWidth: "80" } as const;

function SetupWizard({ initial, lockedTerminalId = null, onSetup, onCancel }: Props) {
  const [address, setAddress] = useState(initial?.serverUrl ?? "");
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [terminals, setTerminals] = useState<{ id: string; name: string }[] | null>(null);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [key, setKey] = useState(initial?.terminalKey ?? "");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const loadTerminals = async () => {
    setError(null);
    if (!address.trim()) {
      setError("Bitte Serveradresse eingeben");
      return;
    }
    const url = normalizeServerUrl(address);
    setWorking(true);
    try {
      const list = await listTerminals(url);
      setServerUrl(url);
      setTerminals(list);
      setTerminalId(list.some((t) => t.id === initial?.terminalId) ? initial!.terminalId : null);
      if (list.length === 0) setError("Auf dem Server sind keine Terminals angelegt");
      else if (lockedTerminalId && !list.some((t) => t.id === lockedTerminalId)) setError(TERMINAL_LOCKED);
    } catch (err) {
      setError(syncErrorText(err));
    } finally {
      setWorking(false);
    }
  };

  const changeAddress = (value: string) => {
    setAddress(value);
    setTerminals(null);
    setTerminalId(null);
    setServerUrl(null);
  };

  const chooseTerminal = (id: string) => {
    if (lockedTerminalId && id !== lockedTerminalId) {
      setError(TERMINAL_LOCKED);
      return;
    }
    setError(null);
    setTerminalId(id);
  };

  const submit = async () => {
    if (!serverUrl || !terminalId || !key.trim()) return;
    setWorking(true);
    try {
      await onSetup({
        ...DEFAULTS, ...initial,
        serverUrl, terminalId, terminalKey: key.trim(), lastCatalogFetchAt: null, clockSkewMs: null,
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="flex-1 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl p-6 w-[32rem] shadow-2xl space-y-5">
        <h1 className="text-white text-2xl font-bold">Terminal einrichten</h1>

        <div>
          <label htmlFor="setup-server" className="text-gray-400 text-sm block mb-1">Serveradresse</label>
          <div className="flex gap-2">
            <input
              id="setup-server"
              value={address}
              onChange={(e) => changeAddress(e.target.value)}
              placeholder="kasse.example.de"
              className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={loadTerminals}
              disabled={working}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg px-4 font-semibold"
            >
              Terminals laden
            </button>
          </div>
        </div>

        {terminals && terminals.length > 0 && (
          <div>
            <span className="text-gray-400 text-sm block mb-1">Welches Terminal ist dieses Gerät?</span>
            <div className="grid grid-cols-2 gap-2">
              {terminals.map((t) => (
                <button
                  key={t.id}
                  onClick={() => chooseTerminal(t.id)}
                  aria-pressed={terminalId === t.id}
                  className={`rounded-lg py-3 px-2 font-semibold text-white ${terminalId === t.id ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {terminalId && (
          <div>
            <label htmlFor="setup-key" className="text-gray-400 text-sm block mb-1">Terminal-Schlüssel</label>
            <input
              id="setup-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-3 font-mono outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {error && <div role="alert" className="bg-red-500/20 text-red-300 rounded-lg p-2 text-sm">{error}</div>}

        <div className="flex gap-2">
          <button
            onClick={submit}
            disabled={working || !terminalId || !key.trim()}
            className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-lg py-3 font-bold"
          >
            Einrichten & Artikel abholen
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-4 font-semibold"
            >
              Abbrechen
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

export default SetupWizard;
