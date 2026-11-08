import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import App from "../App";
import { useTerminal } from "../state/useTerminal";
import { catalog, installFakeBridge, saleEvents, settings, T0 } from "./fake-bridge";
import type { NewEvent } from "../../shared/types";

vi.mock("../print/usb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../print/usb")>();
  return { ...actual, printJobs: vi.fn() };
});
vi.mock("../print/layout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../print/layout")>();
  return { ...actual, layoutJobs: vi.fn(actual.layoutJobs) };
});
vi.mock("../sync/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sync/client")>();
  return { ...actual, listTerminals: vi.fn(), fetchCatalog: vi.fn(), uploadAll: vi.fn() };
});
vi.mock("../sync/version", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../sync/version")>();
  return { ...actual, checkServerVersion: vi.fn(async () => {}) };
});

import { PRINT_TIMEOUT_MS, PrintError, printJobs } from "../print/usb";
import { layoutJobs } from "../print/layout";
import { fetchCatalog, listTerminals, SyncError, uploadAll } from "../sync/client";
import { checkServerVersion } from "../sync/version";

const SALE_A = "aaaaaaaa-0000-4000-8000-000000000001";
const SALE_B = "bbbbbbbb-0000-4000-8000-000000000002";
const OPEN = "cccccccc-0000-4000-8000-000000000003";

/** An open order with 2 x Bier (7,50 €). */
const openOrderEvents: NewEvent[] = [
  { orderId: OPEN, type: "OrderOpened", data: { id: OPEN, terminalId: "t1" }, occurredAt: T0 },
  {
    orderId: OPEN, type: "ItemAdded", occurredAt: T0,
    data: { orderId: OPEN, itemId: "i1", name: "Bier", qty: 2, unitPrice: 3.75, vatRate: 19, vatAmount: 1.2, total: 7.5 },
  },
];

const STORAGE_WARNING = "Speichern meldete einen Fehler – Buchung ist vorhanden, bitte Speicherplatz prüfen.";

let fake: ReturnType<typeof installFakeBridge>;

function setup(init: Parameters<typeof installFakeBridge>[0]) {
  fake = installFakeBridge(init);
  return render(<App />);
}

const orderPanel = () => screen.getByRole("region", { name: "Bestellung" });
const appendedTypes = () => fake.bridge.appendEvents.mock.calls.flatMap(([evs]) => evs.map((e) => e.type));
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const APP_VERSION = "0.2.0";
const AUTH = { pin: "0000", appVersion: APP_VERSION };

/** Waits for the „Admin-PIN“ dialog, types the PIN and confirms with OK. */
async function enterPin(pin = "0000") {
  const dialog = await screen.findByRole("dialog", { name: "Admin-PIN" });
  fireEvent.change(within(dialog).getByLabelText("Admin-PIN"), { target: { value: pin } });
  fireEvent.click(within(dialog).getByRole("button", { name: "OK" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(printJobs).mockImplementation(async () => { fake.log.push("printJobs"); });
});

describe("App", () => {
  it("first start shows setup wizard", async () => {
    setup({});
    expect(await screen.findByLabelText("Serveradresse")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminals laden" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bezahlen & Drucken" })).not.toBeInTheDocument();
  });

  it("setup validates the address, then saves catalog before settings", async () => {
    vi.mocked(listTerminals).mockResolvedValue([{ id: "t1", name: "Theke 1" }, { id: "t2", name: "Grill" }]);
    vi.mocked(fetchCatalog).mockResolvedValue({ catalog, clockSkewMs: 1000 });
    setup({});
    await screen.findByLabelText("Serveradresse");
    click("Terminals laden");
    expect(await screen.findByText("Bitte Serveradresse eingeben")).toBeInTheDocument();
    expect(listTerminals).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Serveradresse"), { target: { value: " kasse.example/ " } });
    click("Terminals laden");
    fireEvent.click(await screen.findByRole("button", { name: "Grill" }));
    fireEvent.change(screen.getByLabelText("Terminal-Schlüssel"), { target: { value: "geheim" } });
    click("Einrichten & Artikel abholen");
    await enterPin();

    expect(await screen.findByRole("button", { name: /Bier/ })).toBeInTheDocument();
    expect(listTerminals).toHaveBeenCalledWith("https://kasse.example");
    expect(checkServerVersion).toHaveBeenCalledWith("https://kasse.example", APP_VERSION);
    expect(fetchCatalog).toHaveBeenCalledWith({
      serverUrl: "https://kasse.example", terminalId: "t2", terminalKey: "geheim",
      changeCalculator: false, printer: null, paperWidth: "80", lastCatalogFetchAt: null, clockSkewMs: null,
    }, AUTH);
    expect(fake.log).toEqual(["saveCatalog", "saveSettings"]);
    expect(fake.state.settings).toMatchObject({ serverUrl: "https://kasse.example", terminalId: "t2", clockSkewMs: 1000 });
    expect(fake.state.settings?.lastCatalogFetchAt).toEqual(expect.any(String));
  });

  it("setup failure saves nothing and shows the SyncError message", async () => {
    vi.mocked(listTerminals).mockResolvedValue([{ id: "t1", name: "Theke 1" }]);
    vi.mocked(fetchCatalog).mockRejectedValue(new SyncError("Terminal-Schlüssel ungültig – bitte Terminal neu einrichten"));
    setup({});
    fireEvent.change(await screen.findByLabelText("Serveradresse"), { target: { value: "kasse.example" } });
    click("Terminals laden");
    fireEvent.click(await screen.findByRole("button", { name: "Theke 1" }));
    fireEvent.change(screen.getByLabelText("Terminal-Schlüssel"), { target: { value: "falsch" } });
    click("Einrichten & Artikel abholen");
    await enterPin();
    expect(await screen.findByText("Terminal-Schlüssel ungültig – bitte Terminal neu einrichten")).toBeInTheDocument();
    expect(fake.bridge.saveCatalog).not.toHaveBeenCalled();
    expect(fake.bridge.saveSettings).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Serveradresse")).toBeInTheDocument();
  });

  it("tap item twice then Bezahlen & Drucken persists events before printing", async () => {
    setup({ settings, catalog });
    expect(await screen.findByText("Keine offene Bestellung. Artikel antippen zum Starten.")).toBeInTheDocument();
    expect(screen.getByText("Theke 1")).toBeInTheDocument();
    expect(screen.getByText(`Artikelstand: ${new Date(T0).toLocaleString("de-DE")}`)).toBeInTheDocument();
    expect(screen.getByText("0 Buchung(en) nicht übertragen")).toBeInTheDocument();

    click(/Bier/);
    await waitFor(() => expect(within(orderPanel()).getByText("Bier")).toBeInTheDocument());
    click(/Bier/);
    await waitFor(() => expect(within(orderPanel()).getByText("2")).toBeInTheDocument());
    expect(within(orderPanel()).getAllByText(/7,50\s€/).length).toBeGreaterThan(0);

    click("Bezahlen & Drucken");
    expect(await screen.findByText("1 Buchung(en) nicht übertragen")).toBeInTheDocument();
    await waitFor(() => expect(printJobs).toHaveBeenCalledTimes(1));
    expect(fake.log).toEqual([
      "appendEvents:OrderOpened,ItemAdded",
      "appendEvents:ItemAdded",
      "appendEvents:FinalReceiptPrinted,PickupReceiptPrinted,OrderClosed",
      "printJobs",
    ]);
    const [printer, jobs] = vi.mocked(printJobs).mock.calls[0];
    expect(printer).toEqual(settings.printer);
    expect(jobs).toHaveLength(2); // final receipt + one pickup receipt
    expect(vi.mocked(layoutJobs).mock.calls[0][1]).toMatchObject({ width: 42, copy: false, terminalName: "Theke 1", company: catalog.company });
    expect(screen.getByText("Keine offene Bestellung. Artikel antippen zum Starten.")).toBeInTheDocument();
  });

  it("print failure keeps booking and shows German error; reprint calls printJobs with copy", async () => {
    vi.mocked(printJobs).mockRejectedValueOnce(new PrintError("Drucker nicht gefunden – ist er eingeschaltet und angeschlossen?"));
    setup({ settings: { ...settings, paperWidth: "58" }, catalog, events: openOrderEvents });
    fireEvent.click(await screen.findByRole("button", { name: "Bezahlen & Drucken" }));
    expect(await screen.findByText(
      "Drucker nicht gefunden – ist er eingeschaltet und angeschlossen? – Buchung ist gespeichert. „Letzten Bon nachdrucken“ verwenden.",
    )).toBeInTheDocument();
    expect(screen.getByText("1 Buchung(en) nicht übertragen")).toBeInTheDocument();
    expect(appendedTypes()).toContain("OrderClosed");

    click("Letzten Bon nachdrucken");
    await waitFor(() => expect(printJobs).toHaveBeenCalledTimes(2));
    const [order, ctx, printPickups] = vi.mocked(layoutJobs).mock.calls[1];
    expect(order.id).toBe(OPEN);
    expect(ctx).toMatchObject({ copy: true, width: 32 });
    expect(printPickups).toBe(true);
    expect(vi.mocked(printJobs).mock.calls[1][1]).toHaveLength(2);
    expect(fake.bridge.appendEvents).toHaveBeenCalledTimes(1); // reprint persists nothing
    await waitFor(() => expect(screen.queryByText(/Buchung ist gespeichert/)).not.toBeInTheDocument());
  });

  it("a printer that never answers times out and the till keeps selling", async () => {
    const actual = await vi.importActual<typeof import("../print/usb")>("../print/usb");
    vi.mocked(printJobs).mockImplementation(actual.printJobs);
    const hanging = {
      vendorId: 1, productId: 2,
      open: vi.fn(async () => {}), selectConfiguration: vi.fn(async () => {}), claimInterface: vi.fn(async () => {}),
      configuration: { interfaces: [{ interfaceNumber: 0, alternate: { endpoints: [{ direction: "out", endpointNumber: 1 }] } }] },
      transferOut: vi.fn(() => new Promise(() => {})),
      close: vi.fn(() => new Promise(() => {})),
    };
    Object.defineProperty(navigator, "usb", { configurable: true, value: { getDevices: vi.fn(async () => [hanging]) } });
    try {
      setup({ settings, catalog, events: openOrderEvents });
      const pay = await screen.findByRole("button", { name: "Bezahlen & Drucken" });
      vi.useFakeTimers({ shouldAdvanceTime: true });
      fireEvent.click(pay);
      await waitFor(() => expect(hanging.transferOut).toHaveBeenCalled());
      await act(async () => { await vi.advanceTimersByTimeAsync(PRINT_TIMEOUT_MS); });
      vi.useRealTimers();
      expect(await screen.findByText(
        "Drucker antwortet nicht – Buchung ist gespeichert. „Letzten Bon nachdrucken“ verwenden.",
      )).toBeInTheDocument();
      expect(hanging.close).toHaveBeenCalled();
      expect(screen.getByText("1 Buchung(en) nicht übertragen")).toBeInTheDocument();

      click(/Bier/);
      await waitFor(() => expect(within(orderPanel()).getByText("Bier")).toBeInTheDocument());
      expect(appendedTypes().at(-1)).toBe("ItemAdded");
    } finally {
      vi.useRealTimers();
      Reflect.deleteProperty(navigator, "usb");
    }
  });

  it("double click on Bezahlen & Drucken closes only one order", async () => {
    setup({ settings, catalog, events: openOrderEvents });
    const pay = await screen.findByRole("button", { name: "Bezahlen & Drucken" });
    await act(async () => {
      pay.click();
      pay.click();
    });
    await waitFor(() => expect(printJobs).toHaveBeenCalledTimes(1));
    await screen.findByText("1 Buchung(en) nicht übertragen");
    expect(appendedTypes().filter((t) => t === "OrderClosed")).toHaveLength(1);
    expect(printJobs).toHaveBeenCalledTimes(1);
  });

  it("fetch catalog failure keeps old items visible and shows Server nicht erreichbar", async () => {
    vi.mocked(fetchCatalog).mockRejectedValue(new SyncError("Server nicht erreichbar"));
    setup({ settings, catalog });
    await screen.findByRole("button", { name: /Bier/ });
    click("Artikel abholen");
    await enterPin();
    expect(await screen.findByText("Server nicht erreichbar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bier/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bratwurst/ })).toBeInTheDocument();
    expect(fake.bridge.saveCatalog).not.toHaveBeenCalled();
    expect(fake.bridge.saveSettings).not.toHaveBeenCalled();
  });

  it("fetch catalog success saves catalog, fetch time and clock skew", async () => {
    const next = { ...catalog, items: [...catalog.items, { id: "i3", name: "Cola", groupId: "g1", price: 2.5 }] };
    vi.mocked(fetchCatalog).mockResolvedValue({ catalog: next, clockSkewMs: 6 * 60_000 });
    setup({ settings, catalog });
    await screen.findByRole("button", { name: /Bier/ });
    click("Artikel abholen");
    await enterPin();
    expect(await screen.findByText("Artikel aktualisiert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cola/ })).toBeInTheDocument();
    expect(fake.log).toEqual(["saveCatalog", "saveSettings"]);
    expect(fake.state.settings?.clockSkewMs).toBe(6 * 60_000);
    expect(fake.state.settings?.lastCatalogFetchAt).not.toBe(T0);
    expect(screen.getByText("Die Uhr dieses Rechners weicht um 6 Minuten von der Serverzeit ab. Bitte Uhrzeit prüfen.")).toBeInTheDocument();
  });

  it("cancel requires confirmation and then persists OrderCancellationCreated", async () => {
    setup({ settings, catalog, events: saleEvents(SALE_A) });
    fireEvent.click(await screen.findByRole("button", { name: "Storno" }));
    fireEvent.click(await screen.findByRole("button", { name: /#aaaaaaaa/ }));
    expect(screen.getByText("Buchung #aaaaaaaa über 7,50 € wirklich stornieren?")).toBeInTheDocument();
    click("Abbrechen");
    expect(fake.bridge.appendEvents).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /#aaaaaaaa/ }));
    click("Ja, stornieren");
    await waitFor(() => expect(printJobs).toHaveBeenCalledTimes(1));
    const [[events]] = fake.bridge.appendEvents.mock.calls;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("OrderCancellationCreated");
    expect(events[0].data).toMatchObject({ cancelsOrderId: SALE_A, totalGross: -7.5 });
    expect(fake.log).toEqual(["appendEvents:OrderCancellationCreated", "printJobs"]);
    expect(await screen.findByText("2 Buchung(en) nicht übertragen")).toBeInTheDocument();
    const [stornoOrder] = vi.mocked(layoutJobs).mock.calls[0];
    expect(stornoOrder.cancelsOrderId).toBe(SALE_A);
  });

  it("change calculator shows Rückgeld 2,50 € for Gegeben 10 on 7,50 €", async () => {
    setup({ settings: { ...settings, changeCalculator: true }, catalog, events: openOrderEvents });
    fireEvent.click(await screen.findByRole("button", { name: "Bezahlen & Drucken" }));
    const dialog = screen.getByRole("dialog", { name: "Bezahlen" });
    expect(within(dialog).getByText("Summe").parentElement).toHaveTextContent(/7,50\s€/);
    const rueckgeld = () => within(dialog).getByText("Rückgeld").parentElement;

    fireEvent.change(within(dialog).getByLabelText("Gegeben"), { target: { value: "5" } });
    expect(rueckgeld()).toHaveTextContent("Betrag reicht nicht");
    fireEvent.change(within(dialog).getByLabelText("Gegeben"), { target: { value: "10,5" } });
    expect(rueckgeld()).toHaveTextContent(/3,00\s€/);
    fireEvent.change(within(dialog).getByLabelText("Gegeben"), { target: { value: "10" } });
    expect(rueckgeld()).toHaveTextContent(/2,50\s€/);
    expect(fake.bridge.appendEvents).not.toHaveBeenCalled();

    click("Abschließen & Drucken");
    await waitFor(() => expect(printJobs).toHaveBeenCalledTimes(1));
    expect(appendedTypes()).toContain("OrderClosed");
    expect(screen.queryByRole("dialog", { name: "Bezahlen" })).not.toBeInTheDocument();
  });

  it("change calculator Abbrechen keeps the order open", async () => {
    setup({ settings: { ...settings, changeCalculator: true }, catalog, events: openOrderEvents });
    fireEvent.click(await screen.findByRole("button", { name: "Bezahlen & Drucken" }));
    click("Abbrechen");
    expect(screen.queryByRole("dialog", { name: "Bezahlen" })).not.toBeInTheDocument();
    expect(fake.bridge.appendEvents).not.toHaveBeenCalled();
    expect(within(orderPanel()).getByText("Bier")).toBeInTheDocument();
  });

  it("open order is restored after remount", async () => {
    const first = setup({ settings, catalog, events: openOrderEvents });
    await waitFor(() => expect(within(orderPanel()).getByText("Bier")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Bratwurst/ }));
    await waitFor(() => expect(within(orderPanel()).getByText("Bratwurst")).toBeInTheDocument());
    first.unmount();

    render(<App />); // same bridge, i.e. what is on disk
    await waitFor(() => expect(within(orderPanel()).getByText("Bratwurst")).toBeInTheDocument());
    expect(within(orderPanel()).getByText("Bier")).toBeInTheDocument();
    expect(within(orderPanel()).getByText("#cccccccc", { exact: false })).toBeInTheDocument();
    expect(within(orderPanel()).getAllByText(/12,00\s€/).length).toBeGreaterThan(0);
  });

  it("upload marks accepted orders synced and counter drops to 0", async () => {
    vi.mocked(uploadAll).mockImplementation(async (_s, uploads) => ({
      accepted: uploads.map((u) => u.orderId), rejected: [], clockSkewMs: null,
    }));
    setup({ settings, catalog, events: [...saleEvents(SALE_A), ...openOrderEvents] });
    expect(await screen.findByText("1 Buchung(en) nicht übertragen")).toBeInTheDocument();
    click("Buchungen übertragen");
    await enterPin();
    expect(await screen.findByText("1 Buchung(en) übertragen")).toBeInTheDocument();
    expect(screen.getByText("0 Buchung(en) nicht übertragen")).toBeInTheDocument();
    const [s, uploads, auth] = vi.mocked(uploadAll).mock.calls[0];
    expect(s).toEqual(settings);
    expect(auth).toEqual(AUTH);
    expect(uploads.map((u) => u.orderId)).toEqual([SALE_A]); // the open order stays local
    expect(uploads[0].events.map((e) => e.type)).toEqual(["OrderOpened", "ItemAdded", "FinalReceiptPrinted", "OrderClosed"]);
    expect(fake.bridge.markSynced).toHaveBeenCalledWith([SALE_A]);
    expect(fake.bridge.saveSettings).not.toHaveBeenCalled(); // null skew keeps the stored value
  });

  it("upload reports rejected bookings with the first error", async () => {
    vi.mocked(uploadAll).mockResolvedValue({
      accepted: [SALE_A], rejected: [{ orderId: SALE_B, error: "Ungültige Buchung" }], clockSkewMs: 0,
    });
    setup({ settings: { ...settings, clockSkewMs: 7 * 60_000 }, catalog, events: [...saleEvents(SALE_A), ...saleEvents(SALE_B)] });
    expect(await screen.findByText("Die Uhr dieses Rechners weicht um 7 Minuten von der Serverzeit ab. Bitte Uhrzeit prüfen.")).toBeInTheDocument();
    click("Buchungen übertragen");
    await enterPin();
    expect(await screen.findByText("1 Buchung(en) übertragen, 1 abgelehnt: Ungültige Buchung")).toBeInTheDocument();
    expect(screen.getByText("1 Buchung(en) nicht übertragen")).toBeInTheDocument();
    expect(fake.state.settings?.clockSkewMs).toBe(0);
    expect(screen.queryByText(/Die Uhr dieses Rechners/)).not.toBeInTheDocument();
  });

  it("upload failure still marks the batches the server already accepted", async () => {
    vi.mocked(uploadAll).mockRejectedValue(new SyncError("Server nicht erreichbar", { accepted: [SALE_A], rejected: [] }));
    setup({ settings, catalog, events: [...saleEvents(SALE_A), ...saleEvents(SALE_B)] });
    expect(await screen.findByText("2 Buchung(en) nicht übertragen")).toBeInTheDocument();
    click("Buchungen übertragen");
    await enterPin();
    expect(await screen.findByText("Server nicht erreichbar – 1 Buchung(en) übertragen")).toBeInTheDocument();
    expect(fake.bridge.markSynced).toHaveBeenCalledWith([SALE_A]);
    expect(screen.getByText("1 Buchung(en) nicht übertragen")).toBeInTheDocument();
  });

  it("selling continues while an upload is still waiting for the server", async () => {
    let finish: (r: Awaited<ReturnType<typeof uploadAll>>) => void = () => {};
    vi.mocked(uploadAll).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    setup({ settings, catalog, events: saleEvents(SALE_A) });
    await screen.findByText("1 Buchung(en) nicht übertragen");
    click("Buchungen übertragen");
    await enterPin();
    await waitFor(() => expect(uploadAll).toHaveBeenCalled());

    click(/Bier/);
    await waitFor(() => expect(within(orderPanel()).getByText("Bier")).toBeInTheDocument());
    click("Bezahlen & Drucken");
    await screen.findByText("2 Buchung(en) nicht übertragen");
    expect(screen.getByRole("button", { name: "Buchungen übertragen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Storno" })).toBeDisabled();

    await act(async () => { finish({ accepted: [SALE_A], rejected: [], clockSkewMs: null }); });
    expect(await screen.findByText("1 Buchung(en) übertragen")).toBeInTheDocument();
    expect(screen.getByText("1 Buchung(en) nicht übertragen")).toBeInTheDocument();
    expect(fake.bridge.markSynced).toHaveBeenCalledWith([SALE_A]);
  });

  it("failed save re-reads the store and asks to try again", async () => {
    setup({ settings, catalog });
    fake.bridge.appendEvents.mockRejectedValueOnce(new Error("EIO"));
    fireEvent.click(await screen.findByRole("button", { name: /Bier/ }));
    expect(await screen.findByText("Speichern fehlgeschlagen – bitte erneut versuchen")).toBeInTheDocument();
    expect(fake.bridge.readEvents).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Keine offene Bestellung. Artikel antippen zum Starten.")).toBeInTheDocument();
  });

  it("checkout whose events reached the disk despite an error still prints and warns about storage", async () => {
    setup({ settings, catalog, events: openOrderEvents });
    const pay = await screen.findByRole("button", { name: "Bezahlen & Drucken" });
    const persist = fake.bridge.appendEvents.getMockImplementation()!;
    fake.bridge.appendEvents.mockImplementationOnce(async (evs) => { await persist(evs); throw new Error("IPC"); });
    fireEvent.click(pay);
    await waitFor(() => expect(printJobs).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("1 Buchung(en) nicht übertragen")).toBeInTheDocument();
    expect(screen.getByText(STORAGE_WARNING)).toBeInTheDocument();
    expect(screen.queryByText("Speichern fehlgeschlagen – bitte erneut versuchen")).not.toBeInTheDocument();
  });

  it("cancellation that reached the disk despite an error still prints and warns about storage", async () => {
    setup({ settings, catalog, events: saleEvents(SALE_A) });
    fireEvent.click(await screen.findByRole("button", { name: "Storno" }));
    fireEvent.click(screen.getByRole("button", { name: /#aaaaaaaa/ }));
    const persist = fake.bridge.appendEvents.getMockImplementation()!;
    fake.bridge.appendEvents.mockImplementationOnce(async (evs) => { await persist(evs); throw new Error("IPC"); });
    click("Ja, stornieren");
    await waitFor(() => expect(printJobs).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(STORAGE_WARNING)).toBeInTheDocument();
    expect(vi.mocked(layoutJobs).mock.calls[0][0].cancelsOrderId).toBe(SALE_A);
  });

  it("Verwerfen asks for confirmation", async () => {
    setup({ settings, catalog, events: openOrderEvents });
    fireEvent.click(await screen.findByRole("button", { name: "Verwerfen" }));
    expect(screen.getByText("Bestellung verwerfen?")).toBeInTheDocument();
    click("Abbrechen");
    expect(fake.bridge.appendEvents).not.toHaveBeenCalled();
    click("Verwerfen");
    click("Ja, verwerfen");
    expect(await screen.findByText("Keine offene Bestellung. Artikel antippen zum Starten.")).toBeInTheDocument();
    const [[events]] = fake.bridge.appendEvents.mock.calls;
    expect(events).toMatchObject([{ type: "OrderClosed", data: { cancelled: true } }]);
    expect(printJobs).not.toHaveBeenCalled();
  });

  it("settings toggle the change calculator and allow re-setup while bookings are pending", async () => {
    setup({ settings, catalog, events: saleEvents(SALE_A) });
    fireEvent.click(await screen.findByRole("button", { name: "Einstellungen" }));
    expect(screen.getByRole("button", { name: "Terminal neu einrichten" })).toBeEnabled();
    expect(screen.queryByText("Erst alle Buchungen übertragen")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Druckereinstellungen")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Rückgeldrechner anzeigen"));
    await waitFor(() => expect(fake.bridge.saveSettings).toHaveBeenCalledWith({ ...settings, changeCalculator: true }));
    await waitFor(() => expect(screen.getByLabelText("Rückgeldrechner anzeigen")).toBeChecked());
  });

  it("after a key rotation the same terminal is set up again and its pending bookings are uploaded", async () => {
    const NOT_SWITCHABLE = "Erst alle Buchungen übertragen – Terminal kann nicht gewechselt werden";
    vi.mocked(uploadAll).mockRejectedValueOnce(new SyncError("Terminal-Schlüssel ungültig – bitte Terminal neu einrichten"));
    vi.mocked(listTerminals).mockResolvedValue([{ id: "t1", name: "Theke 1" }, { id: "t2", name: "Grill" }]);
    vi.mocked(fetchCatalog).mockResolvedValue({ catalog, clockSkewMs: 0 });
    setup({ settings, catalog, events: saleEvents(SALE_A) });
    expect(await screen.findByText("1 Buchung(en) nicht übertragen")).toBeInTheDocument();
    click("Buchungen übertragen");
    await enterPin();
    expect(await screen.findByText("Terminal-Schlüssel ungültig – bitte Terminal neu einrichten")).toBeInTheDocument();

    click("Einstellungen");
    click("Terminal neu einrichten");
    fireEvent.change(screen.getByLabelText("Serveradresse"), { target: { value: "kasse2.example" } });
    click("Terminals laden");
    const theke = await screen.findByRole("button", { name: "Theke 1" });
    expect(theke).toHaveAttribute("aria-pressed", "true");
    click("Grill");
    expect(screen.getByText(NOT_SWITCHABLE)).toBeInTheDocument();
    expect(theke).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Grill" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.change(screen.getByLabelText("Terminal-Schlüssel"), { target: { value: "key-2" } });
    click("Einrichten & Artikel abholen");
    await enterPin();
    expect(await screen.findByRole("button", { name: /Bier/ })).toBeInTheDocument();
    expect(fetchCatalog).toHaveBeenCalledWith(expect.objectContaining({
      serverUrl: "https://kasse2.example", terminalId: "t1", terminalKey: "key-2",
    }), AUTH);

    vi.mocked(uploadAll).mockImplementation(async (_s, uploads) => ({
      accepted: uploads.map((u) => u.orderId), rejected: [], clockSkewMs: null,
    }));
    click("Buchungen übertragen");
    await enterPin();
    expect(await screen.findByText("1 Buchung(en) übertragen")).toBeInTheDocument();
    expect(screen.getByText("0 Buchung(en) nicht übertragen")).toBeInTheDocument();
    expect(vi.mocked(uploadAll).mock.calls.at(-1)![0]).toMatchObject({
      serverUrl: "https://kasse2.example", terminalId: "t1", terminalKey: "key-2",
    });
  });

  it("re-setup with pending bookings refuses a server whose list lacks this terminal", async () => {
    vi.mocked(listTerminals).mockResolvedValue([{ id: "t2", name: "Grill" }]);
    setup({ settings, catalog, events: saleEvents(SALE_A) });
    fireEvent.click(await screen.findByRole("button", { name: "Einstellungen" }));
    click("Terminal neu einrichten");
    click("Terminals laden");
    expect(await screen.findByText("Erst alle Buchungen übertragen – Terminal kann nicht gewechselt werden")).toBeInTheDocument();
    click("Grill");
    expect(screen.getByRole("button", { name: "Grill" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Einrichten & Artikel abholen" })).toBeDisabled();
  });

  it("a discarded order that is not uploaded yet also keeps the terminal from being switched", async () => {
    vi.mocked(listTerminals).mockResolvedValue([{ id: "t1", name: "Theke 1" }, { id: "t2", name: "Grill" }]);
    const discarded: NewEvent[] = [
      ...openOrderEvents,
      { orderId: OPEN, type: "OrderClosed", data: { orderId: OPEN, totalGross: 7.5, totalVat: { "19": 1.2 }, totalNet: 6.3, cancelled: true }, occurredAt: T0 },
    ];
    setup({ settings, catalog, events: discarded });
    expect(await screen.findByText("0 Buchung(en) nicht übertragen")).toBeInTheDocument();
    click("Einstellungen");
    click("Terminal neu einrichten");
    click("Terminals laden");
    fireEvent.click(await screen.findByRole("button", { name: "Grill" }));
    expect(screen.getByText("Erst alle Buchungen übertragen – Terminal kann nicht gewechselt werden")).toBeInTheDocument();
  });

  it("the setup action itself refuses another terminal while bookings are pending", async () => {
    fake = installFakeBridge({ settings, catalog, events: saleEvents(SALE_A) });
    const { result } = renderHook(() => useTerminal());
    await waitFor(() => expect(result.current.ready).toBe(true));
    let ok: boolean | undefined;
    await act(async () => { ok = await result.current.actions.fetchCatalog({ ...settings, terminalId: "t2" }); });
    expect(ok).toBe(false);
    expect(fetchCatalog).not.toHaveBeenCalled();
    expect(result.current.message).toEqual({
      kind: "error", text: "Erst alle Buchungen übertragen – Terminal kann nicht gewechselt werden",
    });
    expect(fake.state.settings).toEqual(settings);
  });

  it("re-setup without pending bookings may switch to another terminal", async () => {
    vi.mocked(listTerminals).mockResolvedValue([{ id: "t1", name: "Theke 1" }, { id: "t2", name: "Grill" }]);
    setup({ settings, catalog, events: saleEvents(SALE_A), synced: { [SALE_A]: T0 } });
    fireEvent.click(await screen.findByRole("button", { name: "Einstellungen" }));
    click("Terminal neu einrichten");
    click("Terminals laden");
    fireEvent.click(await screen.findByRole("button", { name: "Grill" }));
    expect(screen.getByRole("button", { name: "Grill" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/Terminal kann nicht gewechselt werden/)).not.toBeInTheDocument();
  });

  it("re-setup opens the wizard and keeps the till's catalog when cancelled", async () => {
    setup({ settings, catalog });
    fireEvent.click(await screen.findByRole("button", { name: "Einstellungen" }));
    click("Terminal neu einrichten");
    expect(screen.getByLabelText("Serveradresse")).toHaveValue("https://kasse.example");
    click("Abbrechen");
    expect(screen.getByRole("button", { name: /Bier/ })).toBeInTheDocument();
  });

  it("re-setup is blocked while an order is open", async () => {
    setup({ settings, catalog, events: openOrderEvents });
    fireEvent.click(await screen.findByRole("button", { name: "Einstellungen" }));
    expect(screen.getByRole("button", { name: "Terminal neu einrichten" })).toBeDisabled();
    expect(screen.getByText("Erst offene Bestellung abschließen oder verwerfen")).toBeInTheDocument();
  });

  it("re-setup is blocked while a sync is running", async () => {
    vi.mocked(uploadAll).mockImplementation(() => new Promise(() => {}));
    setup({ settings, catalog, events: saleEvents(SALE_A) });
    fireEvent.click(await screen.findByRole("button", { name: "Buchungen übertragen" }));
    await enterPin();
    await waitFor(() => expect(uploadAll).toHaveBeenCalled());
    click("Einstellungen");
    expect(screen.getByRole("button", { name: "Terminal neu einrichten" })).toBeDisabled();
    expect(screen.getByText("Abgleich läuft – bitte warten")).toBeInTheDocument();
  });

  it("re-setup whose settings cannot be saved restores the old catalog and keeps the till", async () => {
    const other = { ...catalog, terminal: { ...catalog.terminal, name: "Grill" }, items: [{ id: "i9", name: "Steak", groupId: "g2", price: 9 }] };
    vi.mocked(listTerminals).mockResolvedValue([{ id: "t1", name: "Theke 1" }, { id: "t2", name: "Grill" }]);
    vi.mocked(fetchCatalog).mockResolvedValue({ catalog: other, clockSkewMs: 0 });
    setup({ settings, catalog });
    fireEvent.click(await screen.findByRole("button", { name: "Einstellungen" }));
    click("Terminal neu einrichten");
    click("Terminals laden");
    fireEvent.click(await screen.findByRole("button", { name: "Grill" }));
    fake.bridge.saveSettings.mockRejectedValueOnce(new Error("EIO"));
    click("Einrichten & Artikel abholen");
    await enterPin();
    expect(await screen.findByText("Speichern fehlgeschlagen – bitte erneut versuchen")).toBeInTheDocument();
    expect(fake.bridge.saveCatalog.mock.calls.map(([c]) => c.terminal.name)).toEqual(["Grill", "Theke 1"]);
    expect(fake.state.catalog).toEqual(catalog);
    expect(fake.state.settings).toEqual(settings);
    click("Abbrechen");
    expect(screen.getByRole("button", { name: /Bier/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Steak/ })).not.toBeInTheDocument();
    expect(screen.getByText("Theke 1")).toBeInTheDocument();
  });

  it("setup shows the generic sync text when listing terminals fails unexpectedly", async () => {
    vi.mocked(listTerminals).mockRejectedValue(new TypeError("body.map is not a function"));
    setup({});
    fireEvent.change(await screen.findByLabelText("Serveradresse"), { target: { value: "kasse.example" } });
    click("Terminals laden");
    expect(await screen.findByText("Unerwartete Antwort vom Server")).toBeInTheDocument();
  });

  it("a settings toggle queued behind a catalog fetch keeps the new fetch time", async () => {
    let releaseCatalog: () => void = () => {};
    vi.mocked(fetchCatalog).mockResolvedValue({ catalog, clockSkewMs: 0 });
    setup({ settings, catalog });
    const save = fake.bridge.saveCatalog.getMockImplementation()!;
    fake.bridge.saveCatalog.mockImplementationOnce((c) => new Promise<void>((resolve) => {
      releaseCatalog = () => { void save(c).then(resolve); };
    }));
    fireEvent.click(await screen.findByRole("button", { name: "Artikel abholen" }));
    await enterPin();
    await waitFor(() => expect(fake.bridge.saveCatalog).toHaveBeenCalled());
    click("Einstellungen");
    fireEvent.click(screen.getByLabelText("Rückgeldrechner anzeigen"));
    await act(async () => { releaseCatalog(); });
    await waitFor(() => expect(fake.bridge.saveSettings).toHaveBeenCalledTimes(2));
    expect(fake.state.settings?.changeCalculator).toBe(true);
    expect(fake.state.settings?.lastCatalogFetchAt).not.toBe(T0);
  });

  it("printer chosen in PrinterSettings is persisted through saveSettings", async () => {
    Object.defineProperty(navigator, "usb", {
      configurable: true,
      value: { requestDevice: vi.fn(async () => ({ vendorId: 0x416, productId: 0x5011, productName: "TM-T88V" })) },
    });
    setup({ settings: { ...settings, printer: null }, catalog });
    fireEvent.click(await screen.findByRole("button", { name: "Einstellungen" }));
    fireEvent.click(screen.getByLabelText("Druckereinstellungen"));
    click("Suchen");
    await screen.findByText("Drucker übernommen – zum Behalten speichern");
    click("Speichern");
    const printer = { vendorId: 0x416, productId: 0x5011, name: "TM-T88V (0x416:0x5011)" };
    await waitFor(() => expect(fake.bridge.saveSettings).toHaveBeenCalledWith({ ...settings, printer }));
    expect(await screen.findByText(/TM-T88V \(0x416:0x5011\) · 80 mm/)).toBeInTheDocument();
  });

  it("quick double tap on an item opens one order with qty 2", async () => {
    setup({ settings, catalog });
    const bier = await screen.findByRole("button", { name: /Bier/ });
    await act(async () => {
      bier.click();
      bier.click();
    });
    await waitFor(() => expect(within(orderPanel()).getByText("2")).toBeInTheDocument());
    expect(appendedTypes().filter((t) => t === "OrderOpened")).toHaveLength(1);
    expect(appendedTypes()).toEqual(["OrderOpened", "ItemAdded", "ItemAdded"]);
  });

  it("Storno of an order that is being uploaded is refused", async () => {
    vi.mocked(uploadAll).mockImplementation(() => new Promise(() => {}));
    setup({ settings, catalog, events: saleEvents(SALE_A) });
    fireEvent.click(await screen.findByRole("button", { name: "Storno" }));
    fireEvent.click(screen.getByRole("button", { name: /#aaaaaaaa/ }));
    click("Buchungen übertragen"); // reachable only in this test; the dialog covers it on screen
    await enterPin();
    await waitFor(() => expect(uploadAll).toHaveBeenCalled());
    click("Ja, stornieren");
    expect(await screen.findByText("Buchung kann nicht mehr storniert werden")).toBeInTheDocument();
    expect(fake.bridge.appendEvents).not.toHaveBeenCalled();
    expect(printJobs).not.toHaveBeenCalled();
  });

  it("Storno stays available while only the catalog is being fetched", async () => {
    vi.mocked(fetchCatalog).mockImplementation(() => new Promise(() => {}));
    setup({ settings, catalog, events: saleEvents(SALE_A) });
    fireEvent.click(await screen.findByRole("button", { name: "Artikel abholen" }));
    await enterPin();
    await waitFor(() => expect(fetchCatalog).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Buchungen übertragen" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Storno" })).toBeEnabled();
  });

  it("shows the downloaded update in the status bar, only once one is ready", async () => {
    setup({ settings, catalog });
    await screen.findByRole("button", { name: "Storno" });
    expect(screen.queryByText(/bereit – wird beim Beenden installiert/)).not.toBeInTheDocument();
    act(() => fake.emitUpdateReady("1.2.3"));
    expect(screen.getByText("Update 1.2.3 bereit – wird beim Beenden installiert")).toBeInTheDocument();
  });

  it("unsubscribes from update notices on unmount", async () => {
    const { unmount } = setup({ settings, catalog });
    await screen.findByRole("button", { name: "Storno" });
    expect(fake.updateListeners.size).toBe(1);
    unmount();
    expect(fake.updateListeners.size).toBe(0);
  });
});

describe("Admin-PIN and version check", () => {
  it("Artikel abholen asks for PIN and sends it", async () => {
    vi.mocked(fetchCatalog).mockResolvedValue({ catalog, clockSkewMs: 0 });
    setup({ settings, catalog });
    await screen.findByRole("button", { name: /Bier/ });
    click("Artikel abholen");
    const dialog = await screen.findByRole("dialog", { name: "Admin-PIN" });
    const input = within(dialog).getByLabelText("Admin-PIN");
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(within(dialog).getByRole("button", { name: "OK" })).toBeDisabled();
    expect(fetchCatalog).not.toHaveBeenCalled();
    await enterPin("1234");
    expect(await screen.findByText("Artikel aktualisiert")).toBeInTheDocument();
    expect(checkServerVersion).toHaveBeenCalledWith(settings.serverUrl, APP_VERSION);
    expect(fetchCatalog).toHaveBeenCalledWith(settings, { pin: "1234", appVersion: APP_VERSION });
    expect(screen.queryByRole("dialog", { name: "Admin-PIN" })).not.toBeInTheDocument();
  });

  it("Enter in the PIN field submits", async () => {
    vi.mocked(fetchCatalog).mockResolvedValue({ catalog, clockSkewMs: 0 });
    setup({ settings, catalog });
    await screen.findByRole("button", { name: /Bier/ });
    click("Artikel abholen");
    const input = within(await screen.findByRole("dialog", { name: "Admin-PIN" })).getByLabelText("Admin-PIN");
    fireEvent.change(input, { target: { value: "4321" } });
    fireEvent.submit(input);
    await waitFor(() => expect(fetchCatalog).toHaveBeenCalledWith(settings, { pin: "4321", appVersion: APP_VERSION }));
  });

  it("version mismatch shows message and no PIN dialog", async () => {
    const text = "Server ist veraltet (Server 0.1.0, Kasse 0.2.0) – bitte zuerst den Server aktualisieren";
    vi.mocked(checkServerVersion).mockRejectedValueOnce(new SyncError(text));
    setup({ settings, catalog });
    await screen.findByRole("button", { name: /Bier/ });
    click("Artikel abholen");
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Admin-PIN" })).not.toBeInTheDocument();
    expect(fetchCatalog).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Artikel abholen" })).toBeEnabled();
  });

  it("without a readable app version the sync is refused as a mismatch", async () => {
    fake = installFakeBridge({ settings, catalog });
    fake.bridge.appVersion.mockRejectedValue(new Error("ipc"));
    vi.mocked(checkServerVersion).mockImplementationOnce(async (_url, version) => {
      if (version === "") throw new SyncError("Versionen passen nicht zusammen");
    });
    render(<App />);
    await screen.findByRole("button", { name: /Bier/ });
    click("Artikel abholen");
    expect(await screen.findByText("Versionen passen nicht zusammen")).toBeInTheDocument();
    expect(checkServerVersion).toHaveBeenCalledWith(settings.serverUrl, "");
    expect(fetchCatalog).not.toHaveBeenCalled();
  });

  it("cancel in PIN dialog aborts silently", async () => {
    setup({ settings, catalog, events: saleEvents(SALE_A) });
    await screen.findByRole("button", { name: /Bier/ });
    click("Artikel abholen");
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Admin-PIN" })).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Admin-PIN" })).not.toBeInTheDocument());
    expect(fetchCatalog).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // The sync guard is released again.
    await waitFor(() => expect(screen.getByRole("button", { name: "Artikel abholen" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Buchungen übertragen" })).toBeEnabled();
  });

  it("the PIN dialog keeps the sync guard: the other sync stays disabled", async () => {
    setup({ settings, catalog, events: saleEvents(SALE_A) });
    await screen.findByRole("button", { name: /Bier/ });
    click("Artikel abholen");
    await screen.findByRole("dialog", { name: "Admin-PIN" });
    expect(screen.getByRole("button", { name: "Buchungen übertragen" })).toBeDisabled();
  });

  it("wrong PIN on upload shows Admin-PIN falsch, nothing marked synced", async () => {
    vi.mocked(uploadAll).mockRejectedValue(new SyncError("Admin-PIN falsch", { accepted: [], rejected: [] }));
    setup({ settings, catalog, events: saleEvents(SALE_A) });
    expect(await screen.findByText("1 Buchung(en) nicht übertragen")).toBeInTheDocument();
    click("Buchungen übertragen");
    await enterPin("9999");
    expect(await screen.findByText("Admin-PIN falsch")).toBeInTheDocument();
    expect(uploadAll).toHaveBeenCalledWith(settings, expect.any(Array), { pin: "9999", appVersion: APP_VERSION });
    expect(fake.bridge.markSynced).not.toHaveBeenCalled();
    expect(screen.getByText("1 Buchung(en) nicht übertragen")).toBeInTheDocument();
  });

  it("upload with nothing pending needs no PIN", async () => {
    setup({ settings, catalog, events: saleEvents(SALE_A), synced: { [SALE_A]: T0 } });
    expect(await screen.findByText("0 Buchung(en) nicht übertragen")).toBeInTheDocument();
    click("Buchungen übertragen");
    expect(await screen.findByText("0 Buchung(en) übertragen")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Admin-PIN" })).not.toBeInTheDocument();
    expect(checkServerVersion).not.toHaveBeenCalled();
    expect(uploadAll).not.toHaveBeenCalled();
  });

  it("setup: wrong PIN saves nothing and wizard stays", async () => {
    vi.mocked(listTerminals).mockResolvedValue([{ id: "t1", name: "Theke 1" }]);
    vi.mocked(fetchCatalog).mockRejectedValue(new SyncError("Admin-PIN falsch"));
    setup({});
    fireEvent.change(await screen.findByLabelText("Serveradresse"), { target: { value: "kasse.example" } });
    click("Terminals laden");
    fireEvent.click(await screen.findByRole("button", { name: "Theke 1" }));
    fireEvent.change(screen.getByLabelText("Terminal-Schlüssel"), { target: { value: "geheim" } });
    click("Einrichten & Artikel abholen");
    await enterPin("1111");
    expect(await screen.findByText("Admin-PIN falsch")).toBeInTheDocument();
    expect(checkServerVersion).toHaveBeenCalledWith("https://kasse.example", APP_VERSION);
    expect(fake.bridge.saveCatalog).not.toHaveBeenCalled();
    expect(fake.bridge.saveSettings).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Serveradresse")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Einrichten & Artikel abholen" })).toBeEnabled());
  });

  it("setup: cancel in PIN dialog saves nothing and wizard stays", async () => {
    vi.mocked(listTerminals).mockResolvedValue([{ id: "t1", name: "Theke 1" }]);
    setup({});
    fireEvent.change(await screen.findByLabelText("Serveradresse"), { target: { value: "kasse.example" } });
    click("Terminals laden");
    fireEvent.click(await screen.findByRole("button", { name: "Theke 1" }));
    fireEvent.change(screen.getByLabelText("Terminal-Schlüssel"), { target: { value: "geheim" } });
    click("Einrichten & Artikel abholen");
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Admin-PIN" })).getByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Einrichten & Artikel abholen" })).toBeEnabled());
    expect(fetchCatalog).not.toHaveBeenCalled();
    expect(fake.bridge.saveSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("PIN is not persisted", async () => {
    const PIN = "987654";
    const consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    vi.mocked(fetchCatalog).mockResolvedValue({ catalog, clockSkewMs: 1000 });
    vi.mocked(uploadAll).mockImplementation(async (_s, uploads) => ({
      accepted: uploads.map((u) => u.orderId), rejected: [], clockSkewMs: 2000,
    }));
    setup({ settings, catalog, events: saleEvents(SALE_A) });
    await screen.findByRole("button", { name: /Bier/ });
    click("Artikel abholen");
    await enterPin(PIN);
    expect(await screen.findByText("Artikel aktualisiert")).toBeInTheDocument();
    click("Buchungen übertragen");
    await enterPin(PIN);
    expect(await screen.findByText("1 Buchung(en) übertragen")).toBeInTheDocument();
    click(/Bier/);
    await waitFor(() => expect(within(orderPanel()).getByText("Bier")).toBeInTheDocument());

    expect(fetchCatalog).toHaveBeenCalledWith(settings, { pin: PIN, appVersion: APP_VERSION }); // the PIN was really used
    expect(fake.bridge.saveSettings).toHaveBeenCalled();
    expect(fake.bridge.saveCatalog).toHaveBeenCalled();
    expect(fake.bridge.appendEvents).toHaveBeenCalled();
    const bridgeCalls = Object.fromEntries(Object.entries(fake.bridge).map(([name, fn]) => [name, fn.mock.calls]));
    expect(JSON.stringify(bridgeCalls)).not.toContain(PIN);
    expect(JSON.stringify(fake.state)).not.toContain(PIN);
    expect(JSON.stringify(consoleSpies.map((s) => s.mock.calls))).not.toContain(PIN);
    for (const s of consoleSpies) s.mockRestore();
  });
});

describe("storeError", () => {
  it("storeError shows blocking message", async () => {
    fake = installFakeBridge({ settings, catalog });
    const msg = "Lokale Daten stammen von einer neueren Version – bitte aktuelle Version installieren";
    fake.bridge.storeError.mockResolvedValue(msg);
    render(<App />);
    expect(await screen.findByText(msg)).toBeTruthy();
    expect(screen.queryByText("Lade …")).toBeNull();
    expect(fake.bridge.loadSettings).not.toHaveBeenCalled();
    expect(fake.bridge.readEvents).not.toHaveBeenCalled();
  });
});
