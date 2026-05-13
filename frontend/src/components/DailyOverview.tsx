import { useState, useEffect } from "react";
import { api } from "../api/client";

interface DailyReport {
  date: string;
  orderCount: number;
  cancelledCount: number;
  totalGross: number;
  totalVat: number;
  totalNet: number;
  vatByGroup: Record<string, { rate: number; gross: number; vat: number }>;
  byTerminal: Record<string, { orderCount: number; total: number }>;
  topItems: { itemId: string; name: string; count: number }[];
}

function DailyOverview() {
  const [report, setReport] = useState<DailyReport | null>(null);

  useEffect(() => {
    api.get<DailyReport>("/reporting/daily").then(setReport);
  }, []);

  if (!report) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <h2 className="text-white text-xl font-bold mb-4">
        Daily Overview — {report.date}
      </h2>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "Orders", value: report.orderCount },
          { label: "Gross Revenue", value: `${report.totalGross.toFixed(2)}€` },
          { label: "VAT Collected", value: `${report.totalVat.toFixed(2)}€` },
          { label: "Net Revenue", value: `${report.totalNet.toFixed(2)}€` },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-gray-800 rounded-xl p-4 text-center"
          >
            <div className="text-2xl font-bold text-white">{card.value}</div>
            <div className="text-gray-400 text-xs mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      {report.cancelledCount > 0 && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 mb-4 text-red-300 text-sm">
          {report.cancelledCount} cancelled order(s) excluded from totals
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-white font-semibold mb-2">By VAT Group</h3>
          {Object.entries(report.vatByGroup).map(([_, data]) => (
            <div
              key={data.rate}
              className="flex justify-between text-sm py-1 border-b border-gray-700"
            >
              <span className="text-gray-400">{data.rate}% VAT</span>
              <span className="text-white">
                {data.gross.toFixed(2)}€ gross / {data.vat.toFixed(2)}€ VAT
              </span>
            </div>
          ))}
        </div>

        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-white font-semibold mb-2">By Terminal</h3>
          {Object.entries(report.byTerminal).map(([name, data]) => (
            <div
              key={name}
              className="flex justify-between text-sm py-1 border-b border-gray-700"
            >
              <span className="text-gray-400">{name}</span>
              <span className="text-white">
                {data.total.toFixed(2)}€ · {data.orderCount} orders
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-xl p-4 mt-4">
        <h3 className="text-white font-semibold mb-2">Top Items</h3>
        {report.topItems.map((item, i) => (
          <div
            key={item.itemId}
            className="flex justify-between text-sm py-1 border-b border-gray-700"
          >
            <span className="text-gray-400">
              {i + 1}. {item.name}
            </span>
            <span className="text-white">{item.count}× sold</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DailyOverview;
