import { describe, expect, it } from "vitest";

import { getAzureDnsRelativeRecordName } from "./azure-dns";

describe("getAzureDnsRelativeRecordName", () => {
  const zoneId =
    "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Network/dnsZones/acme.example.com";

  it("removes the hosted zone suffix from an ACME challenge name", () => {
    expect(getAzureDnsRelativeRecordName(zoneId, "_acme-challenge.host.acme.example.com")).toBe(
      "_acme-challenge.host"
    );
  });

  it("handles DNS names case-insensitively and ignores a trailing dot", () => {
    expect(getAzureDnsRelativeRecordName(zoneId, "_acme-challenge.HOST.ACME.EXAMPLE.COM.")).toBe(
      "_acme-challenge.HOST"
    );
  });

  it("rejects a hosted zone ID without a zone name", () => {
    expect(() => getAzureDnsRelativeRecordName("/", "_acme-challenge.host.example.net")).toThrow(
      "Azure DNS hosted zone ID must include a zone name"
    );
  });

  it("preserves names outside the hosted zone", () => {
    expect(getAzureDnsRelativeRecordName(zoneId, "_acme-challenge.host.example.net")).toBe(
      "_acme-challenge.host.example.net"
    );
  });
});
