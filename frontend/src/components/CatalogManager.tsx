import { useState, useEffect } from "react";
import { api } from "../api/client";

interface ItemGroup {
  id: string;
  name: string;
  vatRate: number;
  archived: boolean;
}

interface Item {
  id: string;
  name: string;
  groupId: string;
  price: number;
  archived: boolean;
}

interface Props {
  type: "groups" | "items";
}

function CatalogManager({ type }: Props) {
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<ItemGroup[]>("/catalog/groups"),
      api.get<Item[]>("/catalog/items"),
    ]).then(([g, i]) => {
      setGroups(g);
      setItems(i.filter((item) => !item.archived));
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
              <button
                onClick={async () => {
                  await api.post("/catalog/groups", {
                    name: form.name,
                    vatRate: parseFloat(form.vatRate),
                  });
                  setForm({ ...form, name: "", vatRate: "19" });
                  load();
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-2 text-sm"
              >
                Add
              </button>
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
              {groups
                .filter((g) => !g.archived)
                .map((g) => (
                  <tr key={g.id} className="border-b border-gray-800">
                    <td className="text-white py-2">{g.name}</td>
                    <td className="text-white text-right py-2">{g.vatRate}%</td>
                    <td className="text-right py-2">
                      <button
                        onClick={() => api.delete(`/catalog/groups/${g.id}`).then(load)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Archive
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
                {groups
                  .filter((g) => !g.archived)
                  .map((g) => (
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
              <button
                onClick={async () => {
                  await api.post("/catalog/items", {
                    name: form.name,
                    groupId: form.groupId,
                    price: parseFloat(form.price),
                  });
                  setForm({ ...form, name: "", groupId: "", price: "" });
                  load();
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-2 text-sm"
                disabled={!form.groupId}
              >
                Add
              </button>
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
                      onClick={() => api.delete(`/catalog/items/${item.id}`).then(load)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      Archive
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
