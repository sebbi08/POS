import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Keypad from "./Keypad";

describe("Keypad", () => {
  it("tapping keys reports digit, comma and backspace", () => {
    const onKey = vi.fn();
    render(<Keypad onKey={onKey} extraKey="," />);
    fireEvent.click(screen.getByRole("button", { name: "7" }));
    fireEvent.click(screen.getByRole("button", { name: "0" }));
    fireEvent.click(screen.getByRole("button", { name: "Komma" }));
    fireEvent.click(screen.getByRole("button", { name: "Letzte Ziffer löschen" }));
    expect(onKey.mock.calls.map(([k]) => k)).toEqual(["7", "0", ",", "back"]);
  });

  it("has all ten digits", () => {
    render(<Keypad onKey={() => {}} extraKey="," />);
    for (const d of "0123456789") expect(screen.getByRole("button", { name: d })).toBeInTheDocument();
  });

  it("the PIN variant has a clear key instead of the comma", () => {
    const onKey = vi.fn();
    render(<Keypad onKey={onKey} extraKey="clear" />);
    expect(screen.queryByRole("button", { name: "Komma" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Alles löschen" }));
    expect(onKey).toHaveBeenCalledWith("clear");
  });

  it("keys are plain buttons, so tapping them submits no form", () => {
    render(<Keypad onKey={() => {}} extraKey="," />);
    for (const b of screen.getAllByRole("button")) expect(b).toHaveAttribute("type", "button");
  });

  it("a hardware keyboard works too", () => {
    const onKey = vi.fn();
    render(<Keypad onKey={onKey} extraKey="," />);
    for (const key of ["4", ",", ".", "Backspace", "a", "Enter"]) fireEvent.keyDown(document, { key });
    expect(onKey.mock.calls.map(([k]) => k)).toEqual(["4", ",", ",", "back"]);
  });

  it("the PIN variant ignores comma and dot on the keyboard", () => {
    const onKey = vi.fn();
    render(<Keypad onKey={onKey} extraKey="clear" />);
    for (const key of ["1", ",", "."]) fireEvent.keyDown(document, { key });
    expect(onKey.mock.calls.map(([k]) => k)).toEqual(["1"]);
  });

  it("keyboard shortcuts with Ctrl are not taken as input", () => {
    const onKey = vi.fn();
    render(<Keypad onKey={onKey} extraKey="," />);
    fireEvent.keyDown(document, { key: "1", ctrlKey: true });
    expect(onKey).not.toHaveBeenCalled();
  });

  it("stops listening to the keyboard once removed", () => {
    const onKey = vi.fn();
    const { unmount } = render(<Keypad onKey={onKey} extraKey="," />);
    unmount();
    fireEvent.keyDown(document, { key: "1" });
    expect(onKey).not.toHaveBeenCalled();
  });
});
