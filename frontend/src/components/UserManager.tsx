import { useState, useEffect } from "react";
import { api } from "../api/client";

interface User {
  id: string;
  name: string;
  role: string;
  archived: boolean;
}

function UserManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ name: "", pin: "", role: "terminal" });

  const load = () => {
    api.get<User[]>("/auth/users").then(setUsers);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    await api.post("/auth/users", form);
    setForm({ name: "", pin: "", role: "terminal" });
    load();
  };

  return (
    <div>
      <h2 className="text-white text-xl font-bold mb-4">Users</h2>

      <div className="bg-gray-800 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-4 gap-2">
          <input
            className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
            placeholder="PIN (4-6 digits)"
            type="password"
            maxLength={6}
            value={form.pin}
            onChange={(e) => setForm({ ...form, pin: e.target.value })}
          />
          <select
            className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="terminal">Terminal</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={handleAdd}
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
            <th className="text-left py-2">Role</th>
            <th className="text-right py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users
            .filter((u) => !u.archived)
            .map((u) => (
              <tr key={u.id} className="border-b border-gray-800">
                <td className="text-white py-2">{u.name}</td>
                <td className="text-gray-400 py-2 capitalize">{u.role}</td>
                <td className="text-right py-2">
                  <button
                    onClick={() => api.delete(`/auth/users/${u.id}`).then(load)}
                    className="text-red-400 hover:text-red-300 text-xs"
                  >
                    Archive
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export default UserManager;
