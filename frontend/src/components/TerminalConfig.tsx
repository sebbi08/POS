import { useState, useEffect } from "react";
import { api } from "../api/client";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  // Shown keys per terminal id; null means the terminal has no key yet.
  const [keys, setKeys] = useState<Record<string, string | null>>({});

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
    const { key } = await api.get<{ key: string | null }>(`/terminals/${id}/key`);
    setKeys((k) => ({ ...k, [id]: key }));
  };

  const generateKey = async (id: string) => {
    if (!window.confirm("Der alte Schlüssel wird ungültig. Das Terminal muss neu eingerichtet werden. Fortfahren?")) return;
    const { key } = await api.post<{ key: string }>(`/terminals/${id}/key`);
    setKeys((k) => ({ ...k, [id]: key }));
  };

  return (
    <div>
      <h2 className="text-white text-xl font-bold mb-4">Terminals</h2>

      <div className="bg-gray-800 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-3 gap-2">
          <input
            className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
            placeholder="Terminalname"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="flex flex-wrap gap-1">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() =>
                  setForm({
                    ...form,
                    groupIds: form.groupIds.includes(g.id)
                      ? form.groupIds.filter((id) => id !== g.id)
                      : [...form.groupIds, g.id],
                  })
                }
                className={`px-2 py-1 rounded text-xs ${
                  form.groupIds.includes(g.id)
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300"
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-gray-300 text-sm">
            <input
              type="checkbox"
              checked={form.printPickupReceipts}
              onChange={(e) => setForm({ ...form, printPickupReceipts: e.target.checked })}
            />
            Abholbons drucken
          </label>
          {editingId ? (
            <>
              <button
                onClick={async () => {
                  await api.put(`/terminals/${editingId}`, {
                    name: form.name,
                    groupIds: form.groupIds,
                    printPickupReceipts: form.printPickupReceipts,
                  });
                  resetForm();
                  load();
                }}
                className="bg-green-600 hover:bg-green-500 text-white rounded px-3 py-2 text-sm"
              >
                Speichern
              </button>
              <button
                onClick={resetForm}
                className="bg-gray-600 hover:bg-gray-500 text-white rounded px-3 py-2 text-sm"
              >
                Abbrechen
              </button>
            </>
          ) : (
            <button
              onClick={async () => {
                await api.post("/terminals", {
                  name: form.name,
                  groupIds: form.groupIds,
                  printPickupReceipts: form.printPickupReceipts,
                });
                resetForm();
                load();
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-2 text-sm"
            >
              Hinzufügen
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {terminals.map((t) => (
          <div
            key={t.id}
            className="bg-gray-800 rounded-xl p-4 flex items-center justify-between"
          >
            <div>
              <div className="text-white font-medium">{t.name}</div>
              <div className="text-gray-400 text-xs mt-1">
                Warengruppen:{" "}
                {t.groupIds
                  .map((gid) => groups.find((g) => g.id === gid)?.name ?? "")
                  .join(", ")}
              </div>
              {t.id in keys && (
                <div className="text-xs mt-2 text-gray-300">
                  Schlüssel:{" "}
                  {keys[t.id] ? (
                    <code className="bg-gray-700 rounded px-1 select-all">{keys[t.id]}</code>
                  ) : (
                    "Noch kein Schlüssel erzeugt"
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => showKey(t.id)}
                className="text-gray-300 hover:text-white text-sm"
              >
                Schlüssel anzeigen
              </button>
              <button
                onClick={() => generateKey(t.id)}
                className="text-amber-400 hover:text-amber-300 text-sm"
              >
                Neuen Schlüssel erzeugen
              </button>
              <button
                onClick={() => startEdit(t)}
                className="text-blue-400 hover:text-blue-300 text-sm"
              >
                Bearbeiten
              </button>
              <button
                onClick={() => api.delete(`/terminals/${t.id}`).then(load)}
                className="text-red-400 hover:text-red-300 text-sm"
              >
                Löschen
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TerminalConfig;
