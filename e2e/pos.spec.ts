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

    await expect(page.getByRole("button", { name: "New Order" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("No open order")).toBeVisible();
  });

  test("POS terminal shows assigned items", async ({ page }) => {
    await page.getByRole("button", { name: terminalName }).click();
    await expect(page.getByRole("button", { name: "New Order" })).toBeVisible({ timeout: 5000 });

    await expect(page.getByText("Espresso")).toBeVisible();
    await expect(page.getByText("2.50€")).toBeVisible();
    await expect(page.getByText("Cappuccino")).toBeVisible();
    await expect(page.getByText("3.20€")).toBeVisible();
  });

  test("complete order flow: new order → add items → pay & close", async ({ page }) => {
    await page.getByRole("button", { name: terminalName }).click();
    await expect(page.getByRole("button", { name: "New Order" })).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "New Order" }).click();
    await expect(page.getByText(/Order #/)).toBeVisible({ timeout: 5000 });

    // Click Espresso (first button in the item grid, not order panel)
    await page.locator("button:has-text('Espresso')").first().click();
    await page.locator("button:has-text('Cappuccino')").first().click();
    await page.locator("button:has-text('Espresso')").first().click(); // second espresso

    await expect(page.getByText("2× 2.50€")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("1× 3.20€")).toBeVisible();
    await expect(page.getByText("8.20€")).toBeVisible();

    // Print pickup receipt for espresso
    await page.locator("button:has-text('Pickup')").first().click();

    // Pay and close
    await page.getByRole("button", { name: "Pay & Close" }).click();

    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });
  });

  test("cancel an open order", async ({ page }) => {
    await page.getByRole("button", { name: terminalName }).click();
    await expect(page.getByRole("button", { name: "New Order" })).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "New Order" }).click();
    await expect(page.getByText(/Order #/)).toBeVisible({ timeout: 5000 });

    await page.locator("button:has-text('Espresso')").first().click();
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByText("No open order")).toBeVisible({ timeout: 5000 });
  });

  test("exit POS returns to start page", async ({ page }) => {
    await page.getByRole("button", { name: terminalName }).click();
    await expect(page.getByRole("button", { name: "New Order" })).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Exit" }).click();
    await expect(page.getByText("POS System")).toBeVisible({ timeout: 5000 });
  });
});
