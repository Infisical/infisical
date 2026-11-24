import { beforeEach, describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { CertStatus } from "@app/services/certificate/certificate-types";

import { checkMicrosoftAutoenrollmentRequestBeforeSigning } from "./microsoft-autoenrollment-eligibility-fns";
import { MicrosoftAutoenrollmentMetadataKey } from "./microsoft-autoenrollment-types";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const { findDirectoryComputerBySid, readDirectoryComputerGroupSids, loadLdapConnectionConfig } = vi.hoisted(() => ({
  findDirectoryComputerBySid: vi.fn(),
  readDirectoryComputerGroupSids: vi.fn(),
  loadLdapConnectionConfig: vi.fn()
}));

vi.mock("@app/services/app-connection/ldap/ldap-directory-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/app-connection/ldap/ldap-directory-fns")>()),
  findDirectoryComputerBySid,
  readDirectoryComputerGroupSids
}));

vi.mock("./microsoft-autoenrollment-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./microsoft-autoenrollment-fns")>()),
  loadLdapConnectionConfig
}));

const COMPUTER_SID = "S-1-5-21-1111111111-2222222222-3333333333-1105";
const SERVERS_SID = "S-1-5-21-1111111111-2222222222-3333333333-1200";
const ldapConfig = { credentials: { dn: "svc@corp.example.com" } };

describe("checkMicrosoftAutoenrollmentRequestBeforeSigning", () => {
  const deps = {
    pkiApplicationProfileDAL: { findOneByApplicationAndProfile: vi.fn(), primaryNode: vi.fn(() => "primary") },
    microsoftAutoenrollmentEnrollmentConfigDAL: { findById: vi.fn(), primaryNode: vi.fn(() => "primary") },
    resourceMetadataDAL: { find: vi.fn() },
    certificateDAL: { findById: vi.fn(), primaryNode: vi.fn(() => "primary") },
    appConnectionDAL: { findById: vi.fn() },
    kmsDataKeyService: {},
    gatewayV2Service: {},
    gatewayPoolService: {}
  };

  const request = (overrides: Record<string, unknown> = {}) => ({
    id: "request-id",
    applicationId: "application-id",
    profileId: "profile-id",
    renewedFromCertificateId: null,
    commonName: "laptop01.corp.example.com",
    ...overrides
  });

  const check = (overrides: Record<string, unknown> = {}) =>
    checkMicrosoftAutoenrollmentRequestBeforeSigning(
      request(overrides),
      deps as unknown as Parameters<typeof checkMicrosoftAutoenrollmentRequestBeforeSigning>[1]
    );

  const withAllowedGroups = (allowedGroups: { sid: string; name: string }[]) =>
    deps.microsoftAutoenrollmentEnrollmentConfigDAL.findById.mockResolvedValue({
      id: "config-id",
      appConnectionId: "connection-id",
      allowedGroups
    });

  beforeEach(() => {
    vi.clearAllMocks();
    deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile.mockResolvedValue({
      id: "junction-id",
      microsoftAutoenrollmentConfigId: "config-id"
    });
    withAllowedGroups([]);
    deps.resourceMetadataDAL.find.mockResolvedValue([
      { key: MicrosoftAutoenrollmentMetadataKey.ComputerSid, value: COMPUTER_SID }
    ]);
    loadLdapConnectionConfig.mockResolvedValue(ldapConfig);
    findDirectoryComputerBySid.mockResolvedValue({
      dnsHostName: "laptop01.corp.example.com",
      isDisabled: false,
      samAccountName: "LAPTOP01$"
    });
    readDirectoryComputerGroupSids.mockResolvedValue([SERVERS_SID]);
  });

  test("passes an enabled computer still in Active Directory, reading the profile's settings from the primary", async () => {
    await expect(check()).resolves.toBeUndefined();

    expect(deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile).toHaveBeenCalledWith(
      "application-id",
      "profile-id",
      "primary"
    );
    expect(findDirectoryComputerBySid).toHaveBeenCalledWith(
      { config: ldapConfig, sid: COMPUTER_SID },
      expect.anything()
    );
    expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.findById).toHaveBeenCalledWith("config-id", "primary");
    expect(deps.resourceMetadataDAL.find).toHaveBeenCalledWith(
      { certificateRequestId: "request-id" },
      { tx: "primary" }
    );
    expect(readDirectoryComputerGroupSids).not.toHaveBeenCalled();
  });

  test("refuses a computer whose DNS host name changed since the request was submitted", async () => {
    findDirectoryComputerBySid.mockResolvedValue({
      dnsHostName: "laptop02.corp.example.com",
      isDisabled: false,
      samAccountName: "LAPTOP01$"
    });

    await expect(check()).rejects.toThrow(/DNS host name in Active Directory changed after the request was submitted/);
  });

  test("refuses a computer whose DNS host name was cleared since the request was submitted", async () => {
    findDirectoryComputerBySid.mockResolvedValue({ dnsHostName: null, isDisabled: false, samAccountName: "LAPTOP01$" });

    await expect(check()).rejects.toThrow("Computer LAPTOP01$ no longer has a DNS host name in Active Directory.");
  });

  test("refuses when Microsoft Autoenrollment was turned off for the profile", async () => {
    deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile.mockResolvedValue({
      id: "junction-id",
      microsoftAutoenrollmentConfigId: null
    });

    await expect(check()).rejects.toThrow(
      "Microsoft Autoenrollment was turned off for this profile after the request was submitted. The certificate was not issued."
    );
    expect(findDirectoryComputerBySid).not.toHaveBeenCalled();
  });

  test("refuses a computer removed from Active Directory", async () => {
    findDirectoryComputerBySid.mockResolvedValue(null);

    await expect(check()).rejects.toThrow(`Computer ${COMPUTER_SID} is no longer in Active Directory.`);
  });

  test("refuses a computer disabled since the request was submitted", async () => {
    findDirectoryComputerBySid.mockResolvedValue({
      dnsHostName: "laptop01.corp.example.com",
      isDisabled: true,
      samAccountName: "LAPTOP01$"
    });

    await expect(check()).rejects.toThrow("Computer LAPTOP01$ was disabled in Active Directory");
  });

  test("refuses when the LDAP account cannot tell whether the computer is disabled", async () => {
    findDirectoryComputerBySid.mockResolvedValue({
      dnsHostName: "laptop01.corp.example.com",
      isDisabled: null,
      samAccountName: "LAPTOP01$"
    });

    await expect(check()).rejects.toThrow(/cannot read userAccountControl/);
  });

  test("refuses, without the raw error, when Active Directory cannot be reached", async () => {
    findDirectoryComputerBySid.mockRejectedValue(new Error("ECONNRESET 10.0.0.4:636"));

    const error = await check().catch((err: Error) => err);

    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as Error).message).toContain("Could not look up the computer in Active Directory");
    expect((error as Error).message).not.toContain("ECONNRESET");
  });

  test("passes a computer still in one of the profile's allowed groups", async () => {
    withAllowedGroups([{ sid: SERVERS_SID, name: "Servers" }]);

    await expect(check()).resolves.toBeUndefined();
    expect(readDirectoryComputerGroupSids).toHaveBeenCalledWith(
      { config: ldapConfig, sid: COMPUTER_SID },
      expect.anything()
    );
  });

  test("refuses a computer no longer in any of the profile's allowed groups", async () => {
    withAllowedGroups([{ sid: SERVERS_SID, name: "Servers" }]);
    readDirectoryComputerGroupSids.mockResolvedValue(["S-1-5-21-1111111111-2222222222-3333333333-515"]);

    await expect(check()).rejects.toThrow(
      "Computer LAPTOP01$ is no longer in a group allowed to enroll for this profile."
    );
  });

  test("names the LDAP account's read access when the computer's groups cannot be read", async () => {
    withAllowedGroups([{ sid: SERVERS_SID, name: "Servers" }]);
    readDirectoryComputerGroupSids.mockResolvedValue([]);

    await expect(check()).rejects.toThrow(
      "The LDAP connection's account cannot read tokenGroups for computer LAPTOP01$, so its group membership is unknown. Allow that account to read tokenGroups on computer objects."
    );
  });

  test("refuses a request that does not record the computer that submitted it", async () => {
    deps.resourceMetadataDAL.find.mockResolvedValue([]);

    await expect(check()).rejects.toThrow(/does not record which computer submitted it/);
    expect(findDirectoryComputerBySid).not.toHaveBeenCalled();
  });

  describe("a renewal", () => {
    const renewed = { status: CertStatus.ACTIVE, deletedAt: null, notAfter: new Date(Date.now() + 86400000) };

    test("passes as a renewal while the certificate it renews is still valid", async () => {
      deps.certificateDAL.findById.mockResolvedValue(renewed);

      await expect(check({ renewedFromCertificateId: "cert-old" })).resolves.toBeUndefined();
      expect(deps.certificateDAL.findById).toHaveBeenCalledWith("cert-old", "primary");
    });

    test("keeps the renewal when the certificate it renews expired while waiting for approval", async () => {
      deps.certificateDAL.findById.mockResolvedValue({ ...renewed, notAfter: new Date(Date.now() - 1000) });

      await expect(check({ renewedFromCertificateId: "cert-old" })).resolves.toBeUndefined();
    });

    test("still refuses an expired original that was revoked", async () => {
      deps.certificateDAL.findById.mockResolvedValue({
        ...renewed,
        status: CertStatus.REVOKED,
        notAfter: new Date(Date.now() - 1000)
      });

      await expect(check({ renewedFromCertificateId: "cert-old" })).rejects.toThrow("was revoked");
    });

    test.each([
      ["revoked", { ...renewed, status: CertStatus.REVOKED }, "was revoked"],
      ["deleted", { ...renewed, deletedAt: new Date() }, "was deleted"],
      ["gone", undefined, "was deleted"]
    ])("refuses when the certificate it renews is %s", async (_name, certificate, reason) => {
      deps.certificateDAL.findById.mockResolvedValue(certificate);

      await expect(check({ renewedFromCertificateId: "cert-old" })).rejects.toThrow(
        `The certificate this request renews ${reason}`
      );
    });
  });
});
