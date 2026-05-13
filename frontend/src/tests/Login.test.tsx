import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "../views/Login";

vi.mock("../api/client", () => ({
  api: {
    get: vi.fn().mockResolvedValue([
      { id: "t1", name: "Bar", groupIds: ["g1"] },
      { id: "t2", name: "Kitchen", groupIds: ["g2"] },
    ]),
    post: vi.fn(),
    setAdminPin: vi.fn(),
  },
}));

import { api } from "../api/client";

describe("Login Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows terminal buttons after loading", async () => {
    render(<Login onEnterPOS={vi.fn()} onEnterAdmin={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("Bar")).toBeInTheDocument();
      expect(screen.getByText("Kitchen")).toBeInTheDocument();
    });
  });

  it("calls onEnterPOS when terminal is clicked", async () => {
    const onEnterPOS = vi.fn();
    render(<Login onEnterPOS={onEnterPOS} onEnterAdmin={vi.fn()} />);
    await waitFor(() => screen.getByText("Bar"));
    fireEvent.click(screen.getByText("Bar"));
    expect(onEnterPOS).toHaveBeenCalledWith("t1", "Bar");
  });

  it("shows PIN pad when Admin Panel button is clicked", async () => {
    render(<Login onEnterPOS={vi.fn()} onEnterAdmin={vi.fn()} />);
    await waitFor(() => screen.getByText("Bar"));
    fireEvent.click(screen.getByText("Admin Panel"));
    expect(screen.getByText("Admin Login")).toBeInTheDocument();
  });

  it("shows PIN dots as digits are entered", async () => {
    const user = userEvent.setup();
    render(<Login onEnterPOS={vi.fn()} onEnterAdmin={vi.fn()} />);
    await waitFor(() => screen.getByText("Bar"));
    fireEvent.click(screen.getByText("Admin Panel"));

    await user.click(screen.getByText("1"));
    await user.click(screen.getByText("2"));
    await user.click(screen.getByText("3"));
    await user.click(screen.getByText("4"));

    const dots = document.querySelectorAll(".bg-blue-400");
    expect(dots).toHaveLength(4);
  });

  it("logs in with correct admin PIN", async () => {
    const onEnterAdmin = vi.fn();
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValueOnce({ role: "admin" });

    render(<Login onEnterPOS={vi.fn()} onEnterAdmin={onEnterAdmin} />);
    await waitFor(() => screen.getByText("Bar"));
    fireEvent.click(screen.getByText("Admin Panel"));

    await user.click(screen.getByText("0"));
    await user.click(screen.getByText("0"));
    await user.click(screen.getByText("0"));
    await user.click(screen.getByText("0"));
    fireEvent.click(screen.getByText("Login"));

    await waitFor(() => {
      expect(api.setAdminPin).toHaveBeenCalledWith("0000");
      expect(onEnterAdmin).toHaveBeenCalled();
    });
  });

  it("shows error on wrong admin PIN", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValueOnce(new Error("Invalid PIN"));

    render(<Login onEnterPOS={vi.fn()} onEnterAdmin={vi.fn()} />);
    await waitFor(() => screen.getByText("Bar"));
    fireEvent.click(screen.getByText("Admin Panel"));

    await user.click(screen.getByText("1"));
    await user.click(screen.getByText("2"));
    await user.click(screen.getByText("3"));
    await user.click(screen.getByText("4"));
    fireEvent.click(screen.getByText("Login"));

    await waitFor(() => {
      expect(screen.getByText("Invalid PIN")).toBeInTheDocument();
    });
  });

  it("Back button returns to terminal selection", async () => {
    render(<Login onEnterPOS={vi.fn()} onEnterAdmin={vi.fn()} />);
    await waitFor(() => screen.getByText("Bar"));
    fireEvent.click(screen.getByText("Admin Panel"));
    expect(screen.getByText("Admin Login")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Bar")).toBeInTheDocument();
  });
});
