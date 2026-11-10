import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TouchDialog } from "./touch-dialog";

function renderDialog(props: { escapeCloses?: boolean } = {}) {
  const onClose = vi.fn();
  const view = render(
    <TouchDialog title="Bezahlen" onClose={onClose} {...props}>
      <button type="button">Passend</button>
    </TouchDialog>,
  );
  return { onClose, ...view };
}

describe("TouchDialog", () => {
  it("is a modal dialog named by its title", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Bezahlen" })).toHaveAttribute("aria-modal", "true");
  });

  it("focuses the dialog itself, not the first button", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Bezahlen" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Passend" })).not.toHaveFocus();
  });

  it("a tap outside does not close", async () => {
    const { onClose } = renderDialog();
    // Radix starts listening for outside pointer-downs one tick after opening,
    // and a dialog only dismisses on the click that follows the pointer-down.
    const tick = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    await tick();
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    for (const target of [overlay!, document.body]) {
      fireEvent.pointerDown(target);
      fireEvent.click(target);
      await tick();
    }
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Bezahlen" })).toBeInTheDocument();
  });

  it("Escape does not close by default", () => {
    const { onClose } = renderDialog();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape closes with escapeCloses", () => {
    const { onClose } = renderDialog({ escapeCloses: true });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("unmounting leaves the page tappable", () => {
    const { unmount } = renderDialog();
    expect(document.body.style.pointerEvents).toBe("none");
    unmount();
    expect(document.body.style.pointerEvents).toBe("");
  });
});
