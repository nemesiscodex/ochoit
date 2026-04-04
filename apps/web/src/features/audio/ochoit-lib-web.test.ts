import { describe, expect, it } from "vitest";
import { ochoit } from "ochoit-lib/web";

describe("ochoit-lib/web", () => {
  it("exports the global audio start helper", () => {
    expect(typeof ochoit).toBe("function");
    expect(typeof ochoit.start).toBe("function");
    expect(typeof ochoit.voice).toBe("function");
  });
});
