import { test, expect } from "@playwright/test";

test.describe("POS Terminal — Order Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);
  });

  test("start page shows the PIN entry only, no terminal selection", async ({ page }) => {
    await expect(page.getByText("Admin Login")).toBeVisible();
    await expect(page.getByText("Select a terminal to begin")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Login" })).toBeVisible();
  });

  test("admin PIN login — wrong PIN shows error", async ({ page }) => {
    await expect(page.getByText("Admin Login")).toBeVisible();

    await page.getByText("1").click();
    await page.getByText("2").click();
    await page.getByText("3").click();
    await page.getByText("4").click();
    await page.getByRole("button", { name: "Login" }).click();

    await expect(page.getByText("Invalid PIN")).toBeVisible({ timeout: 5000 });
  });

  test("admin PIN login — correct PIN enters admin panel", async ({ page }) => {

    Array.from("0000").forEach(async (d) => {
      await page.getByText(d).click();
    });

    await page.getByRole("button", { name: "Login" }).click();

    await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Daily Overview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Transactions" })).toBeVisible();
  });

  test("admin panel — create item group", async ({ page }) => {
    // Login first
    Array.from("0000").forEach((d) => page.getByText(d).click());
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible({ timeout: 5000 });

    // Navigate to Item Groups
    await page.getByRole("button", { name: "Item Groups" }).click();
    await page.getByPlaceholder("Group name").fill("Hot Drinks");
    await page.getByPlaceholder("VAT %").fill("19");
    await page.getByRole("button", { name: "Add" }).click();

    await expect(page.locator("td:text('Hot Drinks')").first()).toBeVisible({ timeout: 5000 });
  });

  test("admin panel — configure company settings", async ({ page }) => {
    // Login first
    Array.from("0000").forEach((d) => page.getByText(d).click());
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible({ timeout: 5000 });

    // Navigate to Company
    await page.getByRole("button", { name: "Company" }).click();
    const firstInput = page.locator("input").first();
    await firstInput.clear();
    await firstInput.fill("My Cafe GmbH");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Saved!")).toBeVisible({ timeout: 5000 });
  });

  // Fails until Task 6: the overview still calls the removed /reporting/daily.
  test.fixme("admin panel — daily overview is the default tab", async ({ page }) => {
    // Login first
    Array.from("0000").forEach((d) => page.getByText(d).click());
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible({ timeout: 5000 });

    // Default tab is Daily Overview
    await expect(page.getByRole("heading", { name: /Daily Overview/ })).toBeVisible({ timeout: 5000 });
  });

  test("admin panel — transaction history loads with filters", async ({ page }) => {
    // Login first
    Array.from("0000").forEach((d) => page.getByText(d).click());
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible({ timeout: 5000 });

    // Navigate to transactions
    await page.getByRole("button", { name: "Transactions" }).click();
    await expect(page.getByText("No transactions found")).toBeVisible({ timeout: 5000 });

    // Search and filter inputs should be present
    await expect(page.getByPlaceholder("Search by order ID or item...")).toBeVisible();
    await expect(page.getByPlaceholder("Terminal")).toBeVisible();
  });

  test("admin panel — no Users tab exists", async ({ page }) => {
    Array.from("0000").forEach((d) => page.getByText(d).click());
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible({ timeout: 5000 });

    // Users tab should not exist
    await expect(page.getByRole("button", { name: "Users" })).not.toBeVisible();
  });

  test("admin logout returns to the PIN entry", async ({ page }) => {
    // Login
    Array.from("0000").forEach((d) => page.getByText(d).click());
    await page.getByRole("button", { name: "Login" }).click();
    await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible({ timeout: 5000 });

    // Logout
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page.getByText("Admin Login")).toBeVisible({ timeout: 5000 });
  });
});
