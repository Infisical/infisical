import { describe, expect, it } from "vitest";

import { kmsServiceFactory } from "./kms-service";

describe("kmsService.getCookieSigningKey", () => {
  const buildUnstartedService = () => kmsServiceFactory({} as unknown as Parameters<typeof kmsServiceFactory>[0]);

  it("refuses to hand out a key before the root key is loaded", () => {
    expect(() => buildUnstartedService().getCookieSigningKey()).toThrowError(/KMS root key is not loaded/);
  });
});
