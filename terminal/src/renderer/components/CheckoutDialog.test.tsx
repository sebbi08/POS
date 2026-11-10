import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import CheckoutDialog from "./CheckoutDialog";

/** Opens the dialog for an order of 7,50 €. */
function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(<CheckoutDialog total={7.5} onConfirm={onConfirm} onCancel={onCancel} />);
  const dialog = screen.getByRole("dialog", { name: "Bezahlen" });
  const tap = (...names: (string | RegExp)[]) => {
    for (const name of names) fireEvent.click(within(dialog).getByRole("button", { name }));
  };
  const given = () => within(dialog).getByLabelText("Gegeben").textContent;
  const change = () => within(dialog).getByText("Rückgeld").parentElement;
  return { onConfirm, onCancel, dialog, tap, given, change };
}

describe("CheckoutDialog", () => {
  it("has no text field, so no on-screen keyboard opens", () => {
    const { dialog } = renderDialog();
    expect(dialog.querySelector("input, textarea, [contenteditable]")).toBeNull();
  });

  it("takes the focus, so nothing behind it receives keystrokes", () => {
    const { dialog } = renderDialog();
    expect(dialog).toHaveFocus();
  });

  it("shows no change before anything is entered", () => {
    const { given, change } = renderDialog();
    expect(given()).toBe("");
    expect(change()).toHaveTextContent("–");
  });

  it("tapped digits give the change", () => {
    const { tap, given, change } = renderDialog();
    tap("1", "0");
    expect(given()).toBe("10");
    expect(change()).toHaveTextContent(/2,50\s€/);
  });

  it("a comma amount gives the change", () => {
    const { tap, given, change } = renderDialog();
    tap("1", "0", "Komma", "5");
    expect(given()).toBe("10,5");
    expect(change()).toHaveTextContent(/3,00\s€/);
  });

  it("too little says so", () => {
    const { tap, change } = renderDialog();
    tap("5");
    expect(change()).toHaveTextContent("Betrag reicht nicht");
  });

  it("Passend shows the total on the button and enters it", () => {
    const { tap, given, change } = renderDialog();
    tap(/^Passend \(7,50\s€\)$/);
    expect(given()).toBe("7,50");
    expect(change()).toHaveTextContent(/0,00\s€/);
  });

  it("a note button replaces the amount instead of adding to it", () => {
    const { tap, given, change } = renderDialog();
    tap("2", "20 €");
    expect(given()).toBe("20");
    expect(change()).toHaveTextContent(/12,50\s€/);
    tap("50 €");
    expect(given()).toBe("50");
    expect(change()).toHaveTextContent(/42,50\s€/);
  });

  it("offers 5, 10, 20 and 50 € notes", () => {
    const { tap, given } = renderDialog();
    for (const [note, want] of [["5 €", "5"], ["10 €", "10"], ["20 €", "20"], ["50 €", "50"]]) {
      tap(note);
      expect(given()).toBe(want);
    }
  });

  it("a digit after a note starts a new amount", () => {
    const { tap, given } = renderDialog();
    tap("50 €", "3", "0");
    expect(given()).toBe("30");
  });

  it("a comma after Passend starts a new amount", () => {
    const { tap, given } = renderDialog();
    tap(/^Passend/, "Komma", "5");
    expect(given()).toBe("0,5");
  });

  it("backspace after a note edits it", () => {
    const { tap, given } = renderDialog();
    tap("20 €", "Letzte Ziffer löschen", "5");
    expect(given()).toBe("25");
  });

  it("a hardware keyboard works too", () => {
    const { given } = renderDialog();
    for (const key of ["1", "2", ".", "5"]) fireEvent.keyDown(document, { key });
    expect(given()).toBe("12,5");
  });

  it("Abschließen & Drucken confirms, Abbrechen cancels", () => {
    const { onConfirm, onCancel, tap } = renderDialog();
    tap("Abschließen & Drucken");
    expect(onConfirm).toHaveBeenCalledOnce();
    tap("Abbrechen");
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
