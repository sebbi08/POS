import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "../api/client";
import { formatEuro, todayIso } from "../lib/format";
import { useTerminals } from "../lib/useTerminals";
import DateRangePicker from "./DateRangePicker";
import ConfirmDialog from "./ConfirmDialog";

interface Transaction {
  orderId: string;
  terminalId: string;
  items: string;
  totalGross: number;
  status: "closed" | "cancelled";
  title?: string;
  cancelsOrderId?: string;
  closedAt: string;
}

function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [range, setRange] = useState(() => {
    const today = todayIso();
    return { from: today, to: today };
  });
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [terminal, setTerminal] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { terminals, nameOf } = useTerminals();

  const query = () => {
    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (status !== "all") params.set("status", status);
    if (search) params.set("search", search);
    if (terminal) params.set("terminal", terminal);
    return api.get<Transaction[]>(`/reporting/transactions?${params}`);
  };

  // Drops responses of superseded requests so a slow earlier one cannot overwrite newer rows.
  useEffect(() => {
    let stale = false;
    query()
      .then((rows) => {
        if (stale) return;
        setError("");
        setTransactions(rows);
      })
      .catch((e: Error) => {
        if (stale) return;
        setTransactions([]);
        setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [range, status, search, terminal]);

  const handleCancel = async (orderId: string) => {
    setConfirmId(null);
    setCancelling(orderId);
    try {
      await api.post(`/orders/${orderId}/cancel`, { reason: "Storniert im Admin-Bereich" });
      setTransactions(await query());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCancelling(null);
    }
  };


  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-foreground text-xl font-bold">Buchungen</h2>
        <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          className="flex-1"
          placeholder="Suche nach Buchung oder Artikel..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Status" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="closed">Abgeschlossen</SelectItem>
            <SelectItem value="cancelled">Storniert</SelectItem>
          </SelectContent>
        </Select>
        <Select value={terminal || "all"} onValueChange={(v) => setTerminal(v === "all" ? "" : v)}>
          <SelectTrigger aria-label="Terminal" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Terminals</SelectItem>
            {terminals.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Buchung</TableHead>
            <TableHead>Terminal</TableHead>
            <TableHead>Artikel</TableHead>
            <TableHead className="text-right">Summe</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Titel</TableHead>
            <TableHead>Zeitpunkt</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.map((t) => (
            <TableRow
              key={t.orderId}
              className={t.status === "cancelled" ? "line-through text-destructive" : undefined}
            >
              <TableCell>{t.orderId.slice(0, 8)}</TableCell>
              <TableCell className="text-muted-foreground">{nameOf(t.terminalId)}</TableCell>
              <TableCell className="whitespace-normal">{t.items}</TableCell>
              <TableCell className="text-right">{formatEuro(t.totalGross)}</TableCell>
              <TableCell>
                <Badge variant={t.status === "cancelled" ? "destructive" : "secondary"}>
                  {t.status === "cancelled" ? "Storniert" : "Abgeschlossen"}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {t.title || (t.cancelsOrderId ? `Storno zu #${t.cancelsOrderId.slice(0, 8)}` : "")}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">
                {t.closedAt ? new Date(t.closedAt).toLocaleString("de-DE") : ""}
              </TableCell>
              <TableCell>
                {t.status === "closed" && !t.cancelsOrderId && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmId(t.orderId)}
                    disabled={cancelling === t.orderId}
                  >
                    {cancelling === t.orderId ? "..." : "Stornieren"}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {transactions.length === 0 && !error && (
        <div className="text-muted-foreground text-center py-8">Keine Buchungen gefunden</div>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        title="Buchung stornieren?"
        description={confirmId ? `Buchung #${confirmId.slice(0, 8)} wirklich stornieren?` : ""}
        confirmLabel="Stornieren"
        destructive
        onConfirm={() => confirmId && handleCancel(confirmId)}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}

export default TransactionHistory;
