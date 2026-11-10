import { useState, useEffect } from "react";
import { api } from "../api/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ConfirmDialog from "./ConfirmDialog";

interface Terminal {
  id: string;
  name: string;
  groupIds: string[];
  printPickupReceipts: boolean;
}

interface ItemGroup {
  id: string;
  name: string;
}

function TerminalConfig() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [form, setForm] = useState({ name: "", groupIds: [] as string[], printPickupReceipts: true });
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  // Shown keys per terminal id; null means the terminal has no key yet.
  const [keys, setKeys] = useState<Record<string, string | null>>({});
  const [keyTarget, setKeyTarget] = useState<string | null>(null);

  const load = () => {
    api.get<Terminal[]>("/terminals").then(setTerminals);
    api.get<ItemGroup[]>("/catalog/groups").then(setGroups);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({ name: "", groupIds: [], printPickupReceipts: true });
    setEditingId(null);
  };

  const startEdit = (t: Terminal) => {
    setEditingId(t.id);
    setForm({ name: t.name, groupIds: [...t.groupIds], printPickupReceipts: t.printPickupReceipts });
  };

  const showKey = async (id: string) => {
    try {
      const { key } = await api.get<{ key: string | null }>(`/terminals/${id}/key`);
      setKeys((k) => ({ ...k, [id]: key }));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const generateKey = async (id: string) => {
    setKeyTarget(null);
    try {
      const { key } = await api.post<{ key: string }>(`/terminals/${id}/key`);
      setKeys((k) => ({ ...k, [id]: key }));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Terminals</h2>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="p-4 mb-4">
        <div className="grid grid-cols-3 gap-2 items-center">
          <Input
            placeholder="Terminalname"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="flex flex-wrap gap-1">
            {groups.map((g) => (
              <Button
                key={g.id}
                type="button"
                size="sm"
                variant={form.groupIds.includes(g.id) ? "default" : "secondary"}
                aria-pressed={form.groupIds.includes(g.id)}
                onClick={() =>
                  setForm({
                    ...form,
                    groupIds: form.groupIds.includes(g.id)
                      ? form.groupIds.filter((id) => id !== g.id)
                      : [...form.groupIds, g.id],
                  })
                }
              >
                {g.name}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={form.printPickupReceipts}
              onChange={(e) => setForm({ ...form, printPickupReceipts: e.target.checked })}
            />
            Abholbons drucken
          </label>
          {editingId ? (
            <>
              <Button
                onClick={async () => {
                  await api.put(`/terminals/${editingId}`, {
                    name: form.name,
                    groupIds: form.groupIds,
                    printPickupReceipts: form.printPickupReceipts,
                  });
                  resetForm();
                  load();
                }}
              >
                Speichern
              </Button>
              <Button variant="secondary" onClick={resetForm}>
                Abbrechen
              </Button>
            </>
          ) : (
            <Button
              onClick={async () => {
                await api.post("/terminals", {
                  name: form.name,
                  groupIds: form.groupIds,
                  printPickupReceipts: form.printPickupReceipts,
                });
                resetForm();
                load();
              }}
            >
              Hinzufügen
            </Button>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        {terminals.map((t) => (
          <Card
            key={t.id}
            role="group"
            aria-label={t.name}
            className="p-4 flex-row items-center justify-between"
          >
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-muted-foreground text-xs mt-1">
                Warengruppen:{" "}
                {t.groupIds
                  .map((gid) => groups.find((g) => g.id === gid)?.name ?? "")
                  .join(", ")}
              </div>
              {t.id in keys && (
                <div className="text-xs mt-2 text-muted-foreground">
                  Schlüssel:{" "}
                  {keys[t.id] ? (
                    <code className="bg-muted text-foreground rounded px-1 select-all">{keys[t.id]}</code>
                  ) : (
                    "Noch kein Schlüssel erzeugt"
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => showKey(t.id)}>
                Schlüssel anzeigen
              </Button>
              <Button variant="outline" size="sm" onClick={() => setKeyTarget(t.id)}>
                Neuen Schlüssel erzeugen
              </Button>
              <Button variant="outline" size="sm" onClick={() => startEdit(t)}>
                Bearbeiten
              </Button>
              <Button variant="destructive" size="sm" onClick={() => api.delete(`/terminals/${t.id}`).then(load)}>
                Löschen
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <ConfirmDialog
        open={keyTarget !== null}
        title="Schlüssel neu erzeugen?"
        description="Der alte Schlüssel wird ungültig. Das Terminal muss neu eingerichtet werden. Fortfahren?"
        confirmLabel="Fortfahren"
        destructive
        onConfirm={() => keyTarget && generateKey(keyTarget)}
        onCancel={() => setKeyTarget(null)}
      />
    </div>
  );
}

export default TerminalConfig;
