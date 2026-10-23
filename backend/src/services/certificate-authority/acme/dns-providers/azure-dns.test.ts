import { beforeEach, describe, expect, it, vi } from "vitest";

import { request } from "@app/lib/config/request";
import { getAzureDnsAccessToken } from "@app/services/app-connection/azure-dns/azure-dns-connection-fns";

import {
  azureDnsDeleteTxtRecord,
  azureDnsInsertTxtRecord,
  getAzureDnsRelativeRecordName,
} from "./azure-dns";

vi.mock("@app/lib/config/request", () => ({
  request: { put: vi.fn(), delete: vi.fn() },
}));
vi.mock(
  "@app/services/app-connection/azure-dns/azure-dns-connection-fns",
  () => ({
    validateAzureDnsZoneResourceId: vi.fn(),
    getAzureDnsAccessToken: vi.fn(),
  }),
);

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

  it("uses the apex record name for a CNAME target equal to the hosted zone", () => {
    expect(getAzureDnsRelativeRecordName(zoneId, "ACME.EXAMPLE.COM.")).toBe(
      "@",
    );
  });

  it("rejects names outside the hosted zone before changing DNS", () => {
    expect(() =>
      getAzureDnsRelativeRecordName(zoneId, "_acme-challenge.host.example.net"),
    ).toThrow("outside the hosted zone");
  });
});

describe("Azure DNS challenge writes", () => {
  const zoneId =
    "/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Network/dnsZones/acme.example.com";
  const connection = {
    method: "client-secret",
    credentials: {
      tenantId: "tenant",
      clientId: "client",
      clientSecret: "secret",
      subscriptionId: "subscription",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAzureDnsAccessToken).mockResolvedValue("token");
  });

  it("rejects out-of-zone inserts and deletes before token or DNS requests", async () => {
    await expect(
      azureDnsInsertTxtRecord(
        connection,
        zoneId,
        "_acme-challenge.outside.net",
        '"txt"',
      ),
    ).rejects.toThrow("outside the hosted zone");
    await expect(
      azureDnsDeleteTxtRecord(
        connection,
        zoneId,
        "_acme-challenge.outside.net",
        '"txt"',
      ),
    ).rejects.toThrow("outside the hosted zone");
    expect(getAzureDnsAccessToken).not.toHaveBeenCalled();
    expect(vi.mocked(request).put).not.toHaveBeenCalled();
    expect(vi.mocked(request).delete).not.toHaveBeenCalled();
  });

  it("writes and deletes an apex CNAME target at Azure's @ record", async () => {
    await azureDnsInsertTxtRecord(
      connection,
      zoneId,
      "ACME.EXAMPLE.COM.",
      '"txt"',
    );
    await azureDnsDeleteTxtRecord(
      connection,
      zoneId,
      "acme.example.com",
      '"txt"',
    );
    expect(vi.mocked(request).put).toHaveBeenCalledWith(
      expect.stringContaining("/TXT/%40?api-version="),
      expect.anything(),
      expect.anything(),
    );
    expect(vi.mocked(request).delete).toHaveBeenCalledWith(
      expect.stringContaining("/TXT/%40?api-version="),
      expect.anything(),
    );
  });
});
