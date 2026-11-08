import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  _electron,
  expect,
  test,
  type APIRequestContext,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

const API = "http://127.0.0.1:3001/api";
const SERVER_URL = "http://127.0.0.1:3001";
const ADMIN = { "Content-Type": "application/json", "x-admin-pin": "0000" };
const TERMINAL_DIR = resolve(__dirname, "../terminal");
// The electron package's main export is the path of its binary.
const ELECTRON: string = require(join(TERMINAL_DIR, "node_modules/electron"));
const PRINT_FAILED =
  "Kein Drucker eingerichtet – Buchung ist gespeichert. „Letzten Bon nachdrucken“ verwenden.";

// Evaluation days are calendar days in Europe/Berlin.
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

interface TestTerminal { id: string; name: string; key: string }
interface Transaction { orderId: string; status: string; cancelsOrderId?: string }

/** A terminal with its own group and items, so each test reads only its own figures. */
async function createTerminal(request: APIRequestContext): Promise<TestTerminal> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const name = `E2E-Kasse-${suffix}`;
  const group = await request.post(`${API}/catalog/groups`, {
    headers: ADMIN,
    data: { name: `Getränke-${suffix}`, vatRate: 19 },
  });
  expect(group.ok()).toBeTruthy();
  const groupId = (await group.json()).id;
  for (const [item, price] of [["Bier", 4.5], ["Wasser", 2]] as const) {
    const res = await request.post(`${API}/catalog/items`, {
      headers: ADMIN,
      data: { name: item, groupId, price },
    });
    expect(res.ok()).toBeTruthy();
  }
  const terminal = await request.post(`${API}/terminals`, {
    headers: ADMIN,
    data: { name, groupIds: [groupId], printPickupReceipts: false },
  });
  expect(terminal.ok()).toBeTruthy();
  const id = (await terminal.json()).id;
  const key = await request.post(`${API}/terminals/${id}/key`, { headers: ADMIN });
  expect(key.ok()).toBeTruthy();
  return { id, name, key: (await key.json()).key };
}

async function summary(request: APIRequestContext) {
  const res = await request.get(`${API}/reporting/summary?from=${today()}&to=${today()}`, { headers: ADMIN });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function transactions(request: APIRequestContext, terminalId: string): Promise<Transaction[]> {
  const res = await request.get(
    `${API}/reporting/transactions?from=${today()}&to=${today()}&terminal=${terminalId}`,
    { headers: ADMIN },
  );
  expect(res.ok()).toBeTruthy();
  return res.json();
}

/** Orders of this terminal counted in today's report; projections update asynchronously. */
async function terminalOrderCount(request: APIRequestContext, terminalId: string): Promise<number> {
  return (await summary(request)).byTerminal[terminalId]?.orderCount ?? 0;
}

/** Launches the terminal app on its own data dir (and thereby its own single-instance lock). */
async function launch(dataDir: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await _electron.launch({
    executablePath: ELECTRON,
    // The package dir (not out/main/index.js) so app.getVersion() reads terminal/package.json.
    args: [TERMINAL_DIR],
    env: { ...process.env, POS_TERMINAL_DATA_DIR: dataDir, DISPLAY: process.env.DISPLAY || ":0" },
  });
  const page = await app.firstWindow();
  return { app, page };
}

const pinDialog = (page: Page) => page.getByRole("dialog", { name: "Admin-PIN" });

/** Answers the „Admin-PIN“ dialog every sync asks for with the e2e server's PIN. */
async function enterPin(page: Page): Promise<void> {
  const dialog = pinDialog(page);
  await dialog.getByLabel("Admin-PIN").fill("0000");
  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(dialog).toBeHidden();
}

async function setUp(page: Page, terminal: TestTerminal): Promise<void> {
  await page.getByLabel("Serveradresse").fill(SERVER_URL);
  await page.getByRole("button", { name: "Terminals laden" }).click();
  await page.getByRole("button", { name: terminal.name, exact: true }).click();
  await page.getByLabel("Terminal-Schlüssel").fill(terminal.key);
  await page.getByRole("button", { name: "Einrichten & Artikel abholen" }).click();
  await enterPin(page);
  await expect(page.getByRole("heading", { name: terminal.name })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(/Artikel aktualisiert/);
}

const itemButton = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}`) });

/** Sells the given items; without a printer the booking is saved and the print error shown. */
async function sell(page: Page, items: string[]): Promise<void> {
  for (const item of items) await itemButton(page, item).click();
  await page.getByRole("button", { name: "Bezahlen & Drucken" }).click();
  await expect(page.getByRole("alert")).toContainText(PRINT_FAILED);
}

const pending = (page: Page, n: number) => page.getByText(`${n} Buchung(en) nicht übertragen`);

/** With nothing pending (`transferred` 0) the upload asks for no PIN. */
async function upload(page: Page, transferred: number): Promise<void> {
  await page.getByRole("button", { name: "Buchungen übertragen" }).click();
  if (transferred > 0) await enterPin(page);
  await expect(page.getByRole("status")).toHaveText(new RegExp(`^${transferred} Buchung\\(en\\) übertragen`));
}

test.describe("Terminal-App gegen echten Server", () => {
  let dataDir = "";
  let app: ElectronApplication | undefined;

  test.beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "pos-terminal-e2e-"));
  });

  test.afterEach(async () => {
    await app?.close();
    app = undefined;
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("setup, fetch items, sell offline without printer, restart keeps booking", async ({ request }) => {
    test.setTimeout(60000);
    const terminal = await createTerminal(request);
    let page: Page;
    ({ app, page } = await launch(dataDir));

    await setUp(page, terminal);
    await expect(pending(page, 0)).toBeVisible();

    await sell(page, ["Bier", "Bier"]);
    await expect(pending(page, 1)).toBeVisible();

    await app.close();
    ({ app, page } = await launch(dataDir));
    await expect(page.getByRole("heading", { name: terminal.name })).toBeVisible();
    await expect(pending(page, 1)).toBeVisible();
    await expect(itemButton(page, "Bier")).toBeVisible();
  });

  test("upload twice counts once in the admin report", async ({ request }) => {
    const terminal = await createTerminal(request);
    let page: Page;
    ({ app, page } = await launch(dataDir));
    await setUp(page, terminal);
    await sell(page, ["Bier", "Bier"]);
    await expect(pending(page, 1)).toBeVisible();

    await upload(page, 1);
    await expect(pending(page, 0)).toBeVisible();
    await expect.poll(() => terminalOrderCount(request, terminal.id)).toBe(1);

    await upload(page, 0);
    await expect(pending(page, 0)).toBeVisible();
    expect(await terminalOrderCount(request, terminal.id)).toBe(1);

    // The booking id as the terminal stored it locally.
    const orderId = await page.evaluate(async () => {
      const events: { type: string; orderId: string }[] = await (window as any).terminal.readEvents();
      return events.find((e) => e.type === "OrderClosed")?.orderId;
    });
    expect(orderId).toBeTruthy();
    const rows = await transactions(request, terminal.id);
    expect(rows).toHaveLength(1);
    expect(rows.filter((r) => r.orderId === orderId)).toHaveLength(1);
    expect(rows[0].status).toBe("closed");
  });

  test("storno at terminal before upload shows as cancelled in admin", async ({ request }) => {
    const terminal = await createTerminal(request);
    const cancelledBefore = (await summary(request)).cancelledCount;
    let page: Page;
    ({ app, page } = await launch(dataDir));
    await setUp(page, terminal);
    await sell(page, ["Bier", "Wasser"]);

    await page.getByRole("button", { name: "Storno" }).click();
    const dialog = page.getByRole("dialog", { name: "Buchung stornieren" });
    await dialog.getByRole("button", { name: /^#/ }).click();
    await dialog.getByRole("button", { name: "Ja, stornieren" }).click();
    await expect(page.getByRole("alert")).toContainText(PRINT_FAILED);
    // The sale and its cancellation are both still to be transferred.
    await expect(pending(page, 2)).toBeVisible();

    await upload(page, 2);
    await expect(pending(page, 0)).toBeVisible();

    await expect.poll(async () => (await transactions(request, terminal.id)).length).toBe(2);
    const rows = await transactions(request, terminal.id);
    const cancellation = rows.find((r) => r.cancelsOrderId);
    const sale = rows.find((r) => !r.cancelsOrderId);
    expect(sale?.status).toBe("cancelled");
    expect(cancellation?.status).toBe("cancelled");
    expect(cancellation?.cancelsOrderId).toBe(sale?.orderId);

    // The summary has no per-terminal cancelled count; other specs only ever add to the global one.
    const report = await summary(request);
    expect(report.byTerminal[terminal.id]?.orderCount ?? 0).toBe(0);
    expect(report.cancelledCount).toBeGreaterThanOrEqual(cancelledBefore + 1);
  });

  test("server unreachable on Artikel abholen keeps items", async ({ request }) => {
    const terminal = await createTerminal(request);
    let page: Page;
    ({ app, page } = await launch(dataDir));
    await setUp(page, terminal);

    // Point the stored server address at a dead port through the bridge, then reload the UI.
    await page.evaluate(async () => {
      const bridge = (window as any).terminal;
      const settings = await bridge.loadSettings();
      await bridge.saveSettings({ ...settings, serverUrl: "http://127.0.0.1:1" });
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: terminal.name })).toBeVisible();

    await page.getByRole("button", { name: "Artikel abholen" }).click();
    // The version check fails first, so no PIN is asked for.
    await expect(page.getByRole("alert")).toHaveText(/Server nicht erreichbar/);
    await expect(pinDialog(page)).toHaveCount(0);
    await expect(itemButton(page, "Bier")).toBeVisible();
    await expect(itemButton(page, "Wasser")).toBeVisible();
  });
});
