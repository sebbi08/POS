import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DateRangePicker from "../components/DateRangePicker";

vi.mock("../api/client", () => ({
  api: { get: vi.fn() },
}));

import { api } from "../api/client";

const bookingDays = [
  { day: "2026-07-10", orderCount: 212 },
  { day: "2026-07-11", orderCount: 534 },
  { day: "2026-07-12", orderCount: 298 },
  { day: "2026-06-06", orderCount: 87 },
];

function renderPicker(from = "2026-07-12", to = "2026-07-12") {
  const onChange = vi.fn();
  render(<DateRangePicker from={from} to={to} onChange={onChange} />);
  return { onChange, user: userEvent.setup() };
}

const trigger = () => screen.getByRole("button", { name: /^Zeitraum: / });
const day = (label: string) => screen.getByRole("button", { name: new RegExp(`^\\S+, ${label}`) });
const listHeading = () => screen.queryByText("Letzte Buchungstage");

describe("DateRangePicker", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.get).mockResolvedValue(bookingDays as never);
  });

  it("trigger shows the range", () => {
    const { unmount } = render(<DateRangePicker from="2026-07-12" to="2026-07-12" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Zeitraum: 12.07.2026" })).toHaveTextContent("12.07.2026");
    unmount();
    render(<DateRangePicker from="2026-07-10" to="2026-07-12" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Zeitraum: 10.07. – 12.07.2026" })).toBeInTheDocument();
  });

  it("shows booking counts on days", async () => {
    const { user } = renderPicker();
    await user.click(trigger());
    expect(await screen.findByRole("button", { name: /^\S+, 11\. Juli 2026, 534 Buchungen$/ })).toHaveTextContent("534");
    expect(day("13\\. Juli 2026").getAttribute("aria-label")).toBe("Montag, 13. Juli 2026");
  });

  it("opens on the month of from", async () => {
    const { user } = renderPicker();
    await user.click(trigger());
    expect(screen.getByRole("grid", { name: /Juli 2026/ })).toBeInTheDocument();
    expect(screen.getByText("Juli 2026")).toBeInTheDocument();
  });

  it("festival click selects the whole festival", async () => {
    const { onChange, user } = renderPicker();
    await user.click(trigger());
    await user.click(await screen.findByRole("button", { name: "10.–12. Juli 2026, 1.044 Buchungen" }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({ from: "2026-07-10", to: "2026-07-12" });
    await waitFor(() => expect(listHeading()).not.toBeInTheDocument());
  });

  it("two day clicks select a range", async () => {
    const { onChange, user } = renderPicker();
    await user.click(trigger());
    await user.click(day("13\\. Juli 2026"));
    expect(onChange).not.toHaveBeenCalled();
    await user.click(day("15\\. Juli 2026"));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({ from: "2026-07-13", to: "2026-07-15" });
    await waitFor(() => expect(listHeading()).not.toBeInTheDocument());
  });

  it("reversed clicks are swapped", async () => {
    const { onChange, user } = renderPicker();
    await user.click(trigger());
    await user.click(day("15\\. Juli 2026"));
    await user.click(day("13\\. Juli 2026"));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-07-13", to: "2026-07-15" });
  });

  it("same day twice selects one day", async () => {
    const { onChange, user } = renderPicker();
    await user.click(trigger());
    await user.click(day("13\\. Juli 2026"));
    await user.click(day("13\\. Juli 2026"));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-07-13", to: "2026-07-13" });
  });

  it("a new selection ignores the current range", async () => {
    const { onChange, user } = renderPicker("2026-07-10", "2026-07-12");
    await user.click(trigger());
    await user.click(day("20\\. Juli 2026"));
    await user.click(day("22\\. Juli 2026"));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith({ from: "2026-07-20", to: "2026-07-22" });
  });

  it("closing after one click keeps the range", async () => {
    const { onChange, user } = renderPicker();
    await user.click(trigger());
    await user.click(day("13\\. Juli 2026"));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(listHeading()).not.toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
    // Reopening starts a fresh selection rather than completing the abandoned one.
    await user.click(trigger());
    await user.click(day("15\\. Juli 2026"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reloads counts on every open", async () => {
    const { user } = renderPicker();
    await user.click(trigger());
    await screen.findByRole("button", { name: /^\S+, 11\. Juli 2026, 534 Buchungen$/ });
    await user.keyboard("{Escape}");
    await waitFor(() => expect(listHeading()).not.toBeInTheDocument());
    await user.click(trigger());
    await screen.findByRole("button", { name: /^\S+, 11\. Juli 2026, 534 Buchungen$/ });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenNthCalledWith(1, "/reporting/booking-days");
    expect(api.get).toHaveBeenNthCalledWith(2, "/reporting/booking-days");
  });

  it("drops a slower earlier response", async () => {
    let resolveFirst: (days: unknown) => void = () => {};
    vi.mocked(api.get)
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }) as never)
      .mockResolvedValueOnce([{ day: "2026-07-11", orderCount: 5 }] as never);
    const { user } = renderPicker();
    await user.click(trigger());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(listHeading()).not.toBeInTheDocument());
    await user.click(trigger());
    await screen.findByRole("button", { name: /^\S+, 11\. Juli 2026, 5 Buchungen$/ });
    resolveFirst(bookingDays);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole("button", { name: /^\S+, 11\. Juli 2026, 5 Buchungen$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /534 Buchungen/ })).not.toBeInTheDocument();
  });

  it("load error still allows picking", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("offline"));
    const { onChange, user } = renderPicker();
    await user.click(trigger());
    expect(await screen.findByText("Buchungszahlen konnten nicht geladen werden")).toBeInTheDocument();
    await user.click(day("13\\. Juli 2026"));
    await user.click(day("15\\. Juli 2026"));
    expect(onChange).toHaveBeenCalledWith({ from: "2026-07-13", to: "2026-07-15" });
  });

  it("empty list", async () => {
    vi.mocked(api.get).mockResolvedValue([] as never);
    const { user } = renderPicker();
    await user.click(trigger());
    expect(await screen.findByText("Noch keine Buchungen")).toBeInTheDocument();
  });
});
