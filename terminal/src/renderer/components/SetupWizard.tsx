import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/** Text fields as tall as the touch buttons next to them. */
const FIELD = "h-16 text-lg md:text-lg";

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
      <Card className="w-[32rem] shadow-2xl">
        <CardHeader>
          <h1 className="text-2xl font-bold">Terminal einrichten</h1>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="setup-server" className="text-muted-foreground">Serveradresse</Label>
            <div className="flex gap-2">
              <Input
                id="setup-server"
                value={address}
                onChange={(e) => changeAddress(e.target.value)}
                placeholder="kasse.example.de"
                className={`flex-1 ${FIELD}`}
              />
              <Button size="touch-lg" onClick={loadTerminals} disabled={working}>
                Terminals laden
              </Button>
            </div>
          </div>

          {terminals && terminals.length > 0 && (
            <div className="space-y-2">
              <span className="text-muted-foreground text-sm block">Welches Terminal ist dieses Gerät?</span>
              <div className="grid grid-cols-2 gap-2">
                {terminals.map((t) => (
                  <Button
                    key={t.id}
                    variant={terminalId === t.id ? "default" : "secondary"}
                    size="touch-lg"
                    onClick={() => chooseTerminal(t.id)}
                    aria-pressed={terminalId === t.id}
                    className="whitespace-normal"
                  >
                    {t.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {terminalId && (
            <div className="space-y-2">
              <Label htmlFor="setup-key" className="text-muted-foreground">Terminal-Schlüssel</Label>
              <Input
                id="setup-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
                className={`font-mono ${FIELD}`}
              />
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button
              size="touch-lg"
              onClick={submit}
              disabled={working || !terminalId || !key.trim()}
              className="flex-1"
            >
              Einrichten & Artikel abholen
            </Button>
            {onCancel && (
              <Button variant="secondary" size="touch-lg" onClick={onCancel}>
                Abbrechen
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default SetupWizard;
