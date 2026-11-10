import { useState, useEffect } from "react";
import { api } from "../api/client";
import { formatEuro } from "../lib/format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const selectClass =
  "h-9 rounded-md border border-input bg-transparent dark:bg-input/30 px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

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
        <h2 className="text-xl font-bold mb-4">Katalog exportieren</h2>
        <Card className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className={selectClass}
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              <option value="">Alle Warengruppen</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <Button onClick={() => handleExport(selectedGroupId || undefined)} disabled={loading}>
              CSV herunterladen
            </Button>
            <Button variant="secondary" onClick={generateSample}>
              Beispiel-CSV herunterladen
            </Button>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">Katalog importieren</h2>
        <Card className="p-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              type="file"
              accept=".csv"
              className="w-auto"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setPreview(null);
                setResult(null);
              }}
            />
            <Button onClick={handlePreview} disabled={!file || loading}>
              Vorschau
            </Button>
          </div>

          {loading && <div className="text-muted-foreground text-sm">Verarbeitung läuft...</div>}

          {result && (
            <Alert>
              <AlertDescription className="text-emerald-400">{result}</AlertDescription>
            </Alert>
          )}

          {preview && (
            <div className="space-y-4">
              {preview.groupsToCreate.length > 0 && (
                <div>
                  <h3 className="text-blue-400 text-sm font-semibold mb-2">
                    Warengruppen anlegen ({preview.groupsToCreate.length})
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">MwSt.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.groupsToCreate.map((g, i) => (
                        <TableRow key={i} className="text-blue-300">
                          <TableCell>{g.name}</TableCell>
                          <TableCell className="text-right">{g.vatRate}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {preview.itemsToCreate.length > 0 && (
                <div>
                  <h3 className="text-emerald-400 text-sm font-semibold mb-2">
                    Artikel anlegen ({preview.itemsToCreate.length})
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Warengruppe</TableHead>
                        <TableHead className="text-right">Preis</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.itemsToCreate.map((item, i) => (
                        <TableRow key={i} className="text-emerald-300">
                          <TableCell className="font-mono">{shortId(item.id)}</TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell>{item.groupName}</TableCell>
                          <TableCell className="text-right">{formatEuro(item.price)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {preview.itemsToUpdate.length > 0 && (
                <div>
                  <h3 className="text-yellow-400 text-sm font-semibold mb-2">
                    Artikel aktualisieren ({preview.itemsToUpdate.length})
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Warengruppe</TableHead>
                        <TableHead className="text-right">Preis</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.itemsToUpdate.map((item, i) => (
                        <TableRow key={i} className="text-yellow-300">
                          <TableCell className="font-mono">{shortId(item.id)}</TableCell>
                          <TableCell>
                            <span className="text-muted-foreground line-through">{item.oldName}</span> → {item.name}
                          </TableCell>
                          <TableCell>
                            <span className="text-muted-foreground line-through">{item.oldGroupName}</span> → {item.groupName}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-muted-foreground line-through">{formatEuro(item.oldPrice)}</span> → {formatEuro(item.price)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {preview.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTitle>Fehler</AlertTitle>
                  <AlertDescription>
                    {preview.errors.map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                  </AlertDescription>
                </Alert>
              )}

              {preview.errors.length === 0 && (preview.itemsToCreate.length > 0 || preview.itemsToUpdate.length > 0 || preview.groupsToCreate.length > 0) && (
                <Button onClick={handleConfirm} disabled={loading}>
                  Import bestätigen
                </Button>
              )}

              {preview.errors.length === 0 && preview.itemsToCreate.length === 0 && preview.itemsToUpdate.length === 0 && preview.groupsToCreate.length === 0 && (
                <p className="text-muted-foreground text-sm">Keine Änderungen vorhanden.</p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default CatalogImportExport;
