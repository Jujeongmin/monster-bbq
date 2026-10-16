import { describe, expect, it } from "vitest";
import { BALANCE } from "../../../shared/balance";
import { clockText } from "./types";

describe("clockText", () => {
  it("shows the shop clock from 18:00 to 22:00 in ten-minute steps", () => {
    expect(clockText(0)).toBe("18:00");
    expect(clockText(BALANCE.service.openMs / 2)).toBe("20:00");
    expect(clockText(BALANCE.service.openMs)).toBe("22:00");
    expect(clockText(BALANCE.service.openMs * 2)).toBe("22:00");
  });
});
