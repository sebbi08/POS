import { test, expect } from "@playwright/test";

test.describe("POS Terminal Flow", () => {
  const terminalName = `E2E-Terminal-${Date.now()}`;
  let terminalId = "";
  let groupId = "";

  test.beforeAll(async ({ request }) => {
    // Retry API calls in case backend isn't ready
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

    if (terminalId && groupId) {
      await request.put(`http://localhost:3001/api/terminals/${terminalId}`, {
        headers: { "Content-Type": "application/json", "x-admin-pin": "0000" },
        data: { name: terminalName, groupIds: [groupId] },
      });
    }

    await wait(1000); // let projections catch up
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(2000); // wait for projections to catch up
  });

  test("select a terminal and enter POS mode", async ({ page }) => {
    await expect(page.getByRole("button", { name: terminalName })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: terminalName }).click();

    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Espresso")).toBeVisible();
  });

  test("POS terminal shows assigned items", async ({ page }) => {
    await page.getByRole("button", { name: terminalName }).click();
    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });

    await expect(page.getByText("Espresso")).toBeVisible();
    await expect(page.getByText("2.50€")).toBeVisible();
    await expect(page.getByText("Cappuccino")).toBeVisible();
    await expect(page.getByText("3.20€")).toBeVisible();
  });

  test("complete order flow: tap item → auto-creates order → add items → pay & close", async ({ page }) => {
    await page.getByRole("button", { name: terminalName }).click();
    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });

    // Tapping an item auto-creates the order
    await page.locator("button:has-text('Espresso')").first().click();
    await expect(page.getByText(/Order #/)).toBeVisible({ timeout: 5000 });

    await page.locator("button:has-text('Cappuccino')").first().click();
    await page.locator("button:has-text('Espresso')").first().click(); // second espresso

    // Items are grouped: Espresso qty=2 shows "× 2.50€" once, total 5.00€
    await expect(page.getByText("× 2.50€")).toHaveCount(1);
    await expect(page.getByText("× 3.20€")).toHaveCount(1);
    await expect(page.getByText("5.00€")).toBeVisible();
    await expect(page.getByText("8.20€")).toBeVisible();

    // Print combined receipt (final + pickups)
    await page.getByRole("button", { name: "Print", exact: true }).click();

    // Pay and close
    await page.getByRole("button", { name: "Pay & Close" }).click();

    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });
  });

  test("cancel an open order", async ({ page }) => {
    await page.getByRole("button", { name: terminalName }).click();
    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });

    // Tapping an item auto-creates the order
    await page.locator("button:has-text('Espresso')").first().click();
    await expect(page.getByText(/Order #/)).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });
  });

  test("open order survives page reload", async ({ page }) => {
    await page.getByRole("button", { name: terminalName }).click();
    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });

    // Start an order by tapping an item
    await page.locator("button:has-text('Espresso')").first().click();
    await expect(page.getByText(/Order #/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Espresso")).toHaveCount(2); // one in grid, one in order panel

    // Reload the page (stays on /pos/:terminalId, order should rehydrate)
    await page.reload();
    await page.waitForTimeout(2000); // let projections catch up

    await expect(page.getByText(/Order #/)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Espresso")).toHaveCount(2); // should still have item

    // Pay and close
    await page.getByRole("button", { name: "Pay & Close" }).click();
    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });
  });

  test("exit POS returns to start page", async ({ page }) => {
    await page.getByRole("button", { name: terminalName }).click();
    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Exit" }).click();
    await expect(page.getByText("POS System")).toBeVisible({ timeout: 5000 });
  });
});
