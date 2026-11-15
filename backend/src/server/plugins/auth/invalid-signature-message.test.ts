import { describe, expect, test } from "vitest";

import { invalidSignatureMessage } from "./invalid-signature-message";

describe("invalidSignatureMessage", () => {
  test("US Cloud points at EU Cloud", () => {
    expect(invalidSignatureMessage({ INFISICAL_CLOUD: true, INTERNAL_REGION: "us" })).toBe(
      "The access token's signature could not be verified. It may have been issued by a different Infisical instance: this is US Cloud (https://app.infisical.com); if your organization is on EU Cloud, use https://eu.infisical.com."
    );
  });

  test("EU Cloud points at US Cloud", () => {
    expect(invalidSignatureMessage({ INFISICAL_CLOUD: true, INTERNAL_REGION: "eu" })).toBe(
      "The access token's signature could not be verified. It may have been issued by a different Infisical instance: this is EU Cloud (https://eu.infisical.com); if your organization is on US Cloud, use https://app.infisical.com."
    );
  });

  test("Cloud without a region lists both regions", () => {
    expect(invalidSignatureMessage({ INFISICAL_CLOUD: true, INTERNAL_REGION: undefined })).toBe(
      "The access token's signature could not be verified. It may have been issued by a different Infisical instance: if your organization is on Infisical Cloud, use the region that issued it (US: https://app.infisical.com, EU: https://eu.infisical.com)."
    );
  });

  test("self-hosted gets no Cloud region advice", () => {
    const message = invalidSignatureMessage({ INFISICAL_CLOUD: false, INTERNAL_REGION: undefined });
    expect(message).toBe(
      "The access token's signature could not be verified. It may have been issued by a different Infisical instance."
    );
    expect(message).not.toContain("infisical.com");
  });
});
