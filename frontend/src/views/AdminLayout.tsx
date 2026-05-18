import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CatalogManager from "../components/CatalogManager";
import CompanySettings from "../components/CompanySettings";
import TerminalConfig from "../components/TerminalConfig";
import DailyOverview from "../components/DailyOverview";
import TransactionHistory from "../components/TransactionHistory";

type Tab = "groups" | "items" | "terminals" | "company" | "daily" | "transactions";

const tabs: { id: Tab; label: string }[] = [
  { id: "groups", label: "Item Groups" },
  { id: "items", label: "Items" },
  { id: "terminals", label: "Terminals" },
  { id: "company", label: "Company" },
  { id: "daily", label: "Daily Overview" },
  { id: "transactions", label: "Transactions" },
];

function AdminLayout() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("daily");

  return (
    <div className="min-h-screen flex">
      <nav className="w-56 bg-gray-800 flex flex-col border-r border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-white font-bold text-lg">Admin Panel</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                tab === t.id
                  ? "bg-blue-600 text-white"
                  : "text-gray-300 hover:bg-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-gray-700">
          <button
            onClick={() => navigate("/")}
            className="w-full bg-red-600 hover:bg-red-500 text-white rounded-lg py-2 text-sm"
          >
            Logout
          </button>
        </div>
      </nav>
      <main className="flex-1 overflow-y-auto p-6">
        {tab === "groups" && <CatalogManager type="groups" />}
        {tab === "items" && <CatalogManager type="items" />}
        {tab === "terminals" && <TerminalConfig />}
        {tab === "company" && <CompanySettings />}
        {tab === "daily" && <DailyOverview />}
        {tab === "transactions" && <TransactionHistory />}
      </main>
    </div>
  );
}

export default AdminLayout;
