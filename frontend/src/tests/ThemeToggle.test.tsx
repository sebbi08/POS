import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import ThemeToggle from "../components/ThemeToggle";
import { useThemePreference } from "../lib/theme";

afterEach(() => {
  const { result } = renderHook(() => useThemePreference());
  act(() => result.current[1]("system"));
  localStorage.clear();
  document.documentElement.className = "";
});

describe("ThemeToggle", () => {
  it("shows the three options with System active by default and switches", async () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("group", { name: "Darstellung" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hell" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "Hell" }));
    expect(screen.getByRole("button", { name: "Hell" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem("pos-theme")).toBe("light");
  });
});
