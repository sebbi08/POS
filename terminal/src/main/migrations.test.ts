import { describe, expect, it } from "vitest";
import { CURRENT_FORMAT, FormatTooNewError, MIGRATIONS } from "./migrations";

describe("migrations", () => {
  it("starts at format 1 with an empty chain", () => {
    expect(CURRENT_FORMAT).toBe(1);
    expect(MIGRATIONS).toEqual([]);
  });

  it("FormatTooNewError carries the user-facing message", () => {
    const err = new FormatTooNewError();
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Lokale Daten stammen von einer neueren Version – bitte aktuelle Version installieren");
  });
});
