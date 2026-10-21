import { beforeEach, describe, expect, test, vi } from "vitest";

import { UnauthorizedError } from "@app/lib/errors";

import { validateAllowlists, verifyStsAndExtractCaller } from "./aws-auth-fns";

const { request, config } = vi.hoisted(() => ({
  request: vi.fn(),
  config: {} as Record<string, unknown>
}));

vi.mock("@app/lib/config/request", () => ({ request }));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => config }));

const ACCOUNT_ID = "123456789012";

const signed = {
  iamHttpRequestMethod: "POST",
  iamRequestBody: Buffer.from("Action=GetCallerIdentity&Version=2011-06-15").toString("base64"),
  iamRequestHeaders: Buffer.from(
    JSON.stringify({
      Authorization:
        "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261006/us-west-2/sts/aws4_request, SignedHeaders=host, Signature=abc"
    })
  ).toString("base64"),
  errorContext: {}
};

beforeEach(() => {
  vi.clearAllMocks();
  delete config.AWS_ENDPOINT_URL;
  request.mockResolvedValue({
    data: {
      GetCallerIdentityResponse: {
        GetCallerIdentityResult: { Account: ACCOUNT_ID, Arn: `arn:aws:iam::${ACCOUNT_ID}:user/app`, UserId: "AIDA" }
      }
    }
  });
});

describe("verifyStsAndExtractCaller", () => {
  test("verifies against the regional AWS STS endpoint by default", async () => {
    await verifyStsAndExtractCaller(signed);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: "https://sts.us-west-2.amazonaws.com" }));
  });

  test("verifies against AWS_ENDPOINT_URL when the operator sets it", async () => {
    config.AWS_ENDPOINT_URL = "http://localstack:4566";
    await verifyStsAndExtractCaller(signed);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: "http://localstack:4566" }));
  });
});

describe("validateAllowlists root principals", () => {
  const validate = (allowedAccountIds: string, allowedPrincipalArns: string) => () =>
    validateAllowlists({
      Account: ACCOUNT_ID,
      Arn: `arn:aws:iam::${ACCOUNT_ID}:root`,
      allowedAccountIds,
      allowedPrincipalArns,
      errorContext: {}
    });

  test("rejects a root principal whose account is allowlisted", () => {
    expect(validate(ACCOUNT_ID, "")).toThrow(UnauthorizedError);
    expect(validate(ACCOUNT_ID, "")).toThrow("Access denied: AWS account root principals cannot use AWS Auth.");
  });

  test("rejects a root principal with 401 instead of failing to parse it against a principal allowlist", () => {
    expect(validate("", `arn:aws:iam::${ACCOUNT_ID}:user/*`)).toThrow(UnauthorizedError);
  });
});
