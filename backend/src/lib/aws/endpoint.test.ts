import { resolveStsVerificationUrl } from "./endpoint";

describe("resolveStsVerificationUrl", () => {
  test("defaults to the regional AWS STS endpoint", () => {
    expect(resolveStsVerificationUrl({ region: "eu-west-1" }, {})).toBe("https://sts.eu-west-1.amazonaws.com");
  });

  test("treats the stored global default as not configured", () => {
    expect(
      resolveStsVerificationUrl({ region: "eu-west-1", configuredEndpoint: "https://sts.amazonaws.com/" }, {})
    ).toBe("https://sts.eu-west-1.amazonaws.com");
  });

  test("falls back to the configured endpoint when no region is available", () => {
    expect(resolveStsVerificationUrl({ region: null, configuredEndpoint: "https://sts.amazonaws.com/" }, {})).toBe(
      "https://sts.amazonaws.com/"
    );
  });

  test("uses AWS_ENDPOINT_URL when set", () => {
    expect(resolveStsVerificationUrl({ region: "us-east-1" }, { AWS_ENDPOINT_URL: "http://localstack:4566" })).toBe(
      "http://localstack:4566"
    );
  });

  test("prefers AWS_ENDPOINT_URL_STS over AWS_ENDPOINT_URL", () => {
    expect(
      resolveStsVerificationUrl(
        { region: "us-east-1" },
        { AWS_ENDPOINT_URL: "http://global:4566", AWS_ENDPOINT_URL_STS: "http://sts-only:4566" }
      )
    ).toBe("http://sts-only:4566");
  });

  test("an explicitly configured endpoint wins over the env vars", () => {
    expect(
      resolveStsVerificationUrl(
        { region: "us-gov-west-1", configuredEndpoint: "https://sts.us-gov-west-1.amazonaws.com" },
        { AWS_ENDPOINT_URL: "http://localstack:4566" }
      )
    ).toBe("https://sts.us-gov-west-1.amazonaws.com");
  });

  test("AWS_IGNORE_CONFIGURED_ENDPOINT_URLS disables the env overrides", () => {
    expect(
      resolveStsVerificationUrl(
        { region: "us-east-1" },
        { AWS_ENDPOINT_URL: "http://localstack:4566", AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: true }
      )
    ).toBe("https://sts.us-east-1.amazonaws.com");
  });
});
