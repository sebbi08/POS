import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import PinDialog from "./PinDialog";

function renderDialog() {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(<PinDialog onSubmit={onSubmit} onCancel={onCancel} />);
  const dialog = screen.getByRole("dialog", { name: "Admin-PIN" });
  const tap = (...names: string[]) => {
    for (const name of names) fireEvent.click(within(dialog).getByRole("button", { name }));
  };
  const shown = () => within(dialog).getByLabelText("Eingegebene PIN").textContent;
  return { onSubmit, onCancel, dialog, tap, shown };
}

describe("PinDialog", () => {
  it("is a modal dialog", () => {
    const { dialog } = renderDialog();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("has no text field, so no on-screen keyboard opens", () => {
    const { dialog } = renderDialog();
    expect(dialog.querySelector("input, textarea, [contenteditable]")).toBeNull();
  });

  it("takes the focus, so nothing behind it receives keystrokes", () => {
    const { dialog } = renderDialog();
    expect(dialog).toHaveFocus();
  });

  it("tapping digits and OK submits the PIN", () => {
    const { onSubmit, tap } = renderDialog();
    tap("0", "7", "3", "1", "OK");
    expect(onSubmit).toHaveBeenCalledWith("0731");
  });

  it("shows a dot per digit, never the digits", () => {
    const { tap, shown } = renderDialog();
    tap("4", "8", "1");
    expect(shown()).toBe("●●●");
  });

  it("OK is disabled until a digit is entered", () => {
    const { dialog, tap } = renderDialog();
    const ok = within(dialog).getByRole("button", { name: "OK" });
    expect(ok).toBeDisabled();
    tap("1");
    expect(ok).toBeEnabled();
  });

  it("backspace removes the last digit, C clears all", () => {
    const { onSubmit, tap, shown } = renderDialog();
    tap("1", "2", "3", "Letzte Ziffer löschen");
    expect(shown()).toBe("●●");
    tap("Alles löschen");
    expect(shown()).toBe("");
    tap("9", "OK");
    expect(onSubmit).toHaveBeenCalledWith("9");
  });

  it("digits and Enter on a hardware keyboard submit", () => {
    const { onSubmit } = renderDialog();
    for (const key of ["5", "6", "Enter"]) fireEvent.keyDown(document, { key });
    expect(onSubmit).toHaveBeenCalledWith("56");
  });

  it("Enter without a PIN submits nothing", () => {
    const { onSubmit } = renderDialog();
    fireEvent.keyDown(document, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Escape cancels", () => {
    const { onCancel, onSubmit, tap } = renderDialog();
    tap("1", "2");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("other keys do not cancel", () => {
    const { onCancel } = renderDialog();
    fireEvent.keyDown(document, { key: "1" });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Abbrechen cancels", () => {
    const { onCancel, tap } = renderDialog();
    tap("Abbrechen");
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
