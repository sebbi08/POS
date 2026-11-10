import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "../api/client";
import CatalogManager from "../components/CatalogManager";
import CompanySettings from "../components/CompanySettings";
import TerminalConfig from "../components/TerminalConfig";
import ReportOverview from "../components/ReportOverview";
import TransactionHistory from "../components/TransactionHistory";
import CatalogImportExport from "../components/CatalogImportExport";

type Tab = "groups" | "items" | "terminals" | "company" | "report" | "transactions" | "import-export";

const tabs: { id: Tab; label: string }[] = [
  { id: "report", label: "Auswertung" },
  { id: "transactions", label: "Buchungen" },
  { id: "groups", label: "Warengruppen" },
  { id: "items", label: "Artikel" },
  { id: "terminals", label: "Terminals" },
  { id: "company", label: "Firmendaten" },
  { id: "import-export", label: "Import/Export" },
];

function AdminLayout() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("report");
  const [version, setVersion] = useState("");

  useEffect(() => {
    api
      .get<{ version?: string }>("/version")
      .then((r) => setVersion(r?.version ?? ""))
      .catch(() => {}); // version unavailable: it is simply not shown
  }, []);

  return (
    <div className="min-h-screen flex">
      <nav className="w-56 bg-card flex flex-col border-r border-border">
        <div className="p-4 border-b border-border">
          <h1 className="text-foreground font-bold text-lg">
            Administration
            {version && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">v{version}</span>
            )}
          </h1>
        </div>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {tabs.map((t) => (
            <Button
              key={t.id}
              variant={tab === t.id ? "secondary" : "ghost"}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => setTab(t.id)}
              className="justify-start"
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div className="p-3 border-t border-border">
          <Button variant="destructive" className="w-full" onClick={() => navigate("/")}>
            Abmelden
          </Button>
        </div>
      </nav>
      <main className="flex-1 overflow-y-auto p-6">
        {tab === "groups" && <CatalogManager type="groups" />}
        {tab === "items" && <CatalogManager type="items" />}
        {tab === "terminals" && <TerminalConfig />}
        {tab === "company" && <CompanySettings />}
        {tab === "report" && <ReportOverview />}
        {tab === "transactions" && <TransactionHistory />}
        {tab === "import-export" && <CatalogImportExport />}
      </main>
    </div>
  );
}

export default AdminLayout;
