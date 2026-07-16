import { OVHConnectionMethod } from "@app/services/app-connection/ovh/ovh-connection-enums";
import { getOvhRequestOptions } from "@app/services/app-connection/ovh/ovh-connection-fns";
import { ValidateOvhConnectionCredentialsSchema } from "@app/services/app-connection/ovh/ovh-connection-schemas";

const OKMS_DOMAIN = "https://eu-west-rbx.okms.ovh.net";
const OKMS_ID = "734b9b45-8b1a-469c-b140-b10bd6540017";

describe("getOvhRequestOptions", () => {
  test("certificate method sets the client cert and key on https.Agent and sets no header", () => {
    const requestOptions = getOvhRequestOptions({
      method: OVHConnectionMethod.Certificate,
      credentials: {
        privateKey: "privateKey",
        certificate: "certificate",
        okmsDomain: OKMS_DOMAIN,
        okmsId: OKMS_ID
      }
    });

    expect(requestOptions.headers).toBeUndefined();
    expect(requestOptions.httpsAgent).toBeDefined();
    expect(requestOptions.httpsAgent?.options.key).toContain("privateKey");
    expect(requestOptions.httpsAgent?.options.cert).toContain("certificate");
  });

  test("token method sets the token on headers and sets not https.Agent", () => {
    const requestOptions = getOvhRequestOptions({
      method: OVHConnectionMethod.Token,
      credentials: {
        token: "secret-token",
        okmsDomain: OKMS_DOMAIN,
        okmsId: OKMS_ID
      }
    });

    expect(requestOptions.headers).toBeDefined();
    expect(requestOptions.httpsAgent).toBeUndefined();
    expect(requestOptions.headers).toEqual({ Authorization: "Bearer secret-token" });
  });
});

describe("ValidateOvhConnectionCredentialsSchema", () => {
  test("certificate method requires privateKey and certificate", () => {
    const result = ValidateOvhConnectionCredentialsSchema.safeParse({
      method: OVHConnectionMethod.Certificate,
      credentials: { token: "secret-token", okmsDomain: OKMS_DOMAIN, okmsId: OKMS_ID }
    });

    expect(result.success).toBe(false);
  });

  test("token method requires token", () => {
    const result = ValidateOvhConnectionCredentialsSchema.safeParse({
      method: OVHConnectionMethod.Certificate,
      credentials: { okmsDomain: OKMS_DOMAIN, okmsId: OKMS_ID }
    });

    expect(result.success).toBe(false);
  });
});
