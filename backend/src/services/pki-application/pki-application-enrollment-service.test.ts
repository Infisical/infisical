import { createMongoAbility, ForbiddenError } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";
import { MicrosoftAutoenrollmentKeytabSource } from "@app/ee/services/microsoft-autoenrollment/microsoft-autoenrollment-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
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

const { searchDirectoryGroups, resolveDirectorySidNames } = vi.hoisted(() => ({
  searchDirectoryGroups: vi.fn(),
  resolveDirectorySidNames: vi.fn()
}));

vi.mock("@app/services/app-connection/ldap/ldap-directory-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/app-connection/ldap/ldap-directory-fns")>()),
  searchDirectoryGroups,
  resolveDirectorySidNames
}));

vi.mock("@app/services/app-connection/app-connection-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/app-connection/app-connection-fns")>()),
  decryptAppConnection: vi.fn().mockResolvedValue({})
}));

vi.mock("@app/services/project/project-fns", () => ({
  getProjectKmsCertificateKeyId: vi.fn().mockResolvedValue("kms-id")
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

const existingConfig = {
  id: "config-id",
  templateMajorRevision: 100,
  templateMinorRevision: 3,
  renewBeforeDays: 30,
  allowedGroups: [{ sid: SERVERS_SID, name: "Servers" }],
  servicePrincipalName: SERVICE_PRINCIPAL_NAME,
  keyVersion: 3,
  encryptedKeytab: Buffer.from("existing-encrypted-keytab"),
  appConnectionId: CONNECTION_ID
};

describe("pkiApplicationEnrollmentService Microsoft Autoenrollment", () => {
  const deps = {
    pkiApplicationDAL: { findById: vi.fn() },
    pkiApplicationProfileDAL: {
      findOneByApplicationAndProfile: vi.fn(),
      transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback("tx")),
      update: vi.fn()
    },
    microsoftAutoenrollmentEnrollmentConfigDAL: {
      create: vi.fn(),
      update: vi.fn(),
      updateById: vi.fn(),
      deleteById: vi.fn(),
      findById: vi.fn(),
      findByApplicationId: vi.fn()
    },
    appConnectionService: { validateAppConnectionUsageById: vi.fn() },
    appConnectionDAL: { findById: vi.fn() },
    licenseService: { getPlan: vi.fn() },
    certificateProfileDAL: { findById: vi.fn() },
    certificateAuthorityDAL: { findById: vi.fn(), findByIdWithAssociatedCa: vi.fn() },
    kmsService: { encryptWithKmsKey: vi.fn(), decryptWithKmsKey: vi.fn() },
    permissionService: { getResourcePermission: vi.fn() }
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
    resolveDirectorySidNames.mockResolvedValue({});
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
    deps.certificateProfileDAL.findById.mockResolvedValue({ id: PROFILE_ID, caId: "ca-id", slug: "web-servers" });
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
    deps.kmsService.encryptWithKmsKey.mockResolvedValue(async ({ plainText }: { plainText: Buffer }) => ({
      cipherTextBlob: Buffer.concat([Buffer.from("encrypted:"), plainText])
    }));
    deps.kmsService.decryptWithKmsKey.mockResolvedValue(async ({ cipherTextBlob }: { cipherTextBlob: Buffer }) =>
      Buffer.concat([Buffer.from("decrypted:"), cipherTextBlob])
    );
    deps.microsoftAutoenrollmentEnrollmentConfigDAL.create.mockResolvedValue({ id: "new-config-id" });
    deps.microsoftAutoenrollmentEnrollmentConfigDAL.updateById.mockImplementation(
      async (id: string, update: Record<string, unknown>) => ({ ...existingConfig, ...update, id })
    );
    deps.microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId.mockResolvedValue([]);
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

    test("refuses an update when the plan no longer includes Microsoft Autoenrollment", async () => {
      withExistingConfig();
      deps.licenseService.getPlan.mockResolvedValue(Plan.restore(testFeatures()));

      await expect(set({ renewBeforeDays: 10 })).rejects.toThrow();
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.updateById).not.toHaveBeenCalled();
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
      resolveDirectorySidNames.mockResolvedValue({ [groupSid]: "Operators" });

      await set({ connectionId: CONNECTION_ID, keytab: encodeKeytab([3]), allowedGroupSids: [groupSid] });

      expect(resolveDirectorySidNames).toHaveBeenCalledTimes(1);
      expect(searchDirectoryGroups).not.toHaveBeenCalled();
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).toHaveBeenCalledWith(
        expect.objectContaining({ allowedGroups: JSON.stringify([{ sid: groupSid, name: "Operators" }]) }),
        "tx"
      );
    });

    test("refuses a new LDAP connection that cannot name the allowed groups", async () => {
      resolveDirectorySidNames.mockRejectedValue(new Error("ECONNRESET"));

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

    test("reuses the keytab of the named profile in the same application, and names that profile", async () => {
      const THIRD_PROFILE_ID = "2d3c2b1a-0f9e-4d8c-b7a6-5f4e3d2c1b0a";
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId.mockResolvedValue([
        { ...existingConfig, profileId: THIRD_PROFILE_ID, profileName: "desktops", keyVersion: 2 },
        { ...existingConfig, profileId: OTHER_PROFILE_ID, profileName: "laptops" }
      ]);

      const result = await set({
        connectionId: CONNECTION_ID,
        reuseKeytab: { profileId: OTHER_PROFILE_ID }
      });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId).toHaveBeenCalledWith(APPLICATION_ID);
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).toHaveBeenCalledWith(
        expect.objectContaining({
          encryptedKeytab: Buffer.concat([Buffer.from("encrypted:decrypted:"), existingConfig.encryptedKeytab]),
          keyVersion: 3
        }),
        "tx"
      );
      expect(result).toMatchObject({
        keytabSource: MicrosoftAutoenrollmentKeytabSource.Reused,
        reusedFromProfileId: OTHER_PROFILE_ID,
        reusedFromProfileName: "laptops",
        connectionName: "corp-ad"
      });
    });

    test("refuses to reuse the keytab of a profile with no Microsoft Autoenrollment keytab in this application, which covers a profile of another application", async () => {
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId.mockResolvedValue([
        { ...existingConfig, profileId: "2d3c2b1a-0f9e-4d8c-b7a6-5f4e3d2c1b0a", profileName: "desktops" }
      ]);

      await expect(set({ connectionId: CONNECTION_ID, reuseKeytab: { profileId: OTHER_PROFILE_ID } })).rejects.toThrow(
        `Profile '${OTHER_PROFILE_ID}' has no Microsoft Autoenrollment keytab in application 'fleet'`
      );
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId).toHaveBeenCalledWith(APPLICATION_ID);
      expect(deps.kmsService.decryptWithKmsKey).not.toHaveBeenCalled();
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("refuses to reuse the keytab of the profile being configured", async () => {
      deps.microsoftAutoenrollmentEnrollmentConfigDAL.findByApplicationId.mockResolvedValue([
        { ...existingConfig, profileId: PROFILE_ID, profileName: "web-servers" }
      ]);

      await expect(set({ connectionId: CONNECTION_ID, reuseKeytab: { profileId: PROFILE_ID } })).rejects.toThrow(
        "A profile cannot reuse its own keytab"
      );
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
    });

    test("an update without a keytab keeps the keytab, the mismatch record and unsent fields, and bumps the template revision", async () => {
      withExistingConfig();

      const result = await set({ renewBeforeDays: 10 });

      const [configId, update] = deps.microsoftAutoenrollmentEnrollmentConfigDAL.updateById.mock.calls[0] as [
        string,
        Record<string, unknown>
      ];
      expect(configId).toBe(existingConfig.id);
      expect(update).toMatchObject({
        encryptedKeytab: existingConfig.encryptedKeytab,
        appConnectionId: CONNECTION_ID,
        allowedGroups: JSON.stringify([{ sid: SERVERS_SID, name: "Servers" }]),
        renewBeforeDays: 10,
        $incr: { templateMinorRevision: 1 }
      });
      expect(update).not.toHaveProperty("mismatchedServicePrincipalName");
      expect(deps.appConnectionService.validateAppConnectionUsageById).not.toHaveBeenCalled();
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.create).not.toHaveBeenCalled();
      expect(result.keytabSource).toBe(MicrosoftAutoenrollmentKeytabSource.Unchanged);
      expect(result.microsoftAutoenrollment).toMatchObject({
        renewBeforeDays: 10,
        servicePrincipalName: existingConfig.servicePrincipalName,
        connectionId: existingConfig.appConnectionId
      });
    });

    test("a new keytab on update clears the keytab mismatch record", async () => {
      withExistingConfig();

      await set({ keytab: encodeKeytab([4]) });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.updateById).toHaveBeenCalledWith(
        existingConfig.id,
        expect.objectContaining({
          keyVersion: 4,
          mismatchedServicePrincipalName: null,
          mismatchFirstSeenAt: null,
          mismatchRequestCount: 0
        }),
        "tx"
      );
    });

    test("an update that changes nothing keeps the template revision", async () => {
      withExistingConfig();

      await set({ renewBeforeDays: existingConfig.renewBeforeDays, allowedGroupSids: [SERVERS_SID] });
      await set({});

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.updateById).not.toHaveBeenCalled();
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

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.updateById).toHaveBeenCalledWith(
        existingConfig.id,
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
      expect(resolveDirectorySidNames).not.toHaveBeenCalled();
      expect(searchDirectoryGroups).not.toHaveBeenCalled();
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.updateById).not.toHaveBeenCalled();
    });

    test("clears the allowed groups without checking the stored LDAP connection, since nothing is looked up", async () => {
      withExistingConfig();
      deps.appConnectionService.validateAppConnectionUsageById.mockRejectedValue(
        new BadRequestError({ message: "no" })
      );

      const result = await set({ allowedGroupSids: [] });

      expect(deps.appConnectionService.validateAppConnectionUsageById).not.toHaveBeenCalled();
      expect(resolveDirectorySidNames).not.toHaveBeenCalled();
      expect(result.microsoftAutoenrollment.allowedGroups).toEqual([]);
    });

    test("keeps the stored LDAP connection without checking it when the allowed groups do not change", async () => {
      withExistingConfig();

      const result = await set({ renewBeforeDays: 10 });

      expect(deps.appConnectionService.validateAppConnectionUsageById).not.toHaveBeenCalled();
      expect(deps.appConnectionDAL.findById).toHaveBeenCalledWith(CONNECTION_ID);
      expect(result.connectionName).toBe("corp-ad");
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

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.updateById).not.toHaveBeenCalled();
      expect(resolveDirectorySidNames).not.toHaveBeenCalled();
    });

    test("stores the group names when the groups change and serves them without asking Active Directory", async () => {
      withExistingConfig();
      resolveDirectorySidNames.mockResolvedValue({ [OPERATORS_SID]: "Operators" });

      const result = await set({ allowedGroupSids: [OPERATORS_SID] });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.updateById).toHaveBeenCalledWith(
        existingConfig.id,
        expect.objectContaining({ allowedGroups: JSON.stringify([{ sid: OPERATORS_SID, name: "Operators" }]) }),
        "tx"
      );
      expect(resolveDirectorySidNames).toHaveBeenCalledTimes(1);
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

      expect(resolveDirectorySidNames).not.toHaveBeenCalled();
    });

    test("keeps the stored names when Active Directory can't be reached", async () => {
      withExistingConfig();
      resolveDirectorySidNames.mockRejectedValue(new Error("ECONNRESET"));

      await set({ allowedGroupSids: [SERVERS_SID, OPERATORS_SID] });

      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.updateById).toHaveBeenCalledWith(
        existingConfig.id,
        expect.objectContaining({
          allowedGroups: JSON.stringify([
            { sid: SERVERS_SID, name: "Servers" },
            { sid: OPERATORS_SID, name: null }
          ])
        }),
        "tx"
      );
    });
  });

  describe("listMicrosoftAutoenrollmentGroups", () => {
    const list = () =>
      service.listMicrosoftAutoenrollmentGroups({
        applicationId: APPLICATION_ID,
        profileId: PROFILE_ID,
        connectionId: CONNECTION_ID,
        search: "serv",
        ...actor
      });

    test("returns the groups and whether the directory had more than it sent", async () => {
      searchDirectoryGroups.mockResolvedValue({
        groups: [{ sid: SERVERS_SID, name: "Servers" }],
        isTruncated: true
      });

      await expect(list()).resolves.toEqual({ groups: [{ sid: SERVERS_SID, name: "Servers" }], isTruncated: true });
    });

    test("names the LDAP connection when the directory refuses the search, keeping the cause", async () => {
      searchDirectoryGroups.mockRejectedValue(
        new BadRequestError({ message: "TLS connection error: certificate has expired" })
      );

      await expect(list()).rejects.toThrow(
        "Could not search Active Directory with the LDAP connection 'corp-ad'. Check that the directory is reachable and the connection's credentials are valid. Details: TLS connection error: certificate has expired"
      );
    });

    test("names the LDAP connection without the raw error when the search fails unexpectedly", async () => {
      searchDirectoryGroups.mockRejectedValue(new Error("ECONNRESET 10.0.0.4:636"));

      const error = await list().catch((err: Error) => err);

      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as Error).message).toContain("'corp-ad'");
      expect((error as Error).message).not.toContain("ECONNRESET");
    });
  });

  describe("getEnrollment", () => {
    const get = () =>
      service.getEnrollment({
        applicationId: APPLICATION_ID,
        profileId: PROFILE_ID,
        ...actor
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
        /Profile 'web-servers' asks Windows for an RSA key, but its certificate authority's key is EC_prime256v1/
      );
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
    test("detaches and deletes the configuration", async () => {
      withExistingConfig();

      await service.clearMicrosoftAutoenrollmentEnrollment({
        applicationId: APPLICATION_ID,
        profileId: PROFILE_ID,
        ...actor
      });

      expect(deps.pkiApplicationProfileDAL.update).toHaveBeenCalledWith(
        { applicationId: APPLICATION_ID, profileId: PROFILE_ID },
        { microsoftAutoenrollmentConfigId: null },
        "tx"
      );
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.deleteById).toHaveBeenCalledWith(existingConfig.id, "tx");
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
      expect(deps.microsoftAutoenrollmentEnrollmentConfigDAL.deleteById).not.toHaveBeenCalled();
    });
  });
});
