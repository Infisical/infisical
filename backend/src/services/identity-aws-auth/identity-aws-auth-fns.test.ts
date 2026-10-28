import { describe, expect, test } from "vitest";

import { hasAwsTrustBinding, parseSignedGetCallerIdentityRequest } from "./identity-aws-auth-fns";

describe("hasAwsTrustBinding", () => {
  test.each([
    { allowedAccountIds: null, allowedPrincipalArns: null },
    { allowedAccountIds: undefined, allowedPrincipalArns: undefined },
    { allowedAccountIds: "", allowedPrincipalArns: "" },
    { allowedAccountIds: "   ", allowedPrincipalArns: " " }
  ])("is false when both lists are unset: %o", (binding) => {
    expect(hasAwsTrustBinding(binding)).toBe(false);
  });

  test("is true when only the account list is set", () => {
    expect(hasAwsTrustBinding({ allowedAccountIds: "123456789012", allowedPrincipalArns: "" })).toBe(true);
  });

  test("is true when only the principal ARN list is set", () => {
    expect(
      hasAwsTrustBinding({ allowedAccountIds: "", allowedPrincipalArns: "arn:aws:iam::123456789012:role/app" })
    ).toBe(true);
  });
});

describe("parseSignedGetCallerIdentityRequest", () => {
  const authorizationFor = (region: string) =>
    `AWS4-HMAC-SHA256 Credential=AKIA/20260101/${region}/sts/aws4_request, SignedHeaders=host;x-amz-date, Signature=abc`;

  const signedHeaders = {
    Authorization: authorizationFor("us-east-1"),
    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    "X-Amz-Date": "20260101T000000Z",
    "x-amz-security-token": "session-token",
    Host: "sts.us-east-1.amazonaws.com",
    "Content-Length": "43"
  };

  const parse = ({
    method = "POST",
    body = "Action=GetCallerIdentity&Version=2011-06-15",
    headers = signedHeaders as unknown
  }: { method?: string; body?: string; headers?: unknown } = {}) =>
    parseSignedGetCallerIdentityRequest({
      iamHttpRequestMethod: method,
      iamRequestBody: Buffer.from(body).toString("base64"),
      iamRequestHeaders: Buffer.from(JSON.stringify(headers)).toString("base64")
    });

  test("targets the regional STS endpoint and forwards every header except routing and framing ones", () => {
    expect(
      parse({
        headers: {
          ...signedHeaders,
          Accept: "application/json",
          "Transfer-Encoding": "chunked",
          Connection: "keep-alive",
          "Keep-Alive": "timeout=5",
          Upgrade: "h2c",
          Expect: "100-continue"
        }
      })
    ).toEqual({
      url: "https://sts.us-east-1.amazonaws.com",
      body: "Action=GetCallerIdentity&Version=2011-06-15",
      headers: {
        authorization: signedHeaders.Authorization,
        "content-type": signedHeaders["Content-Type"],
        "x-amz-date": signedHeaders["X-Amz-Date"],
        "x-amz-security-token": signedHeaders["x-amz-security-token"],
        accept: "application/json"
      }
    });
  });

  test("drops a numeric Content-Length instead of rejecting it", () => {
    expect(parse({ headers: { ...signedHeaders, "Content-Length": 43 } }).headers).not.toHaveProperty("content-length");
  });

  test("targets the global STS endpoint when the request was signed for it", () => {
    expect(parse({ headers: { ...signedHeaders, Host: "STS.amazonaws.com" } })).toMatchObject({
      url: "https://sts.amazonaws.com"
    });
  });

  test("rejects the global STS host signed for a region other than us-east-1", () => {
    expect(() =>
      parse({ headers: { Authorization: authorizationFor("eu-west-1"), Host: "sts.amazonaws.com" } })
    ).toThrow("invalid host header");
  });

  test.each([
    "attacker-bucket.s3.amazonaws.com",
    "sts.us-west-2.amazonaws.com",
    "sts.us-east-1.amazonaws.com.evil.com",
    "sts.us-east-1.amazonaws.com:443",
    ""
  ])("rejects host %j", (host) => {
    expect(() => parse({ headers: { ...signedHeaders, Host: host } })).toThrow("invalid host header");
  });

  test("rejects a second spelling or a non-string host", () => {
    expect(() => parse({ headers: { ...signedHeaders, host: "attacker-bucket.s3.amazonaws.com" } })).toThrow(
      "invalid host header"
    );
    expect(() => parse({ headers: { ...signedHeaders, Host: null } })).toThrow("invalid host header");
  });

  test("normalizes space-padded header names the way the HTTP client does", () => {
    expect(() => parse({ headers: { ...signedHeaders, " Host ": "attacker-bucket.s3.amazonaws.com" } })).toThrow(
      "invalid host header"
    );
    expect(() => parse({ headers: { ...signedHeaders, " authorization": authorizationFor("us-west-2") } })).toThrow(
      "invalid authorization header"
    );
    expect(parse({ headers: { ...signedHeaders, " Content-Length ": "0" } }).headers).not.toHaveProperty(
      " content-length "
    );
  });

  test.each(["us-east-1", "us-gov-west-1", "eu-central-2", "ap-southeast-4"])("accepts region %s", (region) => {
    expect(parse({ headers: { Authorization: authorizationFor(region) } }).url).toBe(
      `https://sts.${region}.amazonaws.com`
    );
  });

  test.each(["s3", "s3-us-west-2", "compute-1", "s3-website-us-east-1", "us-east", ""])(
    "rejects region %j",
    (region) => {
      expect(() => parse({ headers: { Authorization: authorizationFor(region) } })).toThrow("Invalid AWS region");
    }
  );

  test("rejects a request without an authorization header", () => {
    expect(() => parse({ headers: { "X-Amz-Date": "20260101T000000Z" } })).toThrow("Invalid AWS region");
  });

  test.each(["GET", "PUT"])("rejects method %s", (method) => {
    expect(() => parse({ method })).toThrow("must be a POST of Action=GetCallerIdentity");
  });

  test.each([
    "",
    "Action=AssumeRole",
    "Action=GetCallerIdentity&Action=GetCallerIdentity",
    "GET /caller.json HTTP/1.1\r\nX-Swallow: "
  ])("rejects body %j", (body) => {
    expect(() => parse({ body })).toThrow("must be a POST of Action=GetCallerIdentity");
  });

  test("rejects a second spelling of the authorization header", () => {
    expect(() => parse({ headers: { ...signedHeaders, authorization: null } })).toThrow("invalid authorization header");
    expect(() => parse({ headers: { ...signedHeaders, authorization: authorizationFor("us-west-2") } })).toThrow(
      "invalid authorization header"
    );
  });

  test("rejects a non-string value for a forwarded header", () => {
    expect(() => parse({ headers: { ...signedHeaders, "X-Amz-Date": 1 } })).toThrow("invalid x-amz-date header");
    expect(() => parse({ headers: { ...signedHeaders, Accept: null } })).toThrow("invalid accept header");
  });

  test("rejects a second spelling of any forwarded header", () => {
    expect(() => parse({ headers: { ...signedHeaders, "x-amz-date": "20260102T000000Z" } })).toThrow(
      "invalid x-amz-date header"
    );
  });

  test.each([null, [], "headers"])("rejects a header document of %j", (headers) => {
    expect(() => parse({ headers })).toThrow("must be a JSON object");
  });

  test("rejects headers that are not JSON", () => {
    expect(() =>
      parseSignedGetCallerIdentityRequest({
        iamHttpRequestMethod: "POST",
        iamRequestBody: Buffer.from("Action=GetCallerIdentity").toString("base64"),
        iamRequestHeaders: Buffer.from("not json").toString("base64")
      })
    ).toThrow("must be base64-encoded JSON");
  });
});
