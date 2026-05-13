import { useState, useEffect } from "react";
import { api } from "../api/client";

interface Company {
  name: string;
  address: string;
  city: string;
  vatId: string;
}

function CompanySettings() {
  const [form, setForm] = useState<Company>({
    name: "",
    address: "",
    city: "",
    vatId: "",
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Company>("/company").then(setForm);
  }, []);

  const handleSave = async () => {
    await api.put("/company", form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h2 className="text-white text-xl font-bold mb-4">Company Settings</h2>
      <div className="bg-gray-800 rounded-xl p-6 max-w-md">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-gray-400 text-sm">Name</label>
            <input
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm mt-1"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm">Address</label>
            <input
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm mt-1"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm">City</label>
            <input
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm mt-1"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm">VAT ID</label>
            <input
              className="w-full bg-gray-700 text-white rounded px-3 py-2 text-sm mt-1"
              value={form.vatId}
              onChange={(e) => setForm({ ...form, vatId: e.target.value })}
            />
          </div>
          <button
            onClick={handleSave}
            className="bg-green-600 hover:bg-green-500 text-white rounded-lg py-2 text-sm font-semibold mt-2"
          >
            {saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CompanySettings;
