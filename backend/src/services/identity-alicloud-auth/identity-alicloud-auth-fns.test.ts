import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import { getAliCloudErrorForLog } from "./identity-alicloud-auth-fns";

const aliCloudError = (status: number, data: unknown) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    data,
    headers: {},
    config: { headers: new AxiosHeaders() }
  });

describe("getAliCloudErrorForLog", () => {
  it("keeps status, axios code, Alibaba Cloud error code and request id", () => {
    const err = aliCloudError(404, {
      RequestId: "8A5C0A39-7E0B-5C4B-9F11-2E6B7D0D6C11",
      HostId: "sts.aliyuncs.com",
      Code: "InvalidAccessKeyId.NotFound",
      Message: "Specified access key is not found."
    });
    expect(getAliCloudErrorForLog(err)).toEqual({
      status: 404,
      code: "ERR_BAD_REQUEST",
      aliCloudErrorCode: "InvalidAccessKeyId.NotFound",
      aliCloudRequestId: "8A5C0A39-7E0B-5C4B-9F11-2E6B7D0D6C11"
    });
  });

  it("never returns the message, which embeds the signed request on SignatureDoesNotMatch", () => {
    const accessKeyId = "LTAI5tSecretAccessKeyId";
    const err = aliCloudError(400, {
      RequestId: "1D2E3F40-0000-4000-8000-000000000000",
      Code: "SignatureDoesNotMatch",
      Message: `Specified signature is not matched with our calculation. server string to sign is:GET&%2F&AccessKeyId%3D${accessKeyId}%26SignatureNonce%3Dabc`
    });
    const logged = JSON.stringify(getAliCloudErrorForLog(err));
    expect(logged).not.toContain(accessKeyId);
    expect(logged).not.toContain("SignatureNonce");
    expect(logged).toContain("SignatureDoesNotMatch");
  });

  it("drops code and request id values that are not plain identifiers", () => {
    const err = aliCloudError(400, { Code: "AccessKeyId=LTAI5t Signature=abc", RequestId: { nested: true } });
    expect(getAliCloudErrorForLog(err)).toMatchObject({ aliCloudErrorCode: undefined, aliCloudRequestId: undefined });
  });

  it("handles a non-JSON body and a missing response", () => {
    expect(getAliCloudErrorForLog(aliCloudError(502, "<html>Bad Gateway</html>")).aliCloudErrorCode).toBeUndefined();
    expect(getAliCloudErrorForLog(new AxiosError("timeout of 5000ms exceeded", "ECONNABORTED"))).toEqual({
      status: undefined,
      code: "ECONNABORTED",
      aliCloudErrorCode: undefined,
      aliCloudRequestId: undefined
    });
  });
});
