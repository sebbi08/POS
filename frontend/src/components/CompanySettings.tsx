import { useState, useEffect } from "react";
import { api } from "../api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      <h2 className="text-xl font-bold mb-4">Firmendaten</h2>
      <Card className="p-6 max-w-md">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-name">Name</Label>
            <Input
              id="company-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-address">Adresse</Label>
            <Input
              id="company-address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-city">Ort</Label>
            <Input
              id="company-city"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="company-vatId">USt-IdNr.</Label>
            <Input
              id="company-vatId"
              value={form.vatId}
              onChange={(e) => setForm({ ...form, vatId: e.target.value })}
            />
          </div>
          <Button onClick={handleSave} className="mt-2">
            {saved ? "Gespeichert!" : "Speichern"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default CompanySettings;
