interface Props {
  terminalName: string;
  lastCatalogFetchAt: string | null;
  unsyncedCount: number;
  busy: boolean;
  syncing: boolean;
  canReprint: boolean;
  onFetchCatalog: () => void;
  onUpload: () => void;
  onReprint: () => void;
  onCancel: () => void;
  onSettings: () => void;
}

const button = "bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors";

function StatusBar(p: Props) {
  return (
    <header className="bg-gray-800 px-4 py-2 flex items-center justify-between gap-4 border-b border-gray-700">
      <div className="flex items-center gap-4 min-w-0">
        <h1 className="text-white font-bold text-lg truncate">{p.terminalName}</h1>
        <div className="text-sm leading-tight">
          <div className="text-gray-400">
            {p.lastCatalogFetchAt
              ? `Artikelstand: ${new Date(p.lastCatalogFetchAt).toLocaleString("de-DE")}`
              : "Noch keine Artikel abgeholt"}
          </div>
          <div className={p.unsyncedCount > 0 ? "text-yellow-300" : "text-gray-400"}>
            {`${p.unsyncedCount} Buchung(en) nicht übertragen`}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <button onClick={p.onFetchCatalog} disabled={p.syncing} className={button}>Artikel abholen</button>
        <button onClick={p.onUpload} disabled={p.syncing} className={button}>Buchungen übertragen</button>
        <button onClick={p.onReprint} disabled={p.busy || !p.canReprint} className={button}>Letzten Bon nachdrucken</button>
        <button onClick={p.onCancel} disabled={p.busy || p.syncing} className={button}>Storno</button>
        <button onClick={p.onSettings} className={button}>Einstellungen</button>
      </div>
    </header>
  );
}

export default StatusBar;
