import { useState } from "react";
import type { UserSession } from "../App";
import CatalogManager from "../components/CatalogManager";
import CompanySettings from "../components/CompanySettings";
import TerminalConfig from "../components/TerminalConfig";
import UserManager from "../components/UserManager";
import DailyOverview from "../components/DailyOverview";
import TransactionHistory from "../components/TransactionHistory";

type Tab =
  | "groups"
  | "items"
  | "terminals"
  | "users"
  | "company"
  | "daily"
  | "transactions";

const tabs: { id: Tab; label: string }[] = [
  { id: "groups", label: "Item Groups" },
  { id: "items", label: "Items" },
  { id: "terminals", label: "Terminals" },
  { id: "users", label: "Users" },
  { id: "company", label: "Company" },
  { id: "daily", label: "Daily Overview" },
  { id: "transactions", label: "Transactions" },
];

interface Props {
  session: UserSession;
  onLogout: () => void;
}

function AdminLayout({ session, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("daily");

  return (
    <div className="min-h-screen flex">
      <nav className="w-56 bg-gray-800 flex flex-col border-r border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h1 className="text-white font-bold text-lg">Admin Panel</h1>
          <p className="text-gray-400 text-xs mt-1">{session.user.name}</p>
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
            onClick={onLogout}
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
        {tab === "users" && <UserManager />}
        {tab === "company" && <CompanySettings />}
        {tab === "daily" && <DailyOverview />}
        {tab === "transactions" && <TransactionHistory />}
      </main>
    </div>
  );
}

export default AdminLayout;
