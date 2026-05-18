import { useState, useEffect } from "react";
import { api } from "../api/client";

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

  if (loading) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <h2 className="text-white text-xl font-bold mb-4">
        {type === "groups" ? "Item Groups" : "Items"}
      </h2>

      {type === "groups" && (
        <>
          <div className="bg-gray-800 rounded-xl p-4 mb-4">
            <div className="grid grid-cols-4 gap-2">
              <input
                className="bg-gray-700 text-white rounded px-3 py-2 text-sm col-span-2"
                placeholder="Group name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
                placeholder="VAT %"
                type="number"
                value={form.vatRate}
                onChange={(e) => setForm({ ...form, vatRate: e.target.value })}
              />
              {editingId ? (
                <>
                  <button
                    onClick={async () => {
                      await api.put(`/catalog/groups/${editingId}`, {
                        name: form.name,
                        vatRate: parseFloat(form.vatRate),
                      });
                      resetForm();
                      load();
                    }}
                    className="bg-green-600 hover:bg-green-500 text-white rounded px-3 py-2 text-sm"
                  >
                    Save
                  </button>
                  <button
                    onClick={resetForm}
                    className="bg-gray-600 hover:bg-gray-500 text-white rounded px-3 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={async () => {
                    await api.post("/catalog/groups", {
                      name: form.name,
                      vatRate: parseFloat(form.vatRate),
                    });
                    resetForm();
                    load();
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-2 text-sm"
                >
                  Add
                </button>
              )}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2">Name</th>
                <th className="text-right py-2">VAT</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-b border-gray-800">
                  <td className="text-white py-2">{g.name}</td>
                  <td className="text-white text-right py-2">{g.vatRate}%</td>
                  <td className="text-right py-2">
                    <button
                      onClick={() => startEdit(g.id, g.name, g.vatRate)}
                      className="text-blue-400 hover:text-blue-300 text-xs mr-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => api.delete(`/catalog/groups/${g.id}`).then(load)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {type === "items" && (
        <>
          <div className="bg-gray-800 rounded-xl p-4 mb-4">
            <div className="grid grid-cols-4 gap-2">
              <input
                className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
                placeholder="Item name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <select
                className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
                value={form.groupId}
                onChange={(e) => setForm({ ...form, groupId: e.target.value })}
              >
                <option value="">Select group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <input
                className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
                placeholder="Price"
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
              {editingId ? (
                <>
                  <button
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
                    className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded px-3 py-2 text-sm"
                  >
                    Save
                  </button>
                  <button
                    onClick={resetForm}
                    className="bg-gray-600 hover:bg-gray-500 text-white rounded px-3 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
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
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded px-3 py-2 text-sm"
                >
                  Add
                </button>
              )}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Group</th>
                <th className="text-right py-2">Price</th>
                <th className="text-right py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-800">
                  <td className="text-white py-2">{item.name}</td>
                  <td className="text-gray-400 py-2">
                    {groups.find((g) => g.id === item.groupId)?.name ?? ""}
                  </td>
                  <td className="text-white text-right py-2">
                    {item.price.toFixed(2)}€
                  </td>
                  <td className="text-right py-2">
                    <button
                      onClick={() => startEdit(item.id, item.name, undefined, item.price, item.groupId)}
                      className="text-blue-400 hover:text-blue-300 text-xs mr-2"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => api.delete(`/catalog/items/${item.id}`).then(load)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default CatalogManager;
