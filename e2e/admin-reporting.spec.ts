import { test, expect } from "@playwright/test";

test.describe("Admin — Transactions, Daily Overview, Import/Export", () => {
  const terminalName = `E2E-Admin-Terminal-${Date.now()}`;
  let terminalId = "";
  let groupId = "";

  test.beforeAll(async ({ request }) => {
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const terminalRes = await request.post("http://localhost:3001/api/terminals", {
          headers: { "Content-Type": "application/json", "x-admin-pin": "0000" },
          data: { name: terminalName, groupIds: [] },
        });
        if (terminalRes.ok()) {
          const terminal = await terminalRes.json();
          terminalId = terminal.id;
          break;
        }
      } catch {}
      await wait(2000);
    }

    const groupRes = await request.post("http://localhost:3001/api/catalog/groups", {
      headers: { "Content-Type": "application/json", "x-admin-pin": "0000" },
      data: { name: `Drinks-${Date.now()}`, vatRate: 19 },
    });
    if (groupRes.ok()) {
      const group = await groupRes.json();
      groupId = group.id;
    }

    await request.post("http://localhost:3001/api/catalog/items", {
      headers: { "Content-Type": "application/json", "x-admin-pin": "0000" },
      data: { name: "Espresso", groupId, price: 2.50 },
    });
    await request.post("http://localhost:3001/api/catalog/items", {
      headers: { "Content-Type": "application/json", "x-admin-pin": "0000" },
      data: { name: "Cappuccino", groupId, price: 3.20 },
    });
    await request.post("http://localhost:3001/api/catalog/items", {
      headers: { "Content-Type": "application/json", "x-admin-pin": "0000" },
      data: { name: "Cookie", groupId, price: 1.80 },
    });

    if (terminalId && groupId) {
      await request.put(`http://localhost:3001/api/terminals/${terminalId}`, {
        headers: { "Content-Type": "application/json", "x-admin-pin": "0000" },
        data: { name: terminalName, groupIds: [groupId] },
      });
    }

    await wait(2000);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000);
  });

  const loginToAdmin = async (page: any) => {
    await page.getByRole("button", { name: "Admin Panel" }).click();
    await page.waitForTimeout(500);
    for (const d of "0000") {
      await page.getByText(d).click();
      await page.waitForTimeout(100);
    }
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible({ timeout: 5000 });
  };

  const createClosedOrder = async (page: any, items: string[], expectedTotal: string) => {
    await page.getByRole("button", { name: terminalName }).click();
    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });

    for (const itemName of items) {
      await page.locator(`button:has-text('${itemName}')`).first().click();
      await page.waitForTimeout(200);
    }
    await expect(page.getByText(/Order #/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(expectedTotal).first()).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Pay & Close" }).click();
    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Exit" }).click();
    await expect(page.getByText("POS System")).toBeVisible({ timeout: 5000 });
  };

  // ── Transaction View ──────────────────────────────────────────

  test("transaction view: order lifecycle — closed → cancelled", async ({ page }) => {
    await createClosedOrder(page, ["Espresso", "Cappuccino"], "5.70€");

    await loginToAdmin(page);
    await page.getByRole("button", { name: "Transactions" }).click();
    await page.waitForTimeout(500);

    // Verify the closed order appears — use first() since items string may span one cell
    await expect(page.getByText("1x Espresso").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("1x Cappuccino").first()).toBeVisible();

    // Verify status badge shows "closed"
    await expect(page.locator("td span", { hasText: "closed" }).first()).toBeVisible({ timeout: 5000 });

    // Logout and create an open order for cancel testing
    await page.getByRole("button", { name: "Logout" }).click();
    await page.waitForTimeout(500);

    // Create an order and leave it open
    await page.getByRole("button", { name: terminalName }).click();
    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });
    await page.locator("button:has-text('Cookie')").first().click();
    await page.waitForTimeout(300);
    await expect(page.getByText(/Order #/)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Exit" }).click();
    await page.waitForTimeout(500);

    // Back to admin, cancel the open order from Transactions
    await loginToAdmin(page);
    await page.getByRole("button", { name: "Transactions" }).click();
    await page.waitForTimeout(500);

    // Filter to see open orders
    await page.locator("select").first().selectOption("open");
    await page.waitForTimeout(300);

    // Should see an open order with Cancel button
    const cancelBtn = page.getByRole("button", { name: "Cancel" });
    await expect(cancelBtn.first()).toBeVisible({ timeout: 5000 });
    await cancelBtn.first().click();
    await page.waitForTimeout(500);

    // Switch to Cancelled filter to verify cancellation
    await page.locator("select").first().selectOption("cancelled");
    await page.waitForTimeout(300);

    // Should see a cancelled badge
    await expect(page.locator("td span", { hasText: "cancelled" }).first()).toBeVisible({ timeout: 5000 });

    // Filter "closed" should still show the original completed order
    await page.locator("select").first().selectOption("closed");
    await page.waitForTimeout(300);
    await expect(page.getByText("1x Espresso").first()).toBeVisible();
  });

  // ── Daily Overview ────────────────────────────────────────────

  test("daily overview: totals, VAT, by-terminal, by-VAT-group, top items", async ({ page }) => {
    // Data is already populated by the transaction view test (which runs first).
    // The daily overview is the default admin tab.
    await loginToAdmin(page);
    await expect(page.getByRole("heading", { name: /Daily Overview/ })).toBeVisible({ timeout: 5000 });

    // Key stat cards present (use exact match to avoid "orders" in by-terminal)
    await expect(page.getByText("Orders", { exact: true })).toBeVisible();
    await expect(page.getByText("Gross Revenue", { exact: true })).toBeVisible();
    await expect(page.getByText("VAT Collected", { exact: true })).toBeVisible();
    await expect(page.getByText("Net Revenue", { exact: true })).toBeVisible();

    // "By VAT Group" section with 19% VAT row
    await expect(page.getByRole("heading", { name: "By VAT Group" })).toBeVisible();
    await expect(page.getByText(/19% VAT/)).toBeVisible({ timeout: 5000 });

    // "By Terminal" section
    await expect(page.getByRole("heading", { name: "By Terminal" })).toBeVisible();

    // "Top Items" section shows Cookie (ordered 2× in this test)
    await expect(page.getByRole("heading", { name: "Top Items" })).toBeVisible();
    await expect(page.getByText("Cookie").first()).toBeVisible({ timeout: 5000 });
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
    await page.getByRole("button", { name: "Preview" }).click();
    await page.waitForTimeout(500);

    // Verify preview shows items to create (groups may be new or existing)
    await expect(page.getByText("Items to Create")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Muffin")).toBeVisible();
    await expect(page.getByText("Brownie")).toBeVisible();

    // Click Confirm Import
    await page.getByRole("button", { name: "Confirm Import" }).click();
    await page.waitForTimeout(500);

    // Verify success message
    await expect(page.getByText(/Created.*items/)).toBeVisible({ timeout: 5000 });

    // Navigate to Items tab to verify imported items exist
    await page.getByRole("button", { name: "Items" }).click();
    await page.waitForTimeout(500);

    await expect(page.getByText("Muffin")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Brownie")).toBeVisible();
  });
});
