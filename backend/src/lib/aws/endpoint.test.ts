import { describe, expect, test } from "vitest";

import { resolveStsEndpointOverride } from "./endpoint";

describe("resolveStsEndpointOverride", () => {
  test("is unset by default", () => {
    expect(resolveStsEndpointOverride({})).toBeUndefined();
  });

  test("uses AWS_ENDPOINT_URL when set", () => {
    expect(resolveStsEndpointOverride({ AWS_ENDPOINT_URL: "http://localstack:4566" })).toBe("http://localstack:4566");
  });

  test("prefers AWS_ENDPOINT_URL_STS over AWS_ENDPOINT_URL", () => {
    expect(
      resolveStsEndpointOverride({
        AWS_ENDPOINT_URL: "http://global:4566",
        AWS_ENDPOINT_URL_STS: "http://sts-only:4566"
      })
    ).toBe("http://sts-only:4566");
  });

  test("AWS_IGNORE_CONFIGURED_ENDPOINT_URLS disables the overrides", () => {
    expect(
      resolveStsEndpointOverride({
        AWS_ENDPOINT_URL: "http://localstack:4566",
        AWS_ENDPOINT_URL_STS: "http://sts-only:4566",
        AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: true
      })
    ).toBeUndefined();
  });
});
