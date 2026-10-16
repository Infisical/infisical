import { describe, expect, test } from "vitest";

import { resolveStsLoginUrl, stsEndpointRegion } from "./identity-aws-auth-fns";

describe("stsEndpointRegion", () => {
  test("global endpoint carries no region", () => {
    expect(stsEndpointRegion("https://sts.amazonaws.com")).toBeUndefined();
  });

  test("regional endpoint yields its region", () => {
    expect(stsEndpointRegion("https://sts.eu-west-1.amazonaws.com")).toBe("eu-west-1");
  });

  test("fips endpoint yields its region", () => {
    expect(stsEndpointRegion("https://sts-fips.us-east-1.amazonaws.com")).toBe("us-east-1");
  });

  test("GovCloud endpoint yields its region", () => {
    expect(stsEndpointRegion("https://sts.us-gov-west-1.amazonaws.com.us")).toBe("us-gov-west-1");
  });

  test("VPC PrivateLink endpoint yields its region", () => {
    expect(stsEndpointRegion("https://vpce-0abc.sts.eu-west-1.vpce.amazonaws.com")).toBe("eu-west-1");
  });

  test("non-AWS host (e.g. LocalStack) carries no region", () => {
    expect(stsEndpointRegion("http://localhost:4566")).toBeUndefined();
  });

  test("unparseable endpoint carries no region", () => {
    expect(stsEndpointRegion("not a url")).toBeUndefined();
  });
});

describe("resolveStsLoginUrl", () => {
  test("global endpoint routes by the caller's credential scope region", () => {
    expect(resolveStsLoginUrl("https://sts.amazonaws.com", "eu-west-1")).toBe("https://sts.eu-west-1.amazonaws.com");
  });

  test("global endpoint falls back to the configured endpoint when no region parses", () => {
    expect(resolveStsLoginUrl("https://sts.amazonaws.com", null)).toBe("https://sts.amazonaws.com");
  });

  test("non-AWS endpoint (e.g. LocalStack) is honored rather than overridden by the caller region", () => {
    expect(resolveStsLoginUrl("http://localhost:4566", "us-east-1")).toBe("http://localhost:4566");
  });

  test("unparseable configured endpoint is honored as-is", () => {
    expect(resolveStsLoginUrl("not a url", "us-east-1")).toBe("not a url");
  });

  test("pinned regional endpoint honors the configured endpoint when the region matches", () => {
    expect(resolveStsLoginUrl("https://sts.eu-west-1.amazonaws.com", "eu-west-1")).toBe(
      "https://sts.eu-west-1.amazonaws.com"
    );
  });

  test("pinned regional endpoint rejects a mismatched caller region", () => {
    expect(resolveStsLoginUrl("https://sts.eu-west-1.amazonaws.com", "us-east-1")).toBeNull();
  });

  test("GovCloud endpoint rejects a commercial caller region", () => {
    expect(resolveStsLoginUrl("https://sts.us-gov-west-1.amazonaws.com.us", "us-east-1")).toBeNull();
  });

  test("VPC endpoint is honored instead of being overridden by the caller region", () => {
    const vpce = "https://vpce-0abc.sts.eu-west-1.vpce.amazonaws.com";
    expect(resolveStsLoginUrl(vpce, "eu-west-1")).toBe(vpce);
    expect(resolveStsLoginUrl(vpce, "us-east-1")).toBeNull();
  });
});
