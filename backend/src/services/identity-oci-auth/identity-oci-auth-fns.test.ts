import { describe, expect, it } from "vitest";

import { getOciSignerUserOcid } from "./identity-oci-auth-fns";

const tenancy = "ocid1.tenancy.oc1..aaaaaaaatenancy";
const user = "ocid1.user.oc1..aaaaaaaauser";
const fingerprint = "20:3b:97:13:55:1c:5b:0d:d3:37:d8:50:4e:c5:3a:34";

describe("getOciSignerUserOcid", () => {
  it("extracts the user OCID from a Node SDK style header", () => {
    const header = `Signature version="1",keyId="${tenancy}/${user}/${fingerprint}",algorithm="rsa-sha256",headers="(request-target) host date",signature="abc=="`;
    expect(getOciSignerUserOcid(header)).toBe(user);
  });

  it("extracts the user OCID when keyId is not the first parameter", () => {
    const header = `Signature headers="date (request-target) host",keyId="${tenancy}/${user}/${fingerprint}",algorithm="rsa-pss-sha256",signature="abc==",version="1"`;
    expect(getOciSignerUserOcid(header)).toBe(user);
  });

  it("matches the keyId parameter name case-insensitively", () => {
    const header = `Signature version="1",keyid="${tenancy}/${user}/${fingerprint}",algorithm="rsa-sha256",signature="abc=="`;
    expect(getOciSignerUserOcid(header)).toBe(user);
  });

  it("returns null when the header has no keyId", () => {
    expect(getOciSignerUserOcid(`Signature version="1",algorithm="rsa-sha256",signature="abc=="`)).toBeNull();
    expect(getOciSignerUserOcid("")).toBeNull();
  });

  it("returns null for security token key ids used by instance and resource principals", () => {
    expect(getOciSignerUserOcid(`Signature version="1",keyId="ST$eyJhbGciOiJSUzI1NiJ9",signature="abc=="`)).toBeNull();
  });

  it("returns null when a keyId segment is empty or the segment count is wrong", () => {
    expect(getOciSignerUserOcid(`Signature keyId="${tenancy}//${fingerprint}"`)).toBeNull();
    expect(getOciSignerUserOcid(`Signature keyId="${tenancy}/${user}"`)).toBeNull();
    expect(getOciSignerUserOcid(`Signature keyId="${tenancy}/${user}/${fingerprint}/extra"`)).toBeNull();
    expect(getOciSignerUserOcid(`Signature keyId=""`)).toBeNull();
  });
});
