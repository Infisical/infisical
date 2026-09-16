import { isIloPrompt } from "./hp-ilo-rotation-fns";

describe("isIloPrompt", () => {
  test("matches the iLO 5/6 prompt", () => {
    expect(isIloPrompt("</>hpiLO-> ")).toBe(true);
  });

  test("matches the iLO 7 prompt", () => {
    expect(isIloPrompt("</>hpeiLO-> ")).toBe(true);
  });

  test("does not match banner or password prompt output", () => {
    expect(isIloPrompt("Integrated Lights-Out 7\n")).toBe(false);
    expect(isIloPrompt("Password: ")).toBe(false);
  });
});
