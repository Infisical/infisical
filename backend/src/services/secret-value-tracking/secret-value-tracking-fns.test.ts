import { needsBackfill } from "./secret-value-tracking-fns";

describe("needsBackfill", () => {
  test("a row missing the org digest needs work", () => {
    expect(
      needsBackfill({ secretValueBlindIndex: "abc", secretValueOrgBlindIndex: null, encryptedValue: Buffer.from("x") })
    ).toBe(true);
  });

  test("a row missing the project digest needs work", () => {
    expect(
      needsBackfill({ secretValueBlindIndex: null, secretValueOrgBlindIndex: "abc", encryptedValue: Buffer.from("x") })
    ).toBe(true);
  });

  test("a row with both digests is skipped", () => {
    expect(
      needsBackfill({ secretValueBlindIndex: "a", secretValueOrgBlindIndex: "b", encryptedValue: Buffer.from("x") })
    ).toBe(false);
  });

  test("a row with no encrypted value is skipped even when digests are missing", () => {
    expect(needsBackfill({ secretValueBlindIndex: null, secretValueOrgBlindIndex: null, encryptedValue: null })).toBe(
      false
    );
  });
});
