import { afterEach, describe, expect, it, vi } from "vitest";
import { UsbChooser } from "./usb";

const devices = [{ deviceId: "d1", productName: "P", vendorId: 1, productId: 2, extra: "x" }];

describe("UsbChooser", () => {
  it("sends the device list to the renderer and resolves with the chosen id", () => {
    const send = vi.fn();
    const cb = vi.fn();
    const chooser = new UsbChooser();
    chooser.request(devices as never, send, cb);
    expect(send).toHaveBeenCalledWith([{ deviceId: "d1", productName: "P", vendorId: 1, productId: 2 }]);
    chooser.chosen("d1");
    expect(cb).toHaveBeenCalledWith("d1");
  });

  it("cancels with no argument when the renderer answers null", () => {
    const cb = vi.fn();
    const chooser = new UsbChooser();
    chooser.request(devices as never, vi.fn(), cb);
    chooser.chosen(null);
    expect(cb).toHaveBeenCalledWith();
  });

  it("cancels at once when there is no window to ask", () => {
    const cb = vi.fn();
    new UsbChooser().request(devices as never, null, cb);
    expect(cb).toHaveBeenCalledWith();
  });

  it("cancels a pending request when a new one arrives and answers only once", () => {
    const first = vi.fn();
    const second = vi.fn();
    const chooser = new UsbChooser();
    chooser.request(devices as never, vi.fn(), first);
    chooser.request(devices as never, vi.fn(), second);
    expect(first).toHaveBeenCalledWith();
    chooser.chosen("d1");
    chooser.chosen("d1");
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith("d1");
  });

  afterEach(() => { vi.useRealTimers(); });

  it("cancels and disposes when sending throws", () => {
    const cb = vi.fn();
    const dispose = vi.fn();
    const chooser = new UsbChooser();
    chooser.request(devices as never, () => { throw new Error("destroyed"); }, cb, dispose);
    expect(cb).toHaveBeenCalledWith();
    expect(dispose).toHaveBeenCalledTimes(1);
    chooser.chosen("d1");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("settles with cancel after the timeout", () => {
    vi.useFakeTimers();
    const cb = vi.fn();
    const dispose = vi.fn();
    new UsbChooser(60_000).request(devices as never, vi.fn(), cb, dispose);
    vi.advanceTimersByTime(59_999);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledWith();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("cancel() settles a pending request", () => {
    const cb = vi.fn();
    const chooser = new UsbChooser();
    chooser.request(devices as never, vi.fn(), cb);
    chooser.cancel();
    expect(cb).toHaveBeenCalledWith();
  });
});
