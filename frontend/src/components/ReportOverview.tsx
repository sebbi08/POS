import { useState, useEffect } from "react";
import { api } from "../api/client";
import { formatEuro, todayIso } from "../lib/format";
import { useTerminals } from "../lib/useTerminals";
import RangeFields from "./RangeFields";

interface Report {
  from: string;
  to: string;
  orderCount: number;
  cancelledCount: number;
  totalGross: number;
  totalVat: number;
  totalNet: number;
  vatByGroup: Record<string, { rate: number; gross: number; vat: number }>;
  byTerminal: Record<string, { orderCount: number; total: number }>;
  topItems: { itemId: string; name: string; count: number }[];
}

function ReportOverview() {
  const [from, setFrom] = useState(todayIso);
  const [to, setTo] = useState(todayIso);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const { nameOf: terminalName } = useTerminals();

  useEffect(() => {
    let stale = false;
    setError("");
    api
      .get<Report>(`/reporting/summary?from=${from}&to=${to}`)
      .then((r) => {
        if (!stale) setReport(r);
      })
      .catch((e: Error) => {
        if (!stale) {
          setReport(null);
          setError(e.message);
        }
      });
    return () => {
      stale = true;
    };
  }, [from, to]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white text-xl font-bold">Auswertung</h2>
        <RangeFields from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 mb-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {!report && !error && <div className="text-gray-400">Lädt...</div>}

      {report && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Buchungen", value: String(report.orderCount) },
              { label: "Umsatz brutto", value: formatEuro(report.totalGross) },
              { label: "MwSt.", value: formatEuro(report.totalVat) },
              { label: "Umsatz netto", value: formatEuro(report.totalNet) },
            ].map((card) => (
              <div key={card.label} className="bg-gray-800 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-white">{card.value}</div>
                <div className="text-gray-400 text-xs mt-1">{card.label}</div>
              </div>
            ))}
          </div>

          {report.cancelledCount > 0 && (
            <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 mb-4 text-red-300 text-sm">
              {report.cancelledCount} stornierte Buchung(en) in den Summen nicht enthalten
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-2">Nach MwSt.-Satz</h3>
              {Object.entries(report.vatByGroup).map(([key, data]) => (
                <div key={key} className="flex justify-between text-sm py-1 border-b border-gray-700">
                  <span className="text-gray-400">{data.rate}% MwSt.</span>
                  <span className="text-white">
                    {formatEuro(data.gross)} brutto / {formatEuro(data.vat)} MwSt.
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-2">Nach Terminal</h3>
              {Object.entries(report.byTerminal).map(([id, data]) => (
                <div key={id} className="flex justify-between text-sm py-1 border-b border-gray-700">
                  <span className="text-gray-400">{terminalName(id)}</span>
                  <span className="text-white">
                    {formatEuro(data.total)} · {data.orderCount} Buchungen
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-800 rounded-xl p-4 mt-4">
            <h3 className="text-white font-semibold mb-2">Meistverkaufte Artikel</h3>
            {report.topItems.map((item, i) => (
              <div key={item.itemId} className="flex justify-between text-sm py-1 border-b border-gray-700">
                <span className="text-gray-400">
                  {i + 1}. {item.name}
                </span>
                <span className="text-white">{item.count}× verkauft</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default ReportOverview;
