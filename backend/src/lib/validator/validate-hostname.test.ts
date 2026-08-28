import { HOSTNAME_MAX_LENGTH, isValidHostname } from "./validate-hostname";

describe("isValidHostname", () => {
  test.each([
    ["server01", true],
    ["server01.corp.example.com", true],
    ["EC2AMAZ-8V4780K.corp.example.com", true],
    ["10.0.0.5", true],
    ["a", true],
    ["1corp.example.com", true],
    ["corp-1.example.com", true]
  ])("accepts %s", (value, expected) => {
    expect(isValidHostname(value)).toBe(expected);
  });

  test.each([
    ["", false],
    ["-leading.example.com", false],
    ["trailing-.example.com", false],
    ["under_score.example.com", false],
    ["server01.corp.example.com:5986", false],
    ["has space", false],
    ["fe80::1", false],
    ["corp..example.com", false]
  ])("rejects %s", (value, expected) => {
    expect(isValidHostname(value)).toBe(expected);
  });

  test("caps the total length", () => {
    const label = "a".repeat(61);
    const long = [label, label, label, label, label].join(".");
    expect(long.length).toBeGreaterThan(HOSTNAME_MAX_LENGTH);
    expect(isValidHostname(long)).toBe(false);
    expect(isValidHostname(`${label}.${label}.${label}`)).toBe(true);
  });
});
