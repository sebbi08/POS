import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import PinDialog from "./PinDialog";

function renderDialog() {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(<PinDialog onSubmit={onSubmit} onCancel={onCancel} />);
  const dialog = screen.getByRole("dialog", { name: "Admin-PIN" });
  return { onSubmit, onCancel, dialog, input: within(dialog).getByLabelText("Admin-PIN") };
}

describe("PinDialog", () => {
  it("is a modal dialog", () => {
    const { dialog } = renderDialog();
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });

  it("Escape in the PIN field cancels", () => {
    const { onCancel, onSubmit, input } = renderDialog();
    fireEvent.change(input, { target: { value: "1234" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Escape cancels even when the focus has left the dialog", () => {
    const { onCancel } = renderDialog();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("other keys do not cancel", () => {
    const { onCancel, input } = renderDialog();
    fireEvent.keyDown(input, { key: "1" });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
