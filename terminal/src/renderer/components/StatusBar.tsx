import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Props {
  terminalName: string;
  lastCatalogFetchAt: string | null;
  unsyncedCount: number;
  busy: boolean;
  syncing: boolean;
  /** Bookings in flight must not be cancelled; a catalog fetch does not block Storno. */
  uploading: boolean;
  canReprint: boolean;
  /** Version of a downloaded update that installs on quit. */
  updateVersion: string | null;
  fullScreen: boolean;
  onFetchCatalog: () => void;
  onUpload: () => void;
  onReprint: () => void;
  onCancel: () => void;
  onSettings: () => void;
  onToggleFullScreen: () => void;
}

function StatusBar(p: Props) {
  return (
    <header className="bg-card px-4 py-2 flex items-center justify-between gap-4 border-b">
      <div className="flex items-center gap-4 min-w-0">
        <h1 className="font-bold text-lg truncate">{p.terminalName}</h1>
        <div className="text-sm leading-tight space-y-1">
          <div className="text-muted-foreground">
            {p.lastCatalogFetchAt
              ? `Artikelstand: ${new Date(p.lastCatalogFetchAt).toLocaleString("de-DE")}`
              : "Noch keine Artikel abgeholt"}
          </div>
          <Badge variant="secondary" className={p.unsyncedCount > 0 ? "bg-yellow-400 text-gray-900" : undefined}>
            {`${p.unsyncedCount} Buchung(en) nicht übertragen`}
          </Badge>
          {p.updateVersion && (
            <div className="text-green-300">{`Update ${p.updateVersion} bereit – wird beim Beenden installiert`}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <Button variant="secondary" size="touch" onClick={p.onFetchCatalog} disabled={p.syncing}>Artikel abholen</Button>
        <Button variant="secondary" size="touch" onClick={p.onUpload} disabled={p.syncing}>Buchungen übertragen</Button>
        <Button variant="secondary" size="touch" onClick={p.onReprint} disabled={p.busy || !p.canReprint}>Letzten Bon nachdrucken</Button>
        <Button variant="secondary" size="touch" onClick={p.onCancel} disabled={p.busy || p.uploading}>Storno</Button>
        <Button variant="secondary" size="touch" onClick={p.onSettings}>Einstellungen</Button>
        <Button variant="secondary" size="touch" onClick={p.onToggleFullScreen}>
          {p.fullScreen ? "Vollbild beenden" : "Vollbild"}
        </Button>
      </div>
    </header>
  );
}

export default StatusBar;
