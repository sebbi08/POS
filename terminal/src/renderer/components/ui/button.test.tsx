import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("default size is touch-sized", () => {
    render(<Button>OK</Button>);
    expect(screen.getByRole("button", { name: "OK" })).toHaveClass("min-h-12", "min-w-12");
  });
});
