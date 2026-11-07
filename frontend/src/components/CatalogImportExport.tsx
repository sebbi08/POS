import { useState, useEffect } from "react";
import { api } from "../api/client";
import { formatEuro } from "../lib/format";

interface ItemGroup {
  id: string;
  name: string;
  vatRate: number;
}

interface GroupToCreate {
  name: string;
  vatRate: number;
}

interface ItemToCreate {
  id: string;
  name: string;
  groupName: string;
  price: number;
}

interface ItemToUpdate {
  id: string;
  name: string;
  groupName: string;
  price: number;
  oldName: string;
  oldPrice: number;
  oldGroupName: string;
}

interface ImportPreview {
  groupsToCreate: GroupToCreate[];
  itemsToCreate: ItemToCreate[];
  itemsToUpdate: ItemToUpdate[];
  errors: string[];
  groupsCreated?: number;
  itemsCreated?: number;
  itemsUpdated?: number;
}

function CatalogImportExport() {
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    api.get<ItemGroup[]>("/catalog/groups").then(setGroups);
  }, []);

  const handleExport = async (groupId?: string) => {
    setLoading(true);
    try {
      await api.downloadCsv("/catalog/export", groupId ? { groupId } : {});
    } finally {
      setLoading(false);
    }
  };

  const generateSample = () => {
    const sample = [
      ["id", "name", "group_name", "group_vat_rate", "price"],
      [crypto.randomUUID(), "Kaffee", "Heißgetränke", "19", "2.50"],
      [crypto.randomUUID(), "Tee", "Heißgetränke", "19", "2.00"],
      [crypto.randomUUID(), "Brezel", "Backwaren", "7", "1.80"],
      [crypto.randomUUID(), "Kuchen", "Backwaren", "7", "2.20"],
    ];
    const csv = sample.map(row => row.map(v => v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v).join(",")).join("\n") + "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalog-sample.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const data = await api.upload<ImportPreview>("/catalog/import", file, { dryRun: "true" });
      setPreview(data);
    } catch (e: any) {
      setPreview({ groupsToCreate: [], itemsToCreate: [], itemsToUpdate: [], errors: [e.message] });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!file || !preview || preview.errors.length > 0) return;
    setLoading(true);
    try {
      const data = await api.upload<ImportPreview>("/catalog/import", file, { dryRun: "false" });
      setPreview(data);
      setResult(`${data.groupsCreated || 0} Warengruppen und ${data.itemsCreated || 0} Artikel erstellt, ${data.itemsUpdated || 0} Artikel aktualisiert.`);
    } catch (e: any) {
      setResult(`Fehler: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const shortId = (id: string) => id.substring(0, 8);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-white text-xl font-bold mb-4">Katalog exportieren</h2>
        <div className="bg-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              <option value="">Alle Warengruppen</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={() => handleExport(selectedGroupId || undefined)}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded px-4 py-2 text-sm"
            >
              CSV herunterladen
            </button>
            <button
              onClick={generateSample}
              className="bg-gray-600 hover:bg-gray-500 text-white rounded px-4 py-2 text-sm"
            >
              Beispiel-CSV herunterladen
            </button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-white text-xl font-bold mb-4">Katalog importieren</h2>
        <div className="bg-gray-800 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setPreview(null);
                setResult(null);
              }}
              className="text-gray-300 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gray-700 file:text-white hover:file:bg-gray-600"
            />
            <button
              onClick={handlePreview}
              disabled={!file || loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded px-4 py-2 text-sm"
            >
              Vorschau
            </button>
          </div>

          {loading && <div className="text-gray-400 text-sm">Verarbeitung läuft...</div>}

          {result && (
            <div className="bg-green-900/30 border border-green-700 rounded-lg p-3">
              <p className="text-green-400 text-sm">{result}</p>
            </div>
          )}

          {preview && (
            <div className="space-y-4">
              {preview.groupsToCreate.length > 0 && (
                <div>
                  <h3 className="text-blue-400 text-sm font-semibold mb-2">
                    Warengruppen anlegen ({preview.groupsToCreate.length})
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-700">
                        <th className="text-left py-1">Name</th>
                        <th className="text-right py-1">MwSt.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.groupsToCreate.map((g, i) => (
                        <tr key={i} className="border-b border-gray-800">
                          <td className="text-blue-300 py-1">{g.name}</td>
                          <td className="text-blue-300 text-right py-1">{g.vatRate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.itemsToCreate.length > 0 && (
                <div>
                  <h3 className="text-green-400 text-sm font-semibold mb-2">
                    Artikel anlegen ({preview.itemsToCreate.length})
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-700">
                        <th className="text-left py-1">ID</th>
                        <th className="text-left py-1">Name</th>
                        <th className="text-left py-1">Warengruppe</th>
                        <th className="text-right py-1">Preis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.itemsToCreate.map((item, i) => (
                        <tr key={i} className="border-b border-gray-800">
                          <td className="text-green-300 py-1 font-mono">{shortId(item.id)}</td>
                          <td className="text-green-300 py-1">{item.name}</td>
                          <td className="text-green-300 py-1">{item.groupName}</td>
                          <td className="text-green-300 text-right py-1">{formatEuro(item.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.itemsToUpdate.length > 0 && (
                <div>
                  <h3 className="text-yellow-400 text-sm font-semibold mb-2">
                    Artikel aktualisieren ({preview.itemsToUpdate.length})
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-gray-700">
                        <th className="text-left py-1">ID</th>
                        <th className="text-left py-1">Name</th>
                        <th className="text-left py-1">Warengruppe</th>
                        <th className="text-right py-1">Preis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.itemsToUpdate.map((item, i) => (
                        <tr key={i} className="border-b border-gray-800">
                          <td className="text-yellow-300 py-1 font-mono">{shortId(item.id)}</td>
                          <td className="text-yellow-300 py-1">
                            <span className="text-gray-500 line-through">{item.oldName}</span> → {item.name}
                          </td>
                          <td className="text-yellow-300 py-1">
                            <span className="text-gray-500 line-through">{item.oldGroupName}</span> → {item.groupName}
                          </td>
                          <td className="text-yellow-300 text-right py-1">
                            <span className="text-gray-500 line-through">{formatEuro(item.oldPrice)}</span> → {formatEuro(item.price)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                  <h3 className="text-red-400 text-sm font-semibold mb-1">Fehler</h3>
                  {preview.errors.map((err, i) => (
                    <p key={i} className="text-red-300 text-xs">{err}</p>
                  ))}
                </div>
              )}

              {preview.errors.length === 0 && (preview.itemsToCreate.length > 0 || preview.itemsToUpdate.length > 0 || preview.groupsToCreate.length > 0) && (
                <button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded px-4 py-2 text-sm"
                >
                  Import bestätigen
                </button>
              )}

              {preview.errors.length === 0 && preview.itemsToCreate.length === 0 && preview.itemsToUpdate.length === 0 && preview.groupsToCreate.length === 0 && (
                <p className="text-gray-400 text-sm">Keine Änderungen vorhanden.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CatalogImportExport;
