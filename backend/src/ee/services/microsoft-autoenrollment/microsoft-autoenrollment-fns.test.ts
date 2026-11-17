import dns from "node:dns/promises";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  isComputerInAllowedGroups,
  normalizeHttpServicePrincipalName,
  resolveCanonicalHostname
} from "./microsoft-autoenrollment-fns";

const DOMAIN_COMPUTERS_SID = "S-1-5-21-1111111111-2222222222-3333333333-515";
const SERVERS_SID = "S-1-5-21-1111111111-2222222222-3333333333-1200";

describe("isComputerInAllowedGroups", () => {
  test.each([
    ["no allowed groups", null, true],
    ["an empty allowed group list", [], true],
    ["a group the computer is in", [SERVERS_SID, DOMAIN_COMPUTERS_SID], true],
    ["only groups the computer is not in", [SERVERS_SID], false]
  ])("%s", (_name, allowedGroupSids, expected) => {
    expect(isComputerInAllowedGroups(allowedGroupSids, [DOMAIN_COMPUTERS_SID])).toBe(expected);
  });
});

describe("normalizeHttpServicePrincipalName", () => {
  test.each([
    [
      "an HTTP service principal, lowercasing the hostname",
      "HTTP/Infisical.Corp.Example.com",
      "HTTP/infisical.corp.example.com"
    ],
    ["another service class", "HOST/infisical.corp.example.com", null],
    ["a name with markup", "HTTP/infisical.example.com<script>", null],
    ["a name with spaces", "HTTP/infisical.example.com && calc", null],
    ["a hostname longer than 253 characters", `HTTP/${"a".repeat(254)}`, null],
    ["no name", undefined, null]
  ])("%s", (_name, serviceName, expected) => {
    expect(normalizeHttpServicePrincipalName(serviceName)).toBe(expected);
  });
});

describe("resolveCanonicalHostname", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("follows CNAMEs to the canonical name, lowercased", async () => {
    const cnames: Record<string, string> = {
      "app.example.com": "Edge.Example.NET",
      "edge.example.net": "origin.example.net"
    };
    vi.spyOn(dns, "resolveCname").mockImplementation(async (hostname: string) =>
      cnames[hostname] ? [cnames[hostname]] : Promise.reject(Object.assign(new Error("no data"), { code: "ENODATA" }))
    );

    await expect(resolveCanonicalHostname("App.Example.com")).resolves.toBe("origin.example.net");
  });

  test("refuses a hostname DNS could not answer for", async () => {
    vi.spyOn(dns, "resolveCname").mockRejectedValue(Object.assign(new Error("server failure"), { code: "ESERVFAIL" }));

    await expect(resolveCanonicalHostname("app.example.com")).rejects.toThrow(
      "Could not resolve the hostname 'app.example.com' in DNS (ESERVFAIL)"
    );
  });

  test("stops after ten hops on a CNAME loop", async () => {
    const resolveCname = vi
      .spyOn(dns, "resolveCname")
      .mockImplementation(async (hostname: string) => [
        hostname === "a.example.com" ? "b.example.com" : "a.example.com"
      ]);

    await expect(resolveCanonicalHostname("a.example.com")).resolves.toBe("a.example.com");
    expect(resolveCname).toHaveBeenCalledTimes(10);
  });
});
