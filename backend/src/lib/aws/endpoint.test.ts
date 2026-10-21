import { resolveStsVerificationUrl } from "./endpoint";

describe("resolveStsVerificationUrl", () => {
  test("defaults to the regional AWS STS endpoint", () => {
    expect(resolveStsVerificationUrl({ region: "eu-west-1" }, {})).toBe("https://sts.eu-west-1.amazonaws.com");
  });

  test("never uses the fallback while a signing region is present", () => {
    expect(resolveStsVerificationUrl({ region: "eu-west-1", fallback: "http://127.0.0.1:8080/" }, {})).toBe(
      "https://sts.eu-west-1.amazonaws.com"
    );
  });

  test("falls back when no region is available", () => {
    expect(resolveStsVerificationUrl({ region: null, fallback: "https://sts.amazonaws.com/" }, {})).toBe(
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

  test("AWS_IGNORE_CONFIGURED_ENDPOINT_URLS disables the overrides", () => {
    expect(
      resolveStsVerificationUrl(
        { region: "us-east-1" },
        { AWS_ENDPOINT_URL: "http://localstack:4566", AWS_IGNORE_CONFIGURED_ENDPOINT_URLS: true }
      )
    ).toBe("https://sts.us-east-1.amazonaws.com");
  });
});
