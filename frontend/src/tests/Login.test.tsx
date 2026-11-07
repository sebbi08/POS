import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "../views/Login";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../api/client", () => ({
  api: {
    get: vi.fn().mockResolvedValue([
      { id: "t1", name: "Bar", groupIds: ["g1"] },
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

  it("shows the PIN entry directly, without terminal buttons", async () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByText("Admin Login")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.queryByText("Admin Panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Bar")).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows PIN dots as digits are entered", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Login /></MemoryRouter>);

    await user.click(screen.getByText("1"));
    await user.click(screen.getByText("2"));
    await user.click(screen.getByText("3"));
    await user.click(screen.getByText("4"));

    const dots = document.querySelectorAll(".bg-blue-400");
    expect(dots).toHaveLength(4);
  });

  it("logs in with correct admin PIN and navigates to /admin", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValueOnce({ role: "admin" });

    render(<MemoryRouter><Login /></MemoryRouter>);

    await user.click(screen.getByText("0"));
    await user.click(screen.getByText("0"));
    await user.click(screen.getByText("0"));
    await user.click(screen.getByText("0"));
    fireEvent.click(screen.getByText("Login"));

    await waitFor(() => {
      expect(api.setAdminPin).toHaveBeenCalledWith("0000");
      expect(mockNavigate).toHaveBeenCalledWith("/admin");
    });
  });

  it("shows error on wrong admin PIN", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValueOnce(new Error("Invalid PIN"));

    render(<MemoryRouter><Login /></MemoryRouter>);

    await user.click(screen.getByText("1"));
    await user.click(screen.getByText("2"));
    await user.click(screen.getByText("3"));
    await user.click(screen.getByText("4"));
    fireEvent.click(screen.getByText("Login"));

    await waitFor(() => {
      expect(screen.getByText("Invalid PIN")).toBeInTheDocument();
    });
  });
});
