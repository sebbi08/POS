import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TerminalSettings } from "../../shared/types";
import SettingsDialog from "./SettingsDialog";

/** Saved before light mode existed: no `theme` field. */
const base: TerminalSettings = {
  serverUrl: "https://kasse.example", terminalId: "t1", terminalKey: "key-1",
  changeCalculator: false, printer: null, paperWidth: "80", lastCatalogFetchAt: null, clockSkewMs: null,
};

function renderDialog(settings: TerminalSettings, onSave = vi.fn()) {
  render(
    <SettingsDialog settings={settings} hasOpenOrder={false} syncing={false} onSave={onSave} onResetup={vi.fn()} onClose={vi.fn()} />,
  );
  return onSave;
}

describe("SettingsDialog theme", () => {
  it("shows System active when no theme is stored", () => {
    renderDialog(base);
    expect(screen.getByRole("group", { name: "Darstellung" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hell" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Dunkel" })).toHaveAttribute("aria-pressed", "false");
  });

  it("marks the stored theme as active", () => {
    renderDialog({ ...base, theme: "light" });
    expect(screen.getByRole("button", { name: "Hell" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "false");
  });

  it("saves the chosen theme as a patch", () => {
    const onSave = renderDialog(base);
    fireEvent.click(screen.getByRole("button", { name: "Dunkel" }));
    expect(onSave).toHaveBeenCalledWith({ theme: "dark" });
  });

  it("theme buttons are touch sized", () => {
    renderDialog(base);
    for (const name of ["System", "Hell", "Dunkel"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("min-h-12");
    }
  });
});
