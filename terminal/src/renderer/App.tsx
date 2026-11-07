import { useState } from "react";
import CancelList from "./components/CancelList";
import CheckoutDialog from "./components/CheckoutDialog";
import ItemGrid from "./components/ItemGrid";
import MessageBar from "./components/MessageBar";
import OrderPanel from "./components/OrderPanel";
import SettingsDialog from "./components/SettingsDialog";
import SetupWizard from "./components/SetupWizard";
import StatusBar from "./components/StatusBar";
import { useTerminal } from "./state/useTerminal";

type Dialog = "checkout" | "cancel" | "settings" | null;

export default function App() {
  const t = useTerminal();
  const { actions } = t;
  const [resetup, setResetup] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);

  const messageBar = <MessageBar message={t.message} onDismiss={actions.dismissMessage} />;

  if (!t.ready) {
    return (
      <div className="min-h-screen flex flex-col">
        {messageBar}
        <main className="flex-1 flex items-center justify-center text-gray-400">Lade …</main>
      </div>
    );
  }

  // No selling without a catalog: first start (or a lost catalog) goes through the setup.
  if (!t.settings || !t.catalog || resetup) {
    const canReturn = resetup && t.settings !== null && t.catalog !== null;
    return (
      <div className="min-h-screen flex flex-col">
        {messageBar}
        <SetupWizard
          initial={t.settings}
          onSetup={async (candidate) => {
            const ok = await actions.fetchCatalog(candidate);
            if (ok) setResetup(false);
            return ok;
          }}
          onCancel={canReturn ? () => setResetup(false) : undefined}
        />
      </div>
    );
  }

  const { settings, catalog, openOrder } = t;
  const pay = () => {
    if (settings.changeCalculator) setDialog("checkout");
    else void actions.checkout();
  };

  return (
    <div className="h-screen flex flex-col">
      <StatusBar
        terminalName={catalog.terminal.name}
        lastCatalogFetchAt={settings.lastCatalogFetchAt}
        unsyncedCount={t.unsyncedCount}
        busy={t.busy}
        syncing={t.syncing}
        uploading={t.uploading}
        canReprint={t.canReprint}
        updateVersion={t.updateVersion}
        onFetchCatalog={() => void actions.fetchCatalog()}
        onUpload={() => void actions.upload()}
        onReprint={() => void actions.reprintLast()}
        onCancel={() => setDialog("cancel")}
        onSettings={() => setDialog("settings")}
      />
      {t.clockWarning && (
        <div role="alert" className="bg-yellow-400 text-gray-900 font-semibold px-4 py-3">{t.clockWarning}</div>
      )}
      {messageBar}

      <main className="flex-1 flex gap-4 p-4 overflow-hidden">
        <div className="flex-[3] min-w-0">
          <ItemGrid catalog={catalog} disabled={t.busy} onAddItem={(id) => void actions.addItem(id)} />
        </div>
        <div className="flex-[2] min-w-0">
          <OrderPanel
            order={openOrder}
            disabled={t.busy}
            onChangeQty={(id, delta) => void actions.changeQty(id, delta)}
            onRemoveLine={(id) => void actions.removeLine(id)}
            onPay={pay}
            onDiscard={() => void actions.discard()}
          />
        </div>
      </main>

      {dialog === "checkout" && openOrder && (
        <CheckoutDialog
          total={openOrder.totalGross}
          onConfirm={() => { setDialog(null); void actions.checkout(); }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === "cancel" && (
        <CancelList
          orders={t.cancellable}
          onCancelOrder={(id) => void actions.cancel(id)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "settings" && (
        <SettingsDialog
          settings={settings}
          unsyncedCount={t.unsyncedCount}
          hasOpenOrder={openOrder !== undefined}
          syncing={t.syncing}
          onSave={(patch) => void actions.saveSettings(patch)}
          onResetup={() => { setDialog(null); setResetup(true); }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
