import { getKmipServerAltNameType, kmipServerHostnamesOrIpsField } from "./kmip-fns";

describe("getKmipServerAltNameType", () => {
  test.each([
    ["kmip.example.com", "dns"],
    ["localhost", "dns"],
    ["*.kmip.example.com", "dns"],
    ["10.0.0.1", "ip"],
    ["::1", "ip"],
    ["admin@example.com", null],
    ["https://kmip.example.com", null],
    ["", null]
  ])("%s is %s", (altName, expected) => {
    expect(getKmipServerAltNameType(altName)).toBe(expected);
  });
});

describe("kmipServerHostnamesOrIpsField", () => {
  test("normalises the separators and accepts names a certificate can carry", () => {
    expect(kmipServerHostnamesOrIpsField.parse(" localhost ,10.0.0.1,kmip.example.com ")).toBe(
      "localhost, 10.0.0.1, kmip.example.com"
    );
  });

  test("rejects a list longer than the 4096-character columns it is stored in", () => {
    const longList = Array.from({ length: 300 }, (_, i) => `kmip-${i}.example.com`).join(",");
    expect(kmipServerHostnamesOrIpsField.safeParse(longList).success).toBe(false);
  });

  test("rejects an entry a certificate cannot carry", () => {
    expect(kmipServerHostnamesOrIpsField.safeParse("kmip.example.com, admin@example.com").success).toBe(false);
  });
});
