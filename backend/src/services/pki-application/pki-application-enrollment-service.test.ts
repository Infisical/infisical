import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import {
  MicrosoftAutoenrollmentChannelBindingStatus,
  MicrosoftAutoenrollmentKeytabSource
} from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-types";
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { KerberosEncryptionType } from "@app/lib/kerberos/kerberos-types";
import { buildTestKeytab, buildTestKeytabEntry } from "@app/lib/kerberos/kerberos.test-helpers";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { LdapProvider } from "@app/services/app-connection/ldap/ldap-connection-enums";
import { ActorType } from "@app/services/auth/auth-type";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

import { pkiApplicationEnrollmentServiceFactory } from "./pki-application-enrollment-service";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ SITE_URL: "https://app.example.com" }) }));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const { searchDirectoryGroups, resolveDirectorySecurityGroupNames } = vi.hoisted(() => ({
  searchDirectoryGroups: vi.fn(),
  resolveDirectorySecurityGroupNames: vi.fn()
}));

vi.mock("@app/services/app-connection/ldap/ldap-directory-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/app-connection/ldap/ldap-directory-fns")>()),
  searchDirectoryGroups,
  resolveDirectorySecurityGroupNames
}));

vi.mock("@app/services/app-connection/app-connection-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/app-connection/app-connection-fns")>()),
  decryptAppConnection: vi.fn().mockResolvedValue({})
}));

const APPLICATION_ID = "5b0f7a52-1f43-4c55-9a8e-0f6b8f2f6a11";
const PROFILE_ID = "8d3c2b1a-0f9e-4d8c-b7a6-5f4e3d2c1b0a";
const OTHER_PROFILE_ID = "1d3c2b1a-0f9e-4d8c-b7a6-5f4e3d2c1b0a";
const CONNECTION_ID = "3c9a1f7e-2b4d-4e6f-8a0b-1c2d3e4f5a6b";
const SERVICE_PRINCIPAL_NAME = "HTTP/app.example.com@CORP.EXAMPLE.COM";
const SERVERS_SID = "S-1-5-21-1111111111-2222222222-3333333333-1200";

const actor = {
  projectId: "project-id",
  actor: ActorType.USER as const,
  actorId: "user-id",
  actorAuthMethod: null,
  actorOrgId: "org-id",
  actorRootOrgId: "org-id",
  actorParentOrgId: "org-id"
};

const TEST_GROUP_SID_PREFIX = "S-1-5-21-1111111111-2222222222-3333333333-";

const existingConfig = {
  id: "config-id",
  templateMajorRevision: 100,
  templateMinorRevision: 3,
  renewBeforeDays: 30,
  allowedGroups: [{ sid: SERVERS_SID, name: "Servers" }],
  servicePrincipalName: SERVICE_PRINCIPAL_NAME,
  keyVersion: 3,
  encryptedKeytab: Buffer.from("existing-encrypted-keytab"),
  appConnectionId: CONNECTION_ID,
  allowAnyChannelBinding: false
};

describe("pkiApplicationEnrollmentService Microsoft Autoenrollment", () => {
  const deps = {
    pkiApplicationDAL: { findById: vi.fn() },
    pkiApplicationProfileDAL: {
      findOneByApplicationAndProfile: vi.fn(),
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback("tx")),
      update: vi.fn(),
      primaryNode: vi.fn(() => "primary")
    },
    microsoftAutoenrollmentEnrollmentConfigDAL: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findById: vi.fn(),
      findByApplicationId: vi.fn(),
      findKeytabByApplicationAndProfile: vi.fn(),
      primaryNode: vi.fn(() => "primary")
    },
    appConnectionService: { validateAppConnectionUsageById: vi.fn() },
    appConnectionDAL: { findById: vi.fn() },
    licenseService: { getPlan: vi.fn() },
    certificateProfileDAL: { findById: vi.fn() },
    certificatePolicyDAL: { findById: vi.fn().mockResolvedValue({ validity: { max: "90d" } }), lockById: vi.fn() },
    certificatePolicyService: { validateRequestAgainstPolicy: vi.fn() },
    certificateAuthorityDAL: { findById: vi.fn(), findByIdWithAssociatedCa: vi.fn() },
    certificateAuthoritySecretDAL: { findOne: vi.fn() },
    kmsDataKeyService: { getProjectCertificateKmsKeyId: vi.fn().mockResolvedValue("kms-id") },
    kmsKeyService: { encryptWithKmsKey: vi.fn(), decryptWithKmsKey: vi.fn() },
    permissionService: { getResourcePermission: vi.fn() },
    keyStore: { getItem: vi.fn() }
  };

  const service = pkiApplicationEnrollmentServiceFactory(
    deps as unknown as Parameters<typeof pkiApplicationEnrollmentServiceFactory>[0]
  );

  const set = (config: Parameters<typeof service.setMicrosoftAutoenrollmentEnrollment>[0]["config"]) =>
    service.setMicrosoftAutoenrollmentEnrollment({
      applicationId: APPLICATION_ID,
      profileId: PROFILE_ID,
      config,
      ...actor
    });

  const encodeKeytab = (keyVersions: number[]) =>
    buildTestKeytab(keyVersions.map((keyVersion) => buildTestKeytabEntry({ keyVersion }))).toString("base64");

  const withExistingConfig = () => {
    deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile.mockResolvedValue({
      id: "junction-id",
      microsoftAutoenrollmentConfigId: existingConfig.id
    });
    deps.microsoftAutoenrollmentEnrollmentConfigDAL.findById.mockResolvedValue(existingConfig);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    searchDirectoryGroups.mockResolvedValue({ groups: [], isTruncated: false });
    resolveDirectorySecurityGroupNames.mockImplementation(async ({ sids }: { sids: string[] }) =>
      Object.fromEntries(sids.map((sid) => [sid, "Servers"]))
    );
    deps.pkiApplicationDAL.findById.mockResolvedValue({ id: APPLICATION_ID, projectId: "project-id", name: "fleet" });
    deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile.mockResolvedValue({
      id: "junction-id",
      microsoftAutoenrollmentConfigId: null
    });
    deps.permissionService.getResourcePermission.mockResolvedValue({
      permission: createMongoAbility([{ action: "manage", subject: "all" }])
    });
    deps.licenseService.getPlan.mockResolvedValue(
      Plan.restore({ ...testFeatures(), pkiMicrosoftAutoenrollment: true })
    );
    deps.certificateProfileDAL.findById.mockResolvedValue({
      id: PROFILE_ID,
      caId: "ca-id",
      slug: "web-servers",
      certificatePolicyId: "policy-id"
    });
    deps.certificatePolicyService.validateRequestAgainstPolicy.mockReturnValue({ isValid: true, errors: [] });
    deps.certificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue({
      id: "ca-id",
      externalCa: null,
      internalCa: { keyAlgorithm: "RSA_2048" }
    });
    deps.appConnectionService.validateAppConnectionUsageById.mockResolvedValue({
      id: CONNECTION_ID,
      name: "corp-ad",
      app: AppConnection.LDAP,
      credentials: { provider: LdapProvider.ActiveDirectory }
    });
    deps.appConnectionDAL.findById.mockResolvedValue({ id: CONNECTION_ID, name: "corp-ad" });
    deps.kmsKeyService.encryptWithKmsKey.mockResolvedValue(async ({ plainText }: { plainText: Buffer }) => ({
      cipherTextBlob: Buffer.concat([Buffer.from("encrypted:"), plainText])
    }));
    deps.kmsKeyService.decryptWithKmsKey.mockResolvedValue(async ({ cipherTextBlob }: { cipherTextBlob: Buffer }) =>
      Buffer.concat([Buffer.from("decrypted:"), cipherTextBlob])
    );
    deps.microsoftAutoenrollmentEnrollmentConfigDAL.create.mockResolvedValue({ id: "new-config-id" });
    deps.microsoftAutoenrollmentEnrollmentConfigDAL.update.mockImplementation(
      async (filter: { id: string }, update: Record<string, unknown>) => [
        { ...existingConfig, ...update, id: filter.id }
      ]
    );
    deps.microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId.mockResolvedValue([]);
    deps.microsoftAutoenrollmentEnrollmentConfigDAL.findKeytabByApplicationAndProfile.mockResolvedValue(undefined);
    deps.keyStore.getItem.mockResolvedValue(null);
    vi.spyOn(crypto, "isFipsModeEnabled").mockReturnValue(false);
  });

  describe("setMicrosoftAutoenrollmentEnrollment", () => {
    test("refuses an actor without permission to edit enrollment", async () => {
      deps.permissionService.getResourcePermission.mockResolvedValue({ permission: createMongoAbility([]) });

      await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toBeInstanceOf(
        ForbiddenError
      );
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("refuses an organization whose plan does not include Microsoft Autoenrollment", async () => {
      deps.licenseService.getPlan.mockResolvedValue(Plan.restore(testFeatures()));

      await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toThrow();
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("answers a second first-time save that loses the race with a conflict, not a server error", async () => {
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.create.mockRejectedValue(
        new DatabaseError({ error: { code: DatabaseErrorCode.UniqueViolation }, name: "Create" })
      );

      await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toBeInstanceOf(
        ConflictError
      );
    });

    test("answers a save whose profile or connection was removed mid-save with a conflict, not a server error", async () => {
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.create.mockRejectedValue(
        new DatabaseError({ error: { code: DatabaseErrorCode.ForeignKeyViolation }, name: "Create" })
      );

      await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toThrow(
        "while this save was in progress"
      );
    });

    test("refuses an update when the plan no longer includes Microsoft Autoenrollment", async () => {
      withExistingConfig();
      deps.licenseService.getPlan.mockResolvedValue(Plan.restore(testFeatures()));

      await expect(set({ renewBeforeDays: 10 })).rejects.toThrow();
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).not.toHaveBeenCalled();
    });

    test.each([
      [
        "both a keytab and a keytab to reuse",
        { keytab: encodeKeytab([3]), reuseKeytab: { profileId: OTHER_PROFILE_ID } }
      ],
      ["no keytab when turning it on", {}]
    ])("refuses %s", async (_name, keytabFields) => {
      await expect(set({ connectionId: CONNECTION_ID, ...keytabFields })).rejects.toBeInstanceOf(BadRequestError);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("refuses to turn it on without an LDAP connection", async () => {
      await expect(set({ keytab: encodeKeytab([3]) })).rejects.toBeInstanceOf(BadRequestError);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("refuses a profile that issues from an external CA", async () => {
      deps.certificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue({
        id: "ca-id",
        externalCa: { type: CaType.ACME }
      });

      await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toBeInstanceOf(
        BadRequestError
      );
    });

    test.each([
      ["a file that is not a keytab", Buffer.from("not a keytab").toString("base64")],
      [
        "a keytab with no AES keys",
        buildTestKeytab([
          buildTestKeytabEntry({ encryptionType: 23 as KerberosEncryptionType, key: Buffer.alloc(16) })
        ]).toString("base64")
      ]
    ])("refuses %s", async (_name, keytab) => {
      await expect(set({ connectionId: CONNECTION_ID, keytab })).rejects.toBeInstanceOf(BadRequestError);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test.each([
      ["an elliptic curve profile on an RSA certificate authority", "EC_prime256v1", "RSA_2048"],
      ["an RSA profile on an elliptic curve certificate authority", undefined, "EC_prime256v1"],
      ["an RSA profile on a post-quantum certificate authority", "RSA_2048", "ML-DSA-65"]
    ])(
      "refuses %s, because Windows' request could not be signed",
      async (_name, profileKeyAlgorithm, caKeyAlgorithm) => {
        deps.certificateProfileDAL.findById.mockResolvedValue({
          id: PROFILE_ID,
          caId: "ca-id",
          slug: "web-servers",
          defaults: { keyAlgorithm: profileKeyAlgorithm }
        });
        deps.certificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue({
          id: "ca-id",
          externalCa: null,
          internalCa: { keyAlgorithm: caKeyAlgorithm }
        });

        await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toThrow(
          /cannot sign that request/
        );
        expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
      }
    );

    test("accepts an elliptic curve profile on an elliptic curve certificate authority", async () => {
      deps.certificateProfileDAL.findById.mockResolvedValue({
        id: PROFILE_ID,
        caId: "ca-id",
        slug: "web-servers",
        defaults: { keyAlgorithm: "EC_secp384r1" }
      });
      deps.certificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue({
        id: "ca-id",
        externalCa: null,
        internalCa: { keyAlgorithm: "EC_prime256v1" }
      });

      await set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).toHaveBeenCalled();
    });

    test("refuses a keytab with keys for more than one service principal", async () => {
      const keytab = buildTestKeytab([
        buildTestKeytabEntry(),
        buildTestKeytabEntry({ principal: "HTTP/other.example.com" })
      ]).toString("base64");

      await expect(set({ connectionId: CONNECTION_ID, keytab })).rejects.toThrow(/more than one service principal/);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("refuses an LDAP connection that cannot search Active Directory", async () => {
      searchDirectoryGroups.mockRejectedValue(new Error("ECONNRESET"));

      await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toThrow(
        /Could not search Active Directory/
      );
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("names the allowed groups from a new LDAP connection, which is also its reachability check", async () => {
      const groupSid = "S-1-5-21-1111111111-2222222222-3333333333-1300";
      resolveDirectorySecurityGroupNames.mockResolvedValue({ [groupSid]: "Operators" });

      await set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]), allowedGroupSids: [groupSid] });

      expect(resolveDirectorySecurityGroupNames).toHaveBeenCalledTimes(1);
      expect(searchDirectoryGroups).not.toHaveBeenCalled();
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).toHaveBeenCalledWith(
        expect.objectContaining({ allowedGroups: JSON.stringify([{ sid: groupSid, name: "Operators" }]) }),
        "tx"
      );
    });

    test("refuses a new LDAP connection that cannot name the allowed groups", async () => {
      resolveDirectorySecurityGroupNames.mockRejectedValue(new Error("ECONNRESET"));

      await expect(
        set({
          connectionId: CONNECTION_ID,
          keytab: encodeKeytab([3]),
          allowedGroupSids: ["S-1-5-21-1111111111-2222222222-3333333333-1300"]
        })
      ).rejects.toThrow(/Could not search Active Directory/);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("checks the caller may use the LDAP connection", async () => {
      deps.appConnectionService.validateAppConnectionUsageById.mockRejectedValue(
        new BadRequestError({ message: "no" })
      );

      await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toBeInstanceOf(
        BadRequestError
      );
      expect(deps.appConnectionService.validateAppConnectionUsageById).toHaveBeenCalledWith(
        AppConnection.LDAP,
        { connectionId: CONNECTION_ID, projectId: "project-id" },
        expect.objectContaining({ id: "user-id" })
      );
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("takes the service principal and key version from the newest key in an uploaded keytab", async () => {
      const result = await set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([2, 5, 4]) });

      const [created] = deps.microsoftAutoenrollmentEnrollmentConfigDAL.create.mock.calls[0] as [
        Record<string, unknown>
      ];
      expect(created).toMatchObject({
        servicePrincipalName: SERVICE_PRINCIPAL_NAME,
        keyVersion: 5,
        renewBeforeDays: 42,
        allowedGroups: null,
        appConnectionId: CONNECTION_ID,
        applicationProfileId: "junction-id"
      });
      expect((created.encryptedKeytab as Buffer).subarray(0, 10).toString()).toBe("encrypted:");
      expect(deps.pkiApplicationProfileDAL.update).toHaveBeenCalledWith(
        { applicationId: APPLICATION_ID, profileId: PROFILE_ID },
        { microsoftAutoenrollmentConfigId: "new-config-id" },
        "tx"
      );
      expect(result).toMatchObject({ keytabSource: MicrosoftAutoenrollmentKeytabSource.Uploaded });
    });

    test("reuses the stored keytab of the named profile in the same application as is, and names that profile", async () => {
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findKeytabByApplicationAndProfile.mockResolvedValue({
        encryptedKeytab: existingConfig.encryptedKeytab,
        servicePrincipalName: SERVICE_PRINCIPAL_NAME,
        keyVersion: 3,
        profileId: OTHER_PROFILE_ID,
        profileName: "laptops"
      });

      const result = await set({
        connectionId: CONNECTION_ID,
        reuseKeytab: { profileId: OTHER_PROFILE_ID }
      });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.findKeytabByApplicationAndProfile).toHaveBeenCalledWith(
        APPLICATION_ID,
        OTHER_PROFILE_ID,
        "primary"
      );
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).toHaveBeenCalledWith(
        expect.objectContaining({
          encryptedKeytab: existingConfig.encryptedKeytab,
          servicePrincipalName: SERVICE_PRINCIPAL_NAME,
          keyVersion: 3
        }),
        "tx"
      );
      expect(deps.kmsKeyService.decryptWithKmsKey).not.toHaveBeenCalled();
      expect(deps.kmsKeyService.encryptWithKmsKey).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        keytabSource: MicrosoftAutoenrollmentKeytabSource.Reused,
        reusedFromProfileId: OTHER_PROFILE_ID,
        reusedFromProfileName: "laptops",
        connectionName: "corp-ad"
      });
    });

    test("refuses to reuse the keytab of a profile with no Microsoft Autoenrollment keytab in this application, which covers a profile of another application", async () => {
      await expect(set({ connectionId: CONNECTION_ID, reuseKeytab: { profileId: OTHER_PROFILE_ID } })).rejects.toThrow(
        `Profile '${OTHER_PROFILE_ID}' has no Microsoft Autoenrollment keytab in application 'fleet'`
      );
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.findKeytabByApplicationAndProfile).toHaveBeenCalledWith(
        APPLICATION_ID,
        OTHER_PROFILE_ID,
        "primary"
      );
      expect(deps.kmsKeyService.decryptWithKmsKey).not.toHaveBeenCalled();
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("refuses to reuse the keytab of the profile being configured", async () => {
      await expect(set({ connectionId: CONNECTION_ID, reuseKeytab: { profileId: PROFILE_ID } })).rejects.toThrow(
        "A profile cannot reuse its own keytab"
      );
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("an update without a keytab keeps the keytab and unsent fields, and bumps the template revision", async () => {
      withExistingConfig();

      const result = await set({ renewBeforeDays: 10 });

      const [filter, update] = deps.microsoftAutoenrollmentEnrollmentConfigDAL.update.mock.calls[0] as [
        { id: string },
        Record<string, unknown>
      ];
      expect(filter).toEqual({
        id: existingConfig.id,
        templateMajorRevision: existingConfig.templateMajorRevision,
        templateMinorRevision: existingConfig.templateMinorRevision
      });
      expect(update).toMatchObject({
        encryptedKeytab: existingConfig.encryptedKeytab,
        appConnectionId: CONNECTION_ID,
        allowedGroups: JSON.stringify([{ sid: SERVERS_SID, name: "Servers" }]),
        renewBeforeDays: 10,
        $incr: { templateMinorRevision: 1 }
      });
      expect(deps.appConnectionService.validateAppConnectionUsageById).not.toHaveBeenCalled();
      expect(result.microsoftAutoenrollment.effectiveRenewBeforeSeconds).toBe(864000);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
      expect(result.keytabSource).toBe(MicrosoftAutoenrollmentKeytabSource.Unchanged);
      expect(result.microsoftAutoenrollment).toMatchObject({
        renewBeforeDays: 10,
        servicePrincipalName: existingConfig.servicePrincipalName,
        connectionId: existingConfig.appConnectionId
      });
    });

    test("the state reports the renewal window Windows is given, below 20% of the validity", async () => {
      withExistingConfig();

      const result = await set({ renewBeforeDays: 42 });

      expect(result.microsoftAutoenrollment).toMatchObject({
        renewBeforeDays: 42,
        effectiveRenewBeforeSeconds: 1555199
      });
    });

    test("reads a policy maximum in months as months, not minutes", async () => {
      withExistingConfig();
      deps.certificatePolicyDAL.findById.mockResolvedValue({ validity: { max: "6m" } });

      const result = await set({ renewBeforeDays: 42 });

      expect(result.microsoftAutoenrollment.effectiveRenewBeforeSeconds).toBe(180 * 86400 * 0.2 - 1);
    });

    test("refuses turning the method on when the policy restricts custom extensions without allowing the Windows extensions", async () => {
      deps.certificatePolicyDAL.findById.mockResolvedValue({
        customExtensions: [{ oid: "1.3.6.1.4.1.311.25.2", allowed: ["*"] }]
      });

      await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toThrow(
        "Allow 1.3.6.1.4.1.311.21.7 in the policy's custom extension rules"
      );
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("re-checks the policy's extension rules under a lock on the policy inside the save", async () => {
      deps.certificatePolicyDAL.findById
        .mockResolvedValueOnce({ validity: { max: "90d" } })
        .mockResolvedValueOnce({ validity: { max: "90d" } })
        .mockResolvedValue({ customExtensions: [{ oid: "1.2.3.4", allowed: ["*"] }] });

      await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toThrow(
        "in the policy's custom extension rules"
      );
      expect(deps.certificatePolicyDAL.lockById).toHaveBeenCalledWith("policy-id", "tx");
      expect(deps.certificateAuthoritySecretDAL.findOne).toHaveBeenCalledWith({ caId: "ca-id" }, "tx");
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("refuses turning the method on while the profile's certificate authority waits for its certificate", async () => {
      deps.certificateAuthorityDAL.findById.mockResolvedValueOnce({ id: "ca-id", status: "pending-certificate" });
      deps.certificatePolicyDAL.findById.mockResolvedValue({ validity: { max: "90d" } });

      await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toThrow(
        "still waiting for its certificate"
      );
      expect(deps.certificateAuthorityDAL.findById).toHaveBeenCalledWith("ca-id", "tx");
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("keeps saving settings for a profile with the method on after its certificate authority is disabled", async () => {
      withExistingConfig();
      deps.certificateAuthorityDAL.findById.mockResolvedValue({ id: "ca-id", status: "disabled" });
      deps.certificatePolicyDAL.findById.mockResolvedValue({ validity: { max: "90d" } });

      await set({ renewBeforeDays: 10 }).finally(() =>
        deps.certificateAuthorityDAL.findById.mockResolvedValue(undefined)
      );

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).toHaveBeenCalled();
    });

    test("re-reads the profile inside the save and refuses a key the certificate authority can no longer sign", async () => {
      const profile = { id: PROFILE_ID, caId: "ca-id", slug: "web-servers", certificatePolicyId: "policy-id" };
      deps.certificateProfileDAL.findById.mockImplementation(async (_id: string, tx?: string) =>
        tx === "tx" ? { ...profile, defaults: { keyAlgorithm: "EC_prime256v1" } } : profile
      );
      deps.certificatePolicyDAL.findById.mockResolvedValue({ validity: { max: "90d" } });

      await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toThrow(/elliptic curve/);
      expect(deps.certificateProfileDAL.findById).toHaveBeenCalledWith(PROFILE_ID, "tx");
      expect(deps.certificateAuthorityDAL.findByIdWithAssociatedCa).toHaveBeenLastCalledWith("ca-id", "tx");
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("refuses a save before writing anything when the profile's TTL exceeds its policy's maximum", async () => {
      withExistingConfig();
      deps.certificateProfileDAL.findById.mockResolvedValue({
        id: PROFILE_ID,
        caId: "ca-id",
        slug: "web-servers",
        certificatePolicyId: "policy-id",
        defaults: { ttlDays: 30 }
      });
      deps.certificatePolicyDAL.findById.mockResolvedValue({ validity: { max: "10d" } });

      await expect(set({ renewBeforeDays: 10 })).rejects.toThrow("exceeds the policy's maximum validity");
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).not.toHaveBeenCalled();
    });

    test("treats reusing the keytab this profile already has as no change", async () => {
      withExistingConfig();
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findKeytabByApplicationAndProfile.mockResolvedValue({
        encryptedKeytab: existingConfig.encryptedKeytab,
        servicePrincipalName: SERVICE_PRINCIPAL_NAME,
        keyVersion: existingConfig.keyVersion,
        profileId: OTHER_PROFILE_ID,
        profileName: "laptops"
      });

      const result = await set({ reuseKeytab: { profileId: OTHER_PROFILE_ID } });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).not.toHaveBeenCalled();
      expect(result).toMatchObject({ isChanged: false, keytabSource: MicrosoftAutoenrollmentKeytabSource.Unchanged });
    });

    test("treats a re-upload of the stored keytab as no change", async () => {
      withExistingConfig();
      const sameKeytab = encodeKeytab([3]);
      deps.kmsKeyService.decryptWithKmsKey.mockResolvedValue(async () => Buffer.from(sameKeytab, "base64"));

      const result = await set({ keytab: sameKeytab });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).not.toHaveBeenCalled();
      expect(deps.kmsKeyService.encryptWithKmsKey).not.toHaveBeenCalled();
      expect(result).toMatchObject({ isChanged: false, keytabSource: MicrosoftAutoenrollmentKeytabSource.Unchanged });
    });

    test("an update that changes nothing keeps the template revision", async () => {
      withExistingConfig();

      await set({ renewBeforeDays: existingConfig.renewBeforeDays, allowedGroupSids: [SERVERS_SID] });
      await set({});

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).not.toHaveBeenCalled();
    });

    test("turning on accept any TLS channel binding is a config change that bumps the template revision", async () => {
      withExistingConfig();

      const result = await set({ allowAnyChannelBinding: true });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: existingConfig.id }),
        expect.objectContaining({ allowAnyChannelBinding: true, $incr: { templateMinorRevision: 1 } }),
        "tx"
      );
      expect(result.isChanged).toBe(true);
      expect(result.microsoftAutoenrollment.allowAnyChannelBinding).toBe(true);
      expect(result.microsoftAutoenrollment.channelBinding.status).toBe(
        MicrosoftAutoenrollmentChannelBindingStatus.NotChecked
      );
    });

    test("an update that leaves out allowAnyChannelBinding keeps the stored value", async () => {
      withExistingConfig();
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findById.mockResolvedValue({
        ...existingConfig,
        allowAnyChannelBinding: true
      });

      await set({ renewBeforeDays: 10 });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ allowAnyChannelBinding: true }),
        "tx"
      );
    });

    test("turning Microsoft Autoenrollment on checks TLS channel bindings unless asked otherwise", async () => {
      await set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).toHaveBeenCalledWith(
        expect.objectContaining({ allowAnyChannelBinding: false }),
        "tx"
      );
    });

    test("refuses an allowed group listed twice, naming it", async () => {
      await expect(
        set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]), allowedGroupSids: [SERVERS_SID, SERVERS_SID] })
      ).rejects.toThrow(`The allowed group '${SERVERS_SID}' is listed more than once`);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("clearing the allowed groups sends every computer through", async () => {
      withExistingConfig();

      const result = await set({ allowedGroupSids: null });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: existingConfig.id }),
        expect.objectContaining({ allowedGroups: null }),
        "tx"
      );
      expect(result.microsoftAutoenrollment.allowedGroups).toEqual([]);
    });

    test("refuses changed allowed groups on the stored LDAP connection when the caller may not use that connection, before asking Active Directory", async () => {
      withExistingConfig();
      deps.appConnectionService.validateAppConnectionUsageById.mockRejectedValue(
        new BadRequestError({ message: "no" })
      );

      await expect(set({ allowedGroupSids: ["S-1-5-21-1111111111-2222222222-3333333333-1300"] })).rejects.toThrow("no");
      expect(deps.appConnectionService.validateAppConnectionUsageById).toHaveBeenCalledWith(
        AppConnection.LDAP,
        { connectionId: CONNECTION_ID, projectId: "project-id" },
        expect.objectContaining({ id: "user-id" })
      );
      expect(resolveDirectorySecurityGroupNames).not.toHaveBeenCalled();
      expect(searchDirectoryGroups).not.toHaveBeenCalled();
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).not.toHaveBeenCalled();
    });

    test("clears the allowed groups without checking the stored LDAP connection, since nothing is looked up", async () => {
      withExistingConfig();
      deps.appConnectionService.validateAppConnectionUsageById.mockRejectedValue(
        new BadRequestError({ message: "no" })
      );

      const result = await set({ allowedGroupSids: [] });

      expect(deps.appConnectionService.validateAppConnectionUsageById).not.toHaveBeenCalled();
      expect(resolveDirectorySecurityGroupNames).not.toHaveBeenCalled();
      expect(result.microsoftAutoenrollment.allowedGroups).toEqual([]);
    });

    test("refuses an update when the settings changed since they were read, instead of restoring the old ones", async () => {
      withExistingConfig();
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.update.mockResolvedValue([]);

      await expect(set({ renewBeforeDays: 10 })).rejects.toBeInstanceOf(ConflictError);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.findById).toHaveBeenCalledWith(
        existingConfig.id,
        "primary"
      );
    });

    test("keeps the stored LDAP connection without checking it when the allowed groups do not change", async () => {
      withExistingConfig();

      const result = await set({ renewBeforeDays: 10 });

      expect(deps.appConnectionService.validateAppConnectionUsageById).not.toHaveBeenCalled();
      expect(deps.appConnectionDAL.findById).toHaveBeenCalledWith(CONNECTION_ID);
      expect(result.connectionName).toBe("corp-ad");
    });

    test("reads the profile's enrollment once, from the primary", async () => {
      withExistingConfig();

      await set({ renewBeforeDays: 10 });

      expect(deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile).toHaveBeenCalledTimes(1);
      expect(deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile).toHaveBeenCalledWith(
        APPLICATION_ID,
        PROFILE_ID,
        "primary"
      );
    });

    describe("key algorithm the certificate policy allows", () => {
      const withProfileKeyAlgorithm = (keyAlgorithm?: string) =>
        deps.certificateProfileDAL.findById.mockResolvedValue({
          id: PROFILE_ID,
          caId: "ca-id",
          slug: "web-servers",
          certificatePolicyId: "policy-id",
          defaults: keyAlgorithm ? { keyAlgorithm } : null
        });

      const policyRefusesKey = () =>
        deps.certificatePolicyService.validateRequestAgainstPolicy.mockReturnValue({
          isValid: false,
          errors: ["Key algorithm 'RSA_2048' is not allowed by this policy"]
        });

      test("checks the RSA 2048 key Windows is offered when the profile has no default key algorithm", async () => {
        withProfileKeyAlgorithm();

        await set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) });

        expect(deps.certificatePolicyService.validateRequestAgainstPolicy).toHaveBeenCalledWith(
          expect.anything(),
          { keyAlgorithm: "RSA_2048" },
          { skipRequired: true }
        );
      });

      test("refuses a profile with no default key algorithm under a policy that does not allow RSA 2048, saying what to change", async () => {
        withProfileKeyAlgorithm();
        policyRefusesKey();

        await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toThrow(
          "Profile 'web-servers' has no default key algorithm, so Windows requests RSA 2048 keys, but the profile's certificate policy does not allow that key algorithm"
        );
        expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
      });

      test("refuses a profile whose default key algorithm the policy does not allow, naming it", async () => {
        withProfileKeyAlgorithm("RSA_3072");
        policyRefusesKey();

        await expect(set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]) })).rejects.toThrow(
          /Profile 'web-servers' asks Windows for RSA 3072 keys, .*Set the profile's default key algorithm to one the policy allows, or allow RSA 3072 in the policy/
        );
        expect(deps.certificatePolicyService.validateRequestAgainstPolicy).toHaveBeenCalledWith(
          expect.anything(),
          { keyAlgorithm: "RSA_3072" },
          { skipRequired: true }
        );
      });

      test("refuses an edit once the policy no longer allows the profile's key", async () => {
        withExistingConfig();
        policyRefusesKey();

        await expect(set({ renewBeforeDays: 10 })).rejects.toBeInstanceOf(BadRequestError);
        expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).not.toHaveBeenCalled();
      });
    });
  });

  describe("allowed group names", () => {
    const OPERATORS_SID = "S-1-5-21-1111111111-2222222222-3333333333-1300";

    test("does not change anything when the stored groups are sent back in another order", async () => {
      deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile.mockResolvedValue({
        id: "junction-id",
        microsoftAutoenrollmentConfigId: existingConfig.id
      });
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findById.mockResolvedValue({
        ...existingConfig,
        allowedGroups: [
          { sid: SERVERS_SID, name: "Servers" },
          { sid: OPERATORS_SID, name: "Operators" }
        ]
      });

      await set({ allowedGroupSids: [OPERATORS_SID, SERVERS_SID] });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).not.toHaveBeenCalled();
      expect(resolveDirectorySecurityGroupNames).not.toHaveBeenCalled();
    });

    test("stores the group names when the groups change and serves them without asking Active Directory", async () => {
      withExistingConfig();
      resolveDirectorySecurityGroupNames.mockResolvedValue({ [OPERATORS_SID]: "Operators" });

      const result = await set({ allowedGroupSids: [OPERATORS_SID] });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: existingConfig.id }),
        expect.objectContaining({ allowedGroups: JSON.stringify([{ sid: OPERATORS_SID, name: "Operators" }]) }),
        "tx"
      );
      expect(resolveDirectorySecurityGroupNames).toHaveBeenCalledTimes(1);
      expect(result.microsoftAutoenrollment.allowedGroups).toEqual([{ sid: OPERATORS_SID, name: "Operators" }]);
    });

    test("does not ask Active Directory for names when only the renewal setting changes", async () => {
      deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile.mockResolvedValue({
        id: "junction-id",
        microsoftAutoenrollmentConfigId: existingConfig.id
      });
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findById.mockResolvedValue({
        ...existingConfig,
        allowedGroups: [
          { sid: SERVERS_SID, name: "Servers" },
          { sid: OPERATORS_SID, name: "Operators" }
        ]
      });

      await set({ renewBeforeDays: 10 });

      expect(resolveDirectorySecurityGroupNames).not.toHaveBeenCalled();
    });

    describe("when the LDAP connection changes", () => {
      const NEW_CONNECTION_ID = "4c9a1f7e-2b4d-4e6f-8a0b-1c2d3e4f5a6b";

      beforeEach(() => {
        withExistingConfig();
        deps.appConnectionService.validateAppConnectionUsageById.mockResolvedValue({
          id: NEW_CONNECTION_ID,
          name: "branch-ad",
          app: AppConnection.LDAP,
          credentials: { provider: LdapProvider.ActiveDirectory }
        });
      });

      test("refuses the stored groups the new directory does not have, naming them, instead of keeping their old names", async () => {
        resolveDirectorySecurityGroupNames.mockResolvedValue({ [SERVERS_SID]: null });

        await expect(set({ connectionId: NEW_CONNECTION_ID })).rejects.toThrow(
          `The LDAP connection 'branch-ad' does not find 'Servers' (${SERVERS_SID}) as security groups in its directory.`
        );
        expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).not.toHaveBeenCalled();
      });

      test("names only the groups the new directory does not have", async () => {
        resolveDirectorySecurityGroupNames.mockResolvedValue({ [SERVERS_SID]: "Servers", [OPERATORS_SID]: null });

        const error = await set({
          connectionId: NEW_CONNECTION_ID,
          allowedGroupSids: [SERVERS_SID, OPERATORS_SID]
        }).catch((err: Error) => err);

        expect(error).toBeInstanceOf(BadRequestError);
        expect((error as Error).message).toContain(OPERATORS_SID);
        expect((error as Error).message).not.toContain(`'Servers'`);
      });

      test("saves the groups with the names the new directory gives them", async () => {
        resolveDirectorySecurityGroupNames.mockResolvedValue({ [SERVERS_SID]: "Branch Servers" });

        await set({ connectionId: NEW_CONNECTION_ID });

        expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).toHaveBeenCalledWith(
          expect.objectContaining({ id: existingConfig.id }),
          expect.objectContaining({
            appConnectionId: NEW_CONNECTION_ID,
            allowedGroups: JSON.stringify([{ sid: SERVERS_SID, name: "Branch Servers" }])
          }),
          "tx"
        );
      });
    });

    test("keeps the stored groups and their names when Active Directory can't be reached", async () => {
      withExistingConfig();
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findById.mockResolvedValue({
        ...existingConfig,
        allowedGroups: [...existingConfig.allowedGroups, { sid: `${TEST_GROUP_SID_PREFIX}1300`, name: "Operators" }]
      });
      resolveDirectorySecurityGroupNames.mockRejectedValue(new Error("ECONNRESET"));

      await set({ allowedGroupSids: [SERVERS_SID], renewBeforeDays: 10 });

      expect(resolveDirectorySecurityGroupNames).toHaveBeenCalled();
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: existingConfig.id }),
        expect.objectContaining({ allowedGroups: JSON.stringify([{ sid: SERVERS_SID, name: "Servers" }]) }),
        "tx"
      );
    });

    test("refuses a new group it can't check while Active Directory can't be searched, naming the cause", async () => {
      withExistingConfig();
      resolveDirectorySecurityGroupNames.mockRejectedValue(new BadRequestError({ message: "Invalid Credentials" }));

      await expect(set({ allowedGroupSids: [SERVERS_SID, OPERATORS_SID] })).rejects.toThrow(
        "Check that the directory is reachable and the connection's credentials are valid. Details: Invalid Credentials"
      );
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).not.toHaveBeenCalled();
    });
  });

  describe("getEnrollment", () => {
    const get = () =>
      service.getEnrollment({
        applicationId: APPLICATION_ID,
        profileId: PROFILE_ID,
        ...actor
      });

    test("says why the method can't be turned on when the profile's policy refuses the key Windows would ask for", async () => {
      deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile.mockResolvedValue({
        id: "junction-id",
        microsoftAutoenrollmentConfigId: null
      });
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId.mockResolvedValue([]);
      deps.certificatePolicyDAL.findById.mockResolvedValue({ validity: { max: "90d" } });
      deps.certificatePolicyService.validateRequestAgainstPolicy.mockReturnValueOnce({ isValid: false, errors: [] });

      const result = await get();

      expect(result.microsoftAutoenrollmentUnsupportedReason).toMatch(
        /has no default key algorithm, so Windows requests RSA 2048 keys/
      );
    });

    test("lists the other profiles that can share a keytab, and reads this profile's settings by its own pointer", async () => {
      deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile.mockResolvedValue({
        id: "junction-id",
        microsoftAutoenrollmentConfigId: existingConfig.id
      });
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findById.mockResolvedValue(existingConfig);
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId.mockResolvedValue([
        {
          id: existingConfig.id,
          servicePrincipalName: SERVICE_PRINCIPAL_NAME,
          keyVersion: 3,
          appConnectionId: CONNECTION_ID,
          profileId: PROFILE_ID,
          profileName: "web-servers"
        },
        {
          id: "other-config-id",
          servicePrincipalName: SERVICE_PRINCIPAL_NAME,
          keyVersion: 2,
          appConnectionId: CONNECTION_ID,
          profileId: OTHER_PROFILE_ID,
          profileName: "laptops"
        }
      ]);

      const result = await get();

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.findById).toHaveBeenCalledWith(existingConfig.id);
      expect(result.microsoftAutoenrollment).toMatchObject({
        id: existingConfig.id,
        templateName: "web-servers",
        allowedGroups: existingConfig.allowedGroups
      });
      expect(result.microsoftAutoenrollmentOtherProfiles).toEqual([
        {
          profileId: OTHER_PROFILE_ID,
          profileName: "laptops",
          servicePrincipalName: SERVICE_PRINCIPAL_NAME,
          keyVersion: 2,
          connectionId: CONNECTION_ID
        }
      ]);
    });

    test("still returns every method when the profile's TTL exceeds its policy's maximum, with no effective renewal period", async () => {
      deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile.mockResolvedValue({
        id: "junction-id",
        microsoftAutoenrollmentConfigId: existingConfig.id
      });
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findById.mockResolvedValue(existingConfig);
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId.mockResolvedValue([]);
      deps.certificateProfileDAL.findById.mockResolvedValue({
        id: PROFILE_ID,
        caId: "ca-id",
        slug: "web-servers",
        certificatePolicyId: "policy-id",
        defaults: { ttlDays: 30 }
      });
      deps.certificatePolicyDAL.findById.mockResolvedValue({ validity: { max: "10d" } });

      const result = await get();

      expect(result.microsoftAutoenrollment).toMatchObject({ effectiveRenewBeforeSeconds: null });
    });

    test("has no unsupported reason for an RSA profile on an RSA certificate authority", async () => {
      const result = await get();

      expect(result.microsoftAutoenrollmentUnsupportedReason).toBeNull();
    });

    test("gives the reason Microsoft Autoenrollment would be refused for a profile with no default key on an elliptic curve certificate authority", async () => {
      deps.certificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue({
        id: "ca-id",
        externalCa: null,
        internalCa: { keyAlgorithm: "EC_prime256v1" }
      });

      const result = await get();

      expect(result.microsoftAutoenrollmentUnsupportedReason).toMatch(
        /Profile 'web-servers' has no default key algorithm, so Windows requests RSA 2048 keys, but its certificate authority's ECDSA P256 key cannot sign that request/
      );
    });

    describe("channel binding status", () => {
      const withConfiguredProfile = (allowAnyChannelBinding: boolean) => {
        deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile.mockResolvedValue({
          id: "junction-id",
          microsoftAutoenrollmentConfigId: existingConfig.id
        });
        deps.microsoftAutoenrollmentEnrollmentConfigDAL.findById.mockResolvedValue({
          ...existingConfig,
          allowAnyChannelBinding
        });
      };

      const ENDPOINT_KEY = "app.example.com:443";

      const withKeyStoreItems = (items: Record<string, string>) =>
        deps.keyStore.getItem.mockImplementation(async (key: string) => items[key] ?? null);

      test("is not-checked before the instance has tried to read its own TLS certificate", async () => {
        withConfiguredProfile(false);

        const result = await get();

        expect(result.microsoftAutoenrollment?.channelBinding.status).toBe(
          MicrosoftAutoenrollmentChannelBindingStatus.NotChecked
        );
        expect(result.microsoftAutoenrollment?.channelBinding.reason).toContain("first enrollment request");
      });

      test("is enforced once the instance has read its own TLS certificate", async () => {
        withConfiguredProfile(false);
        withKeyStoreItems({
          [KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindings(ENDPOINT_KEY)]: JSON.stringify([
            { binding: "11".repeat(16), seenAt: new Date().toISOString() }
          ])
        });

        const result = await get();

        expect(result.microsoftAutoenrollment?.channelBinding).toEqual({
          status: MicrosoftAutoenrollmentChannelBindingStatus.Enforced,
          reason: null
        });
      });

      test("is unverifiable with the recorded reason when the last read of the certificate failed", async () => {
        withConfiguredProfile(false);
        withKeyStoreItems({
          [KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindingsLastFailure(ENDPOINT_KEY)]:
            "This instance cannot read the TLS certificate it serves at app.example.com:443."
        });

        const result = await get();

        expect(result.microsoftAutoenrollment?.channelBinding).toEqual({
          status: MicrosoftAutoenrollmentChannelBindingStatus.Unverifiable,
          reason: "This instance cannot read the TLS certificate it serves at app.example.com:443."
        });
      });

      test("is unverifiable in FIPS mode, saying why", async () => {
        withConfiguredProfile(false);
        vi.mocked(crypto.isFipsModeEnabled).mockReturnValue(true);

        const result = await get();

        expect(result.microsoftAutoenrollment?.channelBinding.status).toBe(
          MicrosoftAutoenrollmentChannelBindingStatus.Unverifiable
        );
        expect(result.microsoftAutoenrollment?.channelBinding.reason).toContain("FIPS mode");
      });

      test("reports the instance's status even when the profile accepts any TLS channel binding", async () => {
        withConfiguredProfile(true);
        vi.mocked(crypto.isFipsModeEnabled).mockReturnValue(true);

        const result = await get();

        expect(result.microsoftAutoenrollment?.allowAnyChannelBinding).toBe(true);
        expect(result.microsoftAutoenrollment?.channelBinding.status).toBe(
          MicrosoftAutoenrollmentChannelBindingStatus.Unverifiable
        );
      });

      test("is not-checked rather than enforced when the cache cannot be read", async () => {
        withConfiguredProfile(false);
        deps.keyStore.getItem.mockRejectedValue(new Error("redis down"));

        const result = await get();

        expect(result.microsoftAutoenrollment?.channelBinding.status).toBe(
          MicrosoftAutoenrollmentChannelBindingStatus.NotChecked
        );
      });
    });

    test("gives the reason for a profile that issues from an external certificate authority", async () => {
      deps.certificateAuthorityDAL.findByIdWithAssociatedCa.mockResolvedValue({
        id: "ca-id",
        externalCa: { type: CaType.ACME }
      });

      const result = await get();

      expect(result.microsoftAutoenrollmentUnsupportedReason).toMatch(/internal certificate authority/);
    });
  });

  describe("reenrollMicrosoftAutoenrollmentComputers", () => {
    test("bumps the template major revision and resets the minor revision", async () => {
      withExistingConfig();
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.update.mockResolvedValue([
        { ...existingConfig, templateMajorRevision: 101, templateMinorRevision: 0 }
      ]);

      const result = await service.reenrollMicrosoftAutoenrollmentComputers({
        applicationId: APPLICATION_ID,
        profileId: PROFILE_ID,
        ...actor
      });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).toHaveBeenCalledWith(
        { id: existingConfig.id },
        { templateMinorRevision: 0, $incr: { templateMajorRevision: 1 } }
      );
      expect(result.templateMajorRevision).toBe(101);
      expect(deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile).toHaveBeenCalledTimes(1);
      expect(deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile).toHaveBeenCalledWith(
        APPLICATION_ID,
        PROFILE_ID,
        "primary"
      );
    });

    test("refuses when the plan no longer includes Microsoft Autoenrollment, since it changes the configuration", async () => {
      withExistingConfig();
      deps.licenseService.getPlan.mockResolvedValue(Plan.restore(testFeatures()));

      await expect(
        service.reenrollMicrosoftAutoenrollmentComputers({
          applicationId: APPLICATION_ID,
          profileId: PROFILE_ID,
          ...actor
        })
      ).rejects.toThrow();
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).not.toHaveBeenCalled();
    });

    test("answers not found when the configuration was removed after it was read", async () => {
      withExistingConfig();
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.update.mockResolvedValue([]);

      await expect(
        service.reenrollMicrosoftAutoenrollmentComputers({
          applicationId: APPLICATION_ID,
          profileId: PROFILE_ID,
          ...actor
        })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    test("refuses a profile without Microsoft Autoenrollment", async () => {
      await expect(
        service.reenrollMicrosoftAutoenrollmentComputers({
          applicationId: APPLICATION_ID,
          profileId: PROFILE_ID,
          ...actor
        })
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).not.toHaveBeenCalled();
    });

    test("refuses an actor without permission to edit enrollment", async () => {
      withExistingConfig();
      deps.permissionService.getResourcePermission.mockResolvedValue({ permission: createMongoAbility([]) });

      await expect(
        service.reenrollMicrosoftAutoenrollmentComputers({
          applicationId: APPLICATION_ID,
          profileId: PROFILE_ID,
          ...actor
        })
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.update).not.toHaveBeenCalled();
    });
  });

  describe("clearMicrosoftAutoenrollmentEnrollment", () => {
    const clear = () =>
      service.clearMicrosoftAutoenrollmentEnrollment({
        applicationId: APPLICATION_ID,
        profileId: PROFILE_ID,
        ...actor
      });

    test("clears the profile's pointer before deleting the configuration, in the order a profile detach locks them", async () => {
      withExistingConfig();

      await clear();

      expect(deps.pkiApplicationProfileDAL.update).toHaveBeenCalledWith(
        { id: "junction-id" },
        { microsoftAutoenrollmentConfigId: null },
        "tx"
      );
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.delete).toHaveBeenCalledWith(
        { applicationProfileId: "junction-id" },
        "tx"
      );
      expect(deps.pkiApplicationProfileDAL.update.mock.invocationCallOrder[0]).toBeLessThan(
        deps.microsoftAutoenrollmentEnrollmentConfigDAL.delete.mock.invocationCallOrder[0]
      );
    });

    test("deletes the configuration a re-enable attached after a stale read, so the next enable is not refused", async () => {
      deps.pkiApplicationProfileDAL.findOneByApplicationAndProfile.mockResolvedValue({
        id: "junction-id",
        microsoftAutoenrollmentConfigId: "config-deleted-by-an-earlier-disable"
      });

      await clear();

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.delete).toHaveBeenCalledWith(
        { applicationProfileId: "junction-id" },
        "tx"
      );
    });

    test("deletes a configuration the replica does not show yet, since it may already exist on the primary", async () => {
      await clear();

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.delete).toHaveBeenCalledWith(
        { applicationProfileId: "junction-id" },
        "tx"
      );
    });

    test("refuses an actor without permission to edit enrollment", async () => {
      withExistingConfig();
      deps.permissionService.getResourcePermission.mockResolvedValue({ permission: createMongoAbility([]) });

      await expect(
        service.clearMicrosoftAutoenrollmentEnrollment({
          applicationId: APPLICATION_ID,
          profileId: PROFILE_ID,
          ...actor
        })
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.delete).not.toHaveBeenCalled();
    });
  });
});
