import { test, expect } from "@playwright/test";

test.describe("Admin — Anmeldung und Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForTimeout(1000);
  });

  test("start page shows the PIN entry only, no terminal selection", async ({ page }) => {
    await expect(page.getByText("Administrator-Anmeldung")).toBeVisible();
    await expect(page.getByText("Terminal auswählen")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
  });

  test("admin PIN login — wrong PIN shows error", async ({ page }) => {
    await expect(page.getByText("Administrator-Anmeldung")).toBeVisible();

    await page.getByText("1").click();
    await page.getByText("2").click();
    await page.getByText("3").click();
    await page.getByText("4").click();
    await page.getByRole("button", { name: "Anmelden" }).click();

    await expect(page.getByText("Ungültige PIN")).toBeVisible({ timeout: 5000 });
  });

  test("admin PIN login — correct PIN enters admin panel", async ({ page }) => {

    Array.from("0000").forEach(async (d) => {
      await page.getByText(d).click();
    });

    await page.getByRole("button", { name: "Anmelden" }).click();

    await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Auswertung" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Buchungen" })).toBeVisible();
  });

  test("admin panel — create item group", async ({ page }) => {
    // Login first
    Array.from("0000").forEach((d) => page.getByText(d).click());
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible({ timeout: 5000 });

    // Navigate to Item Groups
    await page.getByRole("button", { name: "Warengruppen" }).click();
    await page.getByPlaceholder("Name der Warengruppe").fill("Hot Drinks");
    await page.getByPlaceholder("MwSt. %").fill("19");
    await page.getByRole("button", { name: "Hinzufügen" }).click();

    await expect(page.locator("td:text('Hot Drinks')").first()).toBeVisible({ timeout: 5000 });
  });

  test("admin panel — configure company settings", async ({ page }) => {
    // Login first
    Array.from("0000").forEach((d) => page.getByText(d).click());
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible({ timeout: 5000 });

    // Navigate to Company
    await page.getByRole("button", { name: "Firmendaten" }).click();
    const firstInput = page.locator("input").first();
    await firstInput.clear();
    await firstInput.fill("My Cafe GmbH");
    await page.getByRole("button", { name: "Speichern" }).click();

    await expect(page.getByText("Gespeichert!")).toBeVisible({ timeout: 5000 });
  });

  test("admin panel — Auswertung is the default tab", async ({ page }) => {
    // Login first
    Array.from("0000").forEach((d) => page.getByText(d).click());
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible({ timeout: 5000 });

    // Default tab is Auswertung; the range defaults to a single day (today)
    await expect(page.getByRole("heading", { name: "Auswertung" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: /^Zeitraum: \d{2}\.\d{2}\.\d{4}$/ })).toBeVisible();
  });

  test("admin panel — transaction history loads with filters", async ({ page }) => {
    // Login first
    Array.from("0000").forEach((d) => page.getByText(d).click());
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible({ timeout: 5000 });

    // Navigate to transactions
    await page.getByRole("button", { name: "Buchungen" }).click();
    await expect(page.getByRole("heading", { name: "Buchungen" })).toBeVisible({ timeout: 5000 });

    // Search and filter inputs should be present
    await expect(page.getByPlaceholder("Suche nach Buchung oder Artikel...")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Zeitraum: \d{2}\.\d{2}\.\d{4}$/ })).toBeVisible();
  });

  test("admin panel — no Users tab exists", async ({ page }) => {
    Array.from("0000").forEach((d) => page.getByText(d).click());
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible({ timeout: 5000 });

    // Users tab should not exist
    await expect(page.getByRole("button", { name: "Users" })).not.toBeVisible();
  });

  test("admin logout returns to the PIN entry", async ({ page }) => {
    // Login
    Array.from("0000").forEach((d) => page.getByText(d).click());
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible({ timeout: 5000 });

    // Logout
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page.getByText("Administrator-Anmeldung")).toBeVisible({ timeout: 5000 });
  });
});
