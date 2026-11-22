import { describe, expect, it, vi } from "vitest";

import { RuleViolationError } from "@app/domains/lib/errors";

import { getPowerDnsZoneRrset, patchPowerDnsZoneRrsets, TPowerDnsGatewayDeps } from "./powerdns-connection-fns";
import { TPowerDnsConnectionConfig } from "./powerdns-connection-types";

vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: async ({ host }: { host: string }) => [host]
}));

const CONFIG = {
  credentials: { apiUrl: "https://powerdns.example.com", apiKey: "api-key" },
  gatewayId: "3c90c3cc-0d44-4b50-8888-8dd25736052a"
} as unknown as TPowerDnsConnectionConfig;

const KMS_REFUSAL = new RuleViolationError({ message: "The KMS key for this organization is disabled" });

const deps = {
  gatewayV2Service: {
    getPlatformConnectionDetailsByGatewayId: async () => {
      throw KMS_REFUSAL;
    }
  }
} as unknown as TPowerDnsGatewayDeps;

describe("PowerDNS gateway refusals", () => {
  it("passes a KMS refusal through when reading a record set", async () => {
    await expect(
      getPowerDnsZoneRrset(CONFIG, { zoneId: "example.com.", name: "a.example.com.", type: "A" }, deps)
    ).rejects.toBe(KMS_REFUSAL);
  });

  it("passes a KMS refusal through when updating record sets", async () => {
    await expect(patchPowerDnsZoneRrsets(CONFIG, { zoneId: "example.com.", rrsets: [] }, deps)).rejects.toBe(
      KMS_REFUSAL
    );
  });
});
