import { randomUUID } from "crypto";
import { test, expect } from "@playwright/test";

const API = "http://localhost:3001/api";
const ADMIN = { "Content-Type": "application/json", "x-admin-pin": "0000" };

test.describe("Admin — Buchungen, Auswertung, Import/Export", () => {
  const terminalName = `E2E-Admin-Terminal-${Date.now()}`;
  let terminalId = "";
  let terminalKey = "";
  const items: Record<string, { id: string; price: number }> = {};
  const vatRate = 19;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // A sale as the offline terminal uploads it: OrderOpened, ItemAdded..., OrderClosed.
  const syncSale = async (request: any, lines: string[]): Promise<string> => {
    const orderId = randomUUID();
    const at = new Date().toISOString();
    let totalGross = 0;
    let totalVat = 0;
    const itemEvents = lines.map((name) => {
      const { id, price } = items[name];
      const vatAmount = Math.round((price - price / (1 + vatRate / 100)) * 100) / 100;
      totalGross += price;
      totalVat += vatAmount;
      return {
        type: "ItemAdded",
        data: { orderId, itemId: id, name, qty: 1, unitPrice: price, vatRate, vatAmount, total: price },
        occurredAt: at,
      };
    });
    totalGross = Math.round(totalGross * 100) / 100;
    totalVat = Math.round(totalVat * 100) / 100;
    const res = await request.post(`${API}/sync/bookings`, {
      headers: {
        "Content-Type": "application/json",
        "x-terminal-id": terminalId,
        "x-terminal-key": terminalKey,
        "x-terminal-version": "0.2.0",
        "x-admin-pin": "0000",
      },
      data: {
        orders: [
          {
            orderId,
            events: [
              { type: "OrderOpened", data: { id: orderId, terminalId }, occurredAt: at },
              ...itemEvents,
              {
                type: "OrderClosed",
                data: {
                  orderId,
                  totalGross,
                  totalVat: { [vatRate]: totalVat },
                  totalNet: Math.round((totalGross - totalVat) * 100) / 100,
                },
                occurredAt: at,
              },
            ],
          },
        ],
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.rejected).toEqual([]);
    expect(body.accepted).toContain(orderId);
    return orderId;
  };

  test.beforeAll(async ({ request }) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const terminalRes = await request.post(`${API}/terminals`, {
          headers: ADMIN,
          data: { name: terminalName, groupIds: [] },
        });
        if (terminalRes.ok()) {
          terminalId = (await terminalRes.json()).id;
          break;
        }
      } catch {}
      await sleep(2000);
    }
    expect(terminalId).toBeTruthy();

    const groupRes = await request.post(`${API}/catalog/groups`, {
      headers: ADMIN,
      data: { name: `Drinks-${Date.now()}`, vatRate },
    });
    expect(groupRes.ok()).toBeTruthy();
    const groupId = (await groupRes.json()).id;

    for (const [name, price] of [["Espresso", 2.5], ["Cappuccino", 3.2], ["Cookie", 1.8]] as const) {
      const res = await request.post(`${API}/catalog/items`, {
        headers: ADMIN,
        data: { name, groupId, price },
      });
      expect(res.ok()).toBeTruthy();
      items[name] = { id: (await res.json()).id, price };
    }

    await request.put(`${API}/terminals/${terminalId}`, {
      headers: ADMIN,
      data: { name: terminalName, groupIds: [groupId] },
    });
    const keyRes = await request.post(`${API}/terminals/${terminalId}/key`, { headers: ADMIN });
    expect(keyRes.ok()).toBeTruthy();
    terminalKey = (await keyRes.json()).key;

    await sleep(1000);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  const loginToAdmin = async (page: any) => {
    await expect(page.getByText("Administrator-Anmeldung")).toBeVisible({ timeout: 5000 });
    for (const d of "0000") {
      await page.getByText(d, { exact: true }).click();
    }
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible({ timeout: 5000 });
  };

  const dayOffset = (days: number) =>
    new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const range = () => `from=${dayOffset(-1)}&to=${dayOffset(1)}`;

  // ── Buchungen ──────────────────────────────────────────────

  test("transactions: synced sale is listed as closed, admin cancel marks it cancelled", async ({ request }) => {
    const orderId = await syncSale(request, ["Espresso", "Cappuccino"]);

    const list = async (status: string) => {
      const res = await request.get(`${API}/reporting/transactions?${range()}&status=${status}&terminal=${terminalId}`, {
        headers: ADMIN,
      });
      expect(res.ok()).toBeTruthy();
      return (await res.json()) as { orderId: string; items: string; status: string }[];
    };

    // Projections are updated asynchronously after the upload.
    await expect
      .poll(async () => (await list("closed")).some((t) => t.orderId === orderId))
      .toBeTruthy();
    const closed = (await list("closed")).find((t) => t.orderId === orderId);
    expect(closed?.items).toContain("1x Espresso");
    expect(closed?.items).toContain("1x Cappuccino");

    const noPin = await request.post(`${API}/orders/${orderId}/cancel`, { data: { reason: "x" } });
    expect(noPin.status()).toBe(403);
    const cancelRes = await request.post(`${API}/orders/${orderId}/cancel`, {
      headers: ADMIN,
      data: { reason: "Cancelled from e2e" },
    });
    expect(cancelRes.ok()).toBeTruthy();

    await expect
      .poll(async () => (await list("cancelled")).some((t) => t.orderId === orderId))
      .toBeTruthy();
    expect((await list("closed")).some((t) => t.orderId === orderId)).toBeFalsy();

  });

  test("buchungen: UI lists the sale with terminal name and cancels it after confirmation", async ({ page, request }) => {
    const orderId = await syncSale(request, ["Espresso"]);
    const shortId = orderId.slice(0, 8);

    await loginToAdmin(page);
    await page.getByRole("button", { name: "Buchungen" }).click();
    await page.getByLabel("Terminal", { exact: true }).selectOption({ label: terminalName });

    const row = page.getByRole("row").filter({ hasText: shortId }).filter({ hasText: "Abgeschlossen" });
    await expect(async () => {
      await page.getByLabel("Von").fill(dayOffset(-1));
      await expect(row).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 10000 });
    await expect(row).toContainText(terminalName);
    await expect(row).toContainText("1x Espresso");

    page.once("dialog", (dialog) => {
      expect(dialog.message()).toBe(`Buchung #${shortId} wirklich stornieren?`);
      dialog.accept();
    });
    await row.getByRole("button", { name: "Stornieren" }).click();

    await expect(
      page.getByRole("row").filter({ hasText: shortId }).filter({ hasText: "Storniert" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(row.getByRole("button", { name: "Stornieren" })).toHaveCount(0);
  });

  // ── Auswertung ────────────────────────────────────────────

  test("auswertung: report totals, VAT, by-terminal, top items", async ({ page, request }) => {
    await syncSale(request, ["Cookie"]);
    await syncSale(request, ["Cookie"]);

    const getReport = async () =>
      (await request.get(`${API}/reporting/summary?${range()}`, { headers: ADMIN })).json();
    await expect
      .poll(async () => (await getReport()).byTerminal[terminalId]?.orderCount ?? 0)
      .toBeGreaterThanOrEqual(2);
    const report = await getReport();
    expect(report.orderCount).toBeGreaterThanOrEqual(2);
    expect(report.totalGross).toBeGreaterThan(0);
    expect(report.vatByGroup[String(vatRate)]).toBeTruthy();
    expect(report.byTerminal[terminalId].orderCount).toBeGreaterThanOrEqual(2);
    expect(report.topItems.some((i: { name: string }) => i.name === "Cookie")).toBeTruthy();

    // The same figures are shown in the UI, with the terminal name instead of its id.
    await loginToAdmin(page);
    await expect(page.getByRole("heading", { name: "Auswertung" })).toBeVisible();
    await expect(page.getByText("Meistverkaufte Artikel")).toBeVisible();
    await expect(page.getByText(terminalName)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Cookie/)).toBeVisible();
    await expect(page.getByText("19% MwSt.")).toBeVisible();
  });

  test("auswertung: invalid range shows the backend error", async ({ page }) => {
    await loginToAdmin(page);
    await expect(page.getByRole("heading", { name: "Auswertung" })).toBeVisible();
    await page.getByLabel("Von").fill("2099-01-02");
    await page.getByLabel("Bis").fill("2099-01-01");
    await expect(page.getByText("Zeitraum ungültig")).toBeVisible({ timeout: 5000 });
  });

  test("terminals: show and regenerate key after confirmation", async ({ page }) => {
    await loginToAdmin(page);
    await page.getByRole("button", { name: "Terminals", exact: true }).click();
    const card = page.locator("div.bg-gray-800").filter({ hasText: terminalName }).filter({ has: page.getByRole("button", { name: "Schlüssel anzeigen" }) });
    await card.getByRole("button", { name: "Schlüssel anzeigen" }).click();
    await expect(card.getByText(terminalKey)).toBeVisible();

    page.once("dialog", (dialog) => {
      expect(dialog.message()).toBe(
        "Der alte Schlüssel wird ungültig. Das Terminal muss neu eingerichtet werden. Fortfahren?",
      );
      dialog.accept();
    });
    await card.getByRole("button", { name: "Neuen Schlüssel erzeugen" }).click();
    await expect(card.getByText(terminalKey)).toHaveCount(0);
    await expect(card.locator("code")).toBeVisible();
  });

  // ── Import/Export ─────────────────────────────────────────────

  test("import/export: preview → confirm → verify items", async ({ page }) => {
    await loginToAdmin(page);

    // Navigate to Import/Export
    await page.getByRole("button", { name: "Import/Export" }).click();
    await page.waitForTimeout(500);

    // Generate CSV content with valid UUIDs
    const muffinId = "123e4567-e89b-42d3-a456-426614174000";
    const brownieId = "223e4567-e89b-42d3-a456-426614174001";
    const groupName = `Bakery-${Date.now()}`;

    const csvContent = [
      ["id", "name", "group_name", "group_vat_rate", "price"],
      [muffinId, "Muffin", groupName, "7", "2.20"],
      [brownieId, "Brownie", groupName, "7", "3.50"],
    ].map(row => row.join(",")).join("\n");

    // Upload the CSV via file input
    await page.locator('input[type="file"]').setInputFiles({
      name: "import.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csvContent),
    });
    await page.waitForTimeout(300);

    // Click Preview
    await page.getByRole("button", { name: "Vorschau" }).click();
    await page.waitForTimeout(500);

    // Verify preview shows items to create (groups may be new or existing)
    await expect(page.getByText("Artikel anlegen")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Muffin")).toBeVisible();
    await expect(page.getByText("Brownie")).toBeVisible();

    // Click Confirm Import
    await page.getByRole("button", { name: "Import bestätigen" }).click();
    await page.waitForTimeout(500);

    // Verify success message
    await expect(page.getByText(/Artikel erstellt/)).toBeVisible({ timeout: 5000 });

    // Navigate to Items tab to verify imported items exist
    await page.getByRole("button", { name: "Artikel", exact: true }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText("Muffin")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Brownie")).toBeVisible();
  });
});
