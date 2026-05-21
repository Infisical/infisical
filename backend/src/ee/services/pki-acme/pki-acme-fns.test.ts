import { validateDnsIdentifier } from "./pki-acme-fns";

describe("validateDnsIdentifier", () => {
  test("accepts standard domain names", () => {
    expect(validateDnsIdentifier("example.com")).toBe(true);
    expect(validateDnsIdentifier("sub.example.com")).toBe(true);
    expect(validateDnsIdentifier("deep.sub.example.com")).toBe(true);
    expect(validateDnsIdentifier("a.b")).toBe(true);
  });

  test("accepts wildcard prefixes", () => {
    expect(validateDnsIdentifier("*.example.com")).toBe(true);
    expect(validateDnsIdentifier("*.sub.example.com")).toBe(true);
  });

  test("rejects invalid wildcard forms", () => {
    expect(validateDnsIdentifier("**.example.com")).toBe(false);
    expect(validateDnsIdentifier("a*.example.com")).toBe(false);
    expect(validateDnsIdentifier("*a.example.com")).toBe(false);
    expect(validateDnsIdentifier("*")).toBe(false);
    expect(validateDnsIdentifier("*.")).toBe(false);
    expect(validateDnsIdentifier("sub.*.example.com")).toBe(false);
  });

  test("rejects invalid domain labels", () => {
    expect(validateDnsIdentifier("-example.com")).toBe(false);
    expect(validateDnsIdentifier("example-.com")).toBe(false);
    expect(validateDnsIdentifier("")).toBe(false);
  });
});
