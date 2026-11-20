// Every stream read (get, list, create and update responses) goes out through its provider's
// sanitized schema, so each one has to drop or redact that provider's secret on its own.
import { describe, expect, test } from "vitest";

import { LogProvider, REDACTED_CREDENTIAL_VALUE } from "./audit-log-stream-enums";
import { SanitizedAzureProviderSchema } from "./azure/azure-provider-schemas";
import { SanitizedCriblProviderSchema } from "./cribl/cribl-provider-schemas";
import { SanitizedCustomProviderSchema } from "./custom/custom-provider-schemas";
import { SanitizedDatadogProviderSchema } from "./datadog/datadog-provider-schemas";
import { SanitizedSplunkProviderSchema } from "./splunk/splunk-provider-schemas";
import { SanitizedSumoLogicProviderSchema } from "./sumo-logic/sumo-logic-provider-schemas";

const stored = (provider: LogProvider, credentials: Record<string, unknown>) => ({
  id: "2f1d4c3e-0b6a-4e8f-9c1d-3a5b7c9d1e2f",
  orgId: "8a7b6c5d-4e3f-4a1b-9c8d-7e6f5a4b3c2d",
  createdAt: new Date(),
  updatedAt: new Date(),
  streamMode: "batch",
  provider,
  credentials
});

const secret = "s3cr3t-value-that-must-not-leak-0123456789";

describe("audit log stream sanitized read schemas", () => {
  test("Splunk drops the HEC token and keeps the hostname and port", () => {
    const token = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";
    const read = SanitizedSplunkProviderSchema.parse(
      stored(LogProvider.Splunk, { hostname: "splunk.example.com", port: 8088, token })
    );

    expect(read.credentials).toEqual({ hostname: "splunk.example.com", port: 8088 });
    expect(JSON.stringify(read)).not.toContain(token);
  });

  test("Azure drops the client secret and keeps the identifiers", () => {
    const clientSecret = "a".repeat(40);
    const read = SanitizedAzureProviderSchema.parse(
      stored(LogProvider.Azure, {
        tenantId: "11111111-2222-4333-8444-555555555555",
        clientId: "66666666-7777-4888-9999-aaaaaaaaaaaa",
        clientSecret,
        dceUrl: "https://dce.example.com",
        dcrId: `dcr-${"0".repeat(32)}`,
        cltName: "Custom-Infisical_CL"
      })
    );

    expect(read.credentials).not.toHaveProperty("clientSecret");
    expect(JSON.stringify(read)).not.toContain(clientSecret);
    expect(read.credentials.tenantId).toBe("11111111-2222-4333-8444-555555555555");
  });

  test("Cribl drops the token and keeps the URL", () => {
    const read = SanitizedCriblProviderSchema.parse(
      stored(LogProvider.Cribl, { url: "https://cribl.example.com/ingest", token: secret })
    );

    expect(read.credentials).toEqual({ url: "https://cribl.example.com/ingest" });
    expect(JSON.stringify(read)).not.toContain(secret);
  });

  test("Sumo Logic redacts the token and keeps the URL", () => {
    const read = SanitizedSumoLogicProviderSchema.parse(
      stored(LogProvider.SumoLogic, { url: "https://sumo.example.com/receiver", token: secret })
    );

    expect(read.credentials).toEqual({ url: "https://sumo.example.com/receiver", token: REDACTED_CREDENTIAL_VALUE });
  });

  test("Datadog drops the API key and keeps the URL", () => {
    const token = "0123456789abcdef0123456789abcdef";
    const read = SanitizedDatadogProviderSchema.parse(
      stored(LogProvider.Datadog, { url: "https://http-intake.logs.datadoghq.com", token })
    );

    expect(read.credentials).toEqual({ url: "https://http-intake.logs.datadoghq.com" });
    expect(JSON.stringify(read)).not.toContain(token);
  });

  test("a custom stream keeps header keys and redacts every value", () => {
    const read = SanitizedCustomProviderSchema.parse(
      stored(LogProvider.Custom, {
        url: "https://hooks.example.com/infisical",
        headers: [
          { key: "Authorization", value: `Bearer ${secret}` },
          { key: "X-Api-Key", value: secret }
        ]
      })
    );

    expect(read.credentials.headers).toEqual([
      { key: "Authorization", value: REDACTED_CREDENTIAL_VALUE },
      { key: "X-Api-Key", value: REDACTED_CREDENTIAL_VALUE }
    ]);
    expect(JSON.stringify(read)).not.toContain(secret);
  });
});
