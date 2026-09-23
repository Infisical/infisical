import { AxiosError, AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import { getOciErrorForLog, getOciSignerUserOcid } from "./identity-oci-auth-fns";

const ociError = (status: number, data: unknown, headers: Record<string, string> = {}) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    data,
    headers,
    config: { headers: new AxiosHeaders() }
  });

describe("getOciErrorForLog", () => {
  it("keeps status, axios code, OCI error code and opc-request-id", () => {
    const err = ociError(
      401,
      { code: "NotAuthenticated", message: "The required information to complete authentication was not provided." },
      { "opc-request-id": "D1B2C3/E4F5A6/B7C8D9" }
    );
    expect(getOciErrorForLog(err)).toEqual({
      status: 401,
      code: "ERR_BAD_REQUEST",
      ociErrorCode: "NotAuthenticated",
      ociRequestId: "D1B2C3/E4F5A6/B7C8D9"
    });
  });

  it("never returns the OCI message, which can echo client-supplied values", () => {
    const echoed = "ocid1.user.oc1..aaaaaaaasecretvalue";
    const logged = JSON.stringify(
      getOciErrorForLog(ociError(404, { code: "NotAuthorizedOrNotFound", message: echoed }))
    );
    expect(logged).not.toContain(echoed);
    expect(logged).not.toContain("message");
  });

  it("drops code and request id values that are not plain identifiers", () => {
    const err = ociError(
      400,
      { code: "Bad code with spaces: Authorization=Signature abc" },
      { "opc-request-id": "x".repeat(200) }
    );
    expect(getOciErrorForLog(err)).toEqual({
      status: 400,
      code: "ERR_BAD_REQUEST",
      ociErrorCode: undefined,
      ociRequestId: undefined
    });
  });

  it("handles a non-JSON body and a missing response", () => {
    expect(getOciErrorForLog(ociError(502, "<html>Bad Gateway</html>")).ociErrorCode).toBeUndefined();
    expect(getOciErrorForLog(new AxiosError("connect ECONNREFUSED", "ECONNREFUSED"))).toEqual({
      status: undefined,
      code: "ECONNREFUSED",
      ociErrorCode: undefined,
      ociRequestId: undefined
    });
  });
});

const tenancy = "ocid1.tenancy.oc1..aaaaaaaatenancy";
const user = "ocid1.user.oc1..aaaaaaaauser";
const otherUser = "ocid1.user.oc1..aaaaaaaaother";
const fingerprint = "20:3b:97:13:55:1c:5b:0d:d3:37:d8:50:4e:c5:3a:34";
const keyId = `${tenancy}/${user}/${fingerprint}`;

describe("getOciSignerUserOcid", () => {
  it("extracts the user OCID from a Node SDK style header", () => {
    const header = `Signature version="1",keyId="${keyId}",algorithm="rsa-sha256",headers="(request-target) host date",signature="abc=="`;
    expect(getOciSignerUserOcid(header)).toBe(user);
  });

  it("extracts the user OCID when keyId is not the first parameter", () => {
    const header = `Signature headers="date (request-target) host",keyId="${keyId}",algorithm="rsa-pss-sha256",signature="abc==",version="1"`;
    expect(getOciSignerUserOcid(header)).toBe(user);
  });

  it("matches the keyId parameter name case-insensitively", () => {
    const header = `Signature version="1",keyid="${keyId}",algorithm="rsa-sha256",signature="abc=="`;
    expect(getOciSignerUserOcid(header)).toBe(user);
  });

  it("tolerates whitespace around commas and equals signs", () => {
    const header = `Signature version = "1", keyId = "${keyId}" , algorithm="rsa-sha256"`;
    expect(getOciSignerUserOcid(header)).toBe(user);
  });

  it("ignores decoy parameters whose name merely ends in keyId", () => {
    const decoy = `${tenancy}/${otherUser}/${fingerprint}`;
    const header = `Signature version="1",notKeyId="${decoy}",keyId="${keyId}",algorithm="rsa-sha256",signature="abc=="`;
    expect(getOciSignerUserOcid(header)).toBe(user);
  });

  it("returns null when keyId appears more than once, in any casing", () => {
    const decoy = `${tenancy}/${otherUser}/${fingerprint}`;
    expect(getOciSignerUserOcid(`Signature keyId="${decoy}",keyId="${keyId}",signature="abc=="`)).toBeNull();
    expect(getOciSignerUserOcid(`Signature KEYID="${decoy}",keyId="${keyId}",signature="abc=="`)).toBeNull();
  });

  it("returns null when the header is not a Signature scheme", () => {
    expect(getOciSignerUserOcid(`Bearer keyId="${keyId}"`)).toBeNull();
    expect(getOciSignerUserOcid(`keyId="${keyId}"`)).toBeNull();
    expect(getOciSignerUserOcid("")).toBeNull();
  });

  it("returns null for any malformed parameter", () => {
    expect(getOciSignerUserOcid(`Signature keyId=${keyId},signature="abc=="`)).toBeNull();
    expect(getOciSignerUserOcid(`Signature keyId="${keyId}",signature="abc==",garbage`)).toBeNull();
    expect(getOciSignerUserOcid(`Signature keyId="${keyId}" signature="abc=="`)).toBeNull();
    expect(getOciSignerUserOcid(`Signature key-Id="${keyId}"`)).toBeNull();
    expect(getOciSignerUserOcid(`Signature keyId="${keyId}",`)).toBeNull();
  });

  it("returns null when the header has no keyId", () => {
    expect(getOciSignerUserOcid(`Signature version="1",algorithm="rsa-sha256",signature="abc=="`)).toBeNull();
  });

  it("returns null for security token key ids used by instance and resource principals", () => {
    expect(getOciSignerUserOcid(`Signature version="1",keyId="ST$eyJhbGciOiJSUzI1NiJ9",signature="abc=="`)).toBeNull();
  });

  it("returns null when a keyId segment is empty or the segment count is wrong", () => {
    expect(getOciSignerUserOcid(`Signature keyId="${tenancy}//${fingerprint}"`)).toBeNull();
    expect(getOciSignerUserOcid(`Signature keyId="${tenancy}/${user}"`)).toBeNull();
    expect(getOciSignerUserOcid(`Signature keyId="${keyId}/extra"`)).toBeNull();
    expect(getOciSignerUserOcid(`Signature keyId=""`)).toBeNull();
  });
});
