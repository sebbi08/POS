import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { api } from "../api/client";
import { formatEuro, todayIso } from "../lib/format";
import { useTerminals } from "../lib/useTerminals";
import DateRangePicker from "./DateRangePicker";

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
  const [range, setRange] = useState(() => {
    const today = todayIso();
    return { from: today, to: today };
  });
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const { nameOf: terminalName } = useTerminals();

  useEffect(() => {
    let stale = false;
    setError("");
    api
      .get<Report>(`/reporting/summary?from=${range.from}&to=${range.to}`)
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
  }, [range]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-foreground text-xl font-bold">Auswertung</h2>
        <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!report && !error && <div className="text-muted-foreground">Lädt...</div>}

      {report && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[
              { label: "Buchungen", value: String(report.orderCount) },
              { label: "Umsatz brutto", value: formatEuro(report.totalGross) },
              { label: "MwSt.", value: formatEuro(report.totalVat) },
              { label: "Umsatz netto", value: formatEuro(report.totalNet) },
            ].map((card) => (
              <Card key={card.label} className="p-4 text-center gap-1">
                <div className="text-2xl font-bold text-foreground">{card.value}</div>
                <div className="text-muted-foreground text-xs">{card.label}</div>
              </Card>
            ))}
          </div>

          {report.cancelledCount > 0 && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                {report.cancelledCount} stornierte Buchung(en) in den Summen nicht enthalten
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="text-foreground font-semibold">Nach MwSt.-Satz</h3>
              <Table>
                <TableBody>
                  {Object.entries(report.vatByGroup).map(([key, data]) => (
                    <TableRow key={key}>
                      <TableCell className="text-muted-foreground">{data.rate}% MwSt.</TableCell>
                      <TableCell className="text-right">
                        {formatEuro(data.gross)} brutto / {formatEuro(data.vat)} MwSt.
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>

            <Card className="p-4">
              <h3 className="text-foreground font-semibold">Nach Terminal</h3>
              <Table>
                <TableBody>
                  {Object.entries(report.byTerminal).map(([id, data]) => (
                    <TableRow key={id}>
                      <TableCell className="text-muted-foreground">{terminalName(id)}</TableCell>
                      <TableCell className="text-right">
                        {formatEuro(data.total)} · {data.orderCount} Buchungen
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>

          <Card className="p-4 mt-4">
            <h3 className="text-foreground font-semibold">Meistverkaufte Artikel</h3>
            <Table>
              <TableBody>
                {report.topItems.map((item, i) => (
                  <TableRow key={item.itemId}>
                    <TableCell className="text-muted-foreground">
                      {i + 1}. {item.name}
                    </TableCell>
                    <TableCell className="text-right">{item.count}× verkauft</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

export default ReportOverview;
