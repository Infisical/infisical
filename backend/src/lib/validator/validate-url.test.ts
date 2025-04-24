import { isFQDN } from "./validate-url";

describe("isFQDN", () => {
  test("Non wildcard", () => {
    expect(isFQDN("www.example.com")).toBeTruthy();
  });

  test("Wildcard", () => {
    expect(isFQDN("*.example.com", { allow_wildcard: true })).toBeTruthy();
  });

  test("Wildcard FQDN fails on option allow_wildcard false", () => {
    expect(isFQDN("*.example.com")).toBeFalsy();
  });
});
