import { describe, expect, test } from "vitest";

import { invalidSignatureMessage } from "./invalid-signature-message";

describe("invalidSignatureMessage", () => {
  test("US Cloud points at EU Cloud", () => {
    expect(invalidSignatureMessage({ INFISICAL_CLOUD: true, INTERNAL_REGION: "us" })).toBe(
      "The access token was not issued by this Infisical instance (US Cloud, https://app.infisical.com). If your organization is on EU Cloud, send it to https://eu.infisical.com."
    );
  });

  test("EU Cloud points at US Cloud", () => {
    expect(invalidSignatureMessage({ INFISICAL_CLOUD: true, INTERNAL_REGION: "eu" })).toBe(
      "The access token was not issued by this Infisical instance (EU Cloud, https://eu.infisical.com). If your organization is on US Cloud, send it to https://app.infisical.com."
    );
  });

  test("Cloud without a region lists both regions", () => {
    expect(invalidSignatureMessage({ INFISICAL_CLOUD: true, INTERNAL_REGION: undefined })).toBe(
      "The access token was not issued by this Infisical instance. Make sure you are sending it to the Infisical Cloud region that issued it (US: https://app.infisical.com, EU: https://eu.infisical.com)."
    );
  });

  test("self-hosted gets no Cloud region advice", () => {
    const message = invalidSignatureMessage({ INFISICAL_CLOUD: false, INTERNAL_REGION: undefined });
    expect(message).toBe(
      "The access token was not issued by this Infisical instance. Make sure you are sending it to the instance that issued it."
    );
    expect(message).not.toContain("infisical.com");
  });
});
