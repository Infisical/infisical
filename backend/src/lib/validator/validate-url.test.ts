import { isFQDN } from "./validate-url";
import { isURL } from "./validate-url";

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


describe("isURL", () => {
  test("Valid HTTPS URL with subdomain", () => {
    expect(isURL("https://sub.domain.example.com")).toBe(true);
  });

  test("Valid IPv6 host", () => {
    expect(isURL("http://[2001:db8::1]")).toBe(true);
  });

  test("Valid URL with query and fragment", () => {
    expect(isURL("https://example.com/path?query=value#fragment")).toBe(true);
  });

  test("Fails on missing protocol when required", () => {
    expect(isURL("example.com")).toBe(false);
  });

  test("Fails on invalid protocol", () => {
    expect(isURL("abcd://example.com")).toBe(false);
  });

  test("Fails on malformed IPv6 (missing brackets)", () => {
    expect(isURL("http://2001:db8::1")).toBe(false);
  });

  test("Fails on non-numeric port", () => {
    expect(isURL("http://example.com:abc")).toBe(false);
  });

  test("Fails on port out of range", () => {
    expect(isURL("http://example.com:70000")).toBe(false);
  });

  test("Fails on space in URL", () => {
    expect(isURL("http://exa mple.com")).toBe(false);
  });

  test("Fails protocol-relative URL", () => {
    expect(isURL("//example.com")).toBe(false);
  });
});
