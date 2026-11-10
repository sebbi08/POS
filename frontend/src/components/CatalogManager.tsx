import { useState, useEffect } from "react";
import { api } from "../api/client";
import { formatEuro } from "../lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent dark:bg-input/30 px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

interface ItemGroup {
  id: string;
  name: string;
  vatRate: number;
}

interface Item {
  id: string;
  name: string;
  groupId: string;
  price: number;
}

interface Props {
  type: "groups" | "items";
}

function CatalogManager({ type }: Props) {
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<ItemGroup[]>("/catalog/groups"),
      api.get<Item[]>("/catalog/items"),
    ]).then(([g, i]) => {
      setGroups(g);
      setItems(i);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  const [form, setForm] = useState({
    name: "",
    vatRate: "19",
    price: "",
    groupId: "",
  });

  const resetForm = () => {
    setForm({ name: "", vatRate: "19", price: "", groupId: "" });
    setEditingId(null);
  };

  const startEdit = (id: string, name: string, vatRate?: number, price?: number, groupId?: string) => {
    setEditingId(id);
    setForm({
      name,
      vatRate: vatRate !== undefined ? String(vatRate) : "19",
      price: price !== undefined ? String(price) : "",
      groupId: groupId || "",
    });
  };

  if (loading) return <div className="text-muted-foreground">Lädt...</div>;

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">
        {type === "groups" ? "Warengruppen" : "Artikel"}
      </h2>

      {type === "groups" && (
        <>
          <Card className="p-4 mb-4">
            <div className="grid grid-cols-4 gap-2">
              <Input
                className="col-span-2"
                placeholder="Name der Warengruppe"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Input
                placeholder="MwSt. %"
                type="number"
                value={form.vatRate}
                onChange={(e) => setForm({ ...form, vatRate: e.target.value })}
              />
              {editingId ? (
                <>
                  <Button
                    onClick={async () => {
                      await api.put(`/catalog/groups/${editingId}`, {
                        name: form.name,
                        vatRate: parseFloat(form.vatRate),
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
                    await api.post("/catalog/groups", {
                      name: form.name,
                      vatRate: parseFloat(form.vatRate),
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">MwSt.</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>{g.name}</TableCell>
                  <TableCell className="text-right">{g.vatRate}%</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => startEdit(g.id, g.name, g.vatRate)}>
                        Bearbeiten
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => api.delete(`/catalog/groups/${g.id}`).then(load)}>
                        Löschen
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      {type === "items" && (
        <>
          <Card className="p-4 mb-4">
            <div className="grid grid-cols-4 gap-2">
              <Input
                placeholder="Artikelname"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <select
                className={selectClass}
                value={form.groupId}
                onChange={(e) => setForm({ ...form, groupId: e.target.value })}
              >
                <option value="">Warengruppe wählen</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Preis"
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
              {editingId ? (
                <>
                  <Button
                    onClick={async () => {
                      await api.put(`/catalog/items/${editingId}`, {
                        name: form.name,
                        groupId: form.groupId,
                        price: parseFloat(form.price),
                      });
                      resetForm();
                      load();
                    }}
                    disabled={!form.groupId}
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
                    await api.post("/catalog/items", {
                      name: form.name,
                      groupId: form.groupId,
                      price: parseFloat(form.price),
                    });
                    resetForm();
                    load();
                  }}
                  disabled={!form.groupId}
                >
                  Hinzufügen
                </Button>
              )}
            </div>
          </Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Warengruppe</TableHead>
                <TableHead className="text-right">Preis</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {groups.find((g) => g.id === item.groupId)?.name ?? ""}
                  </TableCell>
                  <TableCell className="text-right">{formatEuro(item.price)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(item.id, item.name, undefined, item.price, item.groupId)}
                      >
                        Bearbeiten
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => api.delete(`/catalog/items/${item.id}`).then(load)}>
                        Löschen
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}

export default CatalogManager;
