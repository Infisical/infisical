import { beforeEach, describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";

import {
  assertAwsKmsLegacyExternalIdNotForeign,
  AwsKmsProviderFactory,
  bindAwsKmsExternalIdToOrg,
  hasLegacyAwsKmsExternalId,
  resolveAwsKmsInputsVersion
} from "./aws-kms";
import { ExternalKmsProviderInputsVersion, KmsAwsCredentialType, TExternalKmsAwsSchema } from "./model";

const { Legacy, OrgBoundExternalId } = ExternalKmsProviderInputsVersion;

const sts = vi.hoisted(() => ({ externalIds: [] as (string | undefined)[] }));

vi.mock("@app/lib/crypto/cryptography", () => ({
  crypto: { isFipsModeEnabled: () => false, nativeCrypto: { randomUUID: () => "session" } }
}));
vi.mock("@app/lib/aws/hashing", () => ({ CustomAWSHasher: function CustomAWSHasher() {} }));
vi.mock("@aws-sdk/client-sts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-sts")>();
  return {
    ...actual,
    STSClient: class {
      // eslint-disable-next-line class-methods-use-this
      async send(command: { input: { ExternalId?: string } }) {
        sts.externalIds.push(command.input.ExternalId);
        return { Credentials: { AccessKeyId: "AKIA", SecretAccessKey: "secret", SessionToken: "token" } };
      }
    }
  };
});

const ORG_ID = "8a3c2f0e-6f4b-4b0e-9a57-3f1d2c4b5a60";
const OWN_PROJECT_ID = "0f1e2d3c-4b5a-4968-8776-655443322110";
const FOREIGN_PROJECT_ID = "11111111-2222-4333-8444-555555555555";
const FOREIGN_ORG_ID = "99999999-8888-4777-8666-555555555555";
const UNKNOWN_UUID = "abcdefab-cdef-4abc-8def-abcdefabcdef";

const projects: Record<string, { orgId: string }> = {
  [OWN_PROJECT_ID]: { orgId: ORG_ID },
  [FOREIGN_PROJECT_ID]: { orgId: FOREIGN_ORG_ID }
};
const orgs: Record<string, { id: string }> = {
  [ORG_ID]: { id: ORG_ID },
  [FOREIGN_ORG_ID]: { id: FOREIGN_ORG_ID }
};

const projectDAL = { findById: vi.fn(async (id: string) => projects[id] as never) };
const orgDAL = { findById: vi.fn(async (id: string) => orgs[id] as never) };
const lookups = { orgId: ORG_ID, orgDAL, projectDAL };

const assumeRoleInputs = (externalId?: string): TExternalKmsAwsSchema => ({
  credential: {
    type: KmsAwsCredentialType.AssumeRole,
    data: { assumeRoleArn: "arn:aws:iam::123456789012:role/victim", externalId }
  },
  awsRegion: "us-east-1",
  kmsKeyId: "key-1"
});

const externalIdOf = (inputs: TExternalKmsAwsSchema) =>
  inputs.credential.type === KmsAwsCredentialType.AssumeRole ? inputs.credential.data.externalId : undefined;

beforeEach(() => {
  projectDAL.findById.mockClear();
  orgDAL.findById.mockClear();
  sts.externalIds = [];
});

describe("bindAwsKmsExternalIdToOrg", () => {
  test("leaves access-key credentials untouched", () => {
    const inputs: TExternalKmsAwsSchema = {
      credential: { type: KmsAwsCredentialType.AccessKey, data: { accessKey: "a", secretKey: "s" } },
      awsRegion: "us-east-1"
    };

    expect(bindAwsKmsExternalIdToOrg({ inputs, orgId: ORG_ID })).toEqual(inputs);
  });

  test("defaults a missing external ID to the organization ID", () => {
    expect(externalIdOf(bindAwsKmsExternalIdToOrg({ inputs: assumeRoleInputs(), orgId: ORG_ID }))).toBe(ORG_ID);
  });

  test("accepts the organization ID in any case", () => {
    const inputs = assumeRoleInputs(ORG_ID.toUpperCase());

    expect(bindAwsKmsExternalIdToOrg({ inputs, orgId: ORG_ID })).toEqual(inputs);
  });

  test.each([
    ["a project ID of the organization", OWN_PROJECT_ID],
    ["another organization's project ID", FOREIGN_PROJECT_ID],
    ["another organization's ID", FOREIGN_ORG_ID],
    ["a free-form value", "my-custom-id"]
  ])("refuses %s", (_, externalId) => {
    expect(() => bindAwsKmsExternalIdToOrg({ inputs: assumeRoleInputs(externalId), orgId: ORG_ID })).toThrow(
      BadRequestError
    );
  });
});

describe("assertAwsKmsLegacyExternalIdNotForeign", () => {
  test.each([
    ["another organization's project ID", FOREIGN_PROJECT_ID],
    ["another organization's ID", FOREIGN_ORG_ID],
    ["another organization's ID in upper case", FOREIGN_ORG_ID.toUpperCase()]
  ])("refuses %s", async (_, externalId) => {
    await expect(
      assertAwsKmsLegacyExternalIdNotForeign({ inputs: assumeRoleInputs(externalId), ...lookups })
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  test.each([
    ["no external ID", undefined],
    ["the organization ID", ORG_ID],
    ["a project ID of the organization", OWN_PROJECT_ID],
    ["a UUID that names no organization or project", UNKNOWN_UUID]
  ])("allows %s", async (_, externalId) => {
    await expect(
      assertAwsKmsLegacyExternalIdNotForeign({ inputs: assumeRoleInputs(externalId), ...lookups })
    ).resolves.toBeUndefined();
  });

  test("allows a free-form value without looking anything up", async () => {
    await expect(
      assertAwsKmsLegacyExternalIdNotForeign({ inputs: assumeRoleInputs("my-custom-id"), ...lookups })
    ).resolves.toBeUndefined();
    expect(orgDAL.findById).not.toHaveBeenCalled();
    expect(projectDAL.findById).not.toHaveBeenCalled();
  });
});

describe("AwsKmsProviderFactory", () => {
  test("never calls AssumeRole with an external ID other than the organization ID", async () => {
    await expect(
      AwsKmsProviderFactory({ inputs: assumeRoleInputs(OWN_PROJECT_ID), inputsVersion: OrgBoundExternalId, ...lookups })
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(sts.externalIds).toEqual([]);
  });

  test("sends the organization ID when the inputs have no external ID", async () => {
    const provider = await AwsKmsProviderFactory({
      inputs: assumeRoleInputs(),
      inputsVersion: OrgBoundExternalId,
      ...lookups
    });

    expect(sts.externalIds).toEqual([ORG_ID]);
    expect(externalIdOf(provider.getProviderInputs())).toBe(ORG_ID);
  });

  test.each([
    ["a custom external ID", "my-custom-id"],
    ["a project ID of the organization", OWN_PROJECT_ID]
  ])("sends a legacy row's %s as stored", async (_, externalId) => {
    await AwsKmsProviderFactory({ inputs: assumeRoleInputs(externalId), inputsVersion: Legacy, ...lookups });

    expect(sts.externalIds).toEqual([externalId]);
  });

  test("sends no external ID for a legacy row saved without one", async () => {
    await AwsKmsProviderFactory({ inputs: assumeRoleInputs(), inputsVersion: Legacy, ...lookups });

    expect(sts.externalIds).toEqual([undefined]);
  });

  test("never calls AssumeRole for a legacy row holding another organization's project ID", async () => {
    await expect(
      AwsKmsProviderFactory({ inputs: assumeRoleInputs(FOREIGN_PROJECT_ID), inputsVersion: Legacy, ...lookups })
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(sts.externalIds).toEqual([]);
  });
});

describe("resolveAwsKmsInputsVersion", () => {
  test("keeps a legacy row legacy while its credential is unchanged", () => {
    const stored = assumeRoleInputs("my-custom-id");

    expect(
      resolveAwsKmsInputsVersion({
        currentVersion: Legacy,
        storedInputs: stored,
        updatedInputs: { ...stored, kmsKeyId: "key-2" }
      })
    ).toBe(Legacy);
  });

  test("moves a legacy row to the current rules when the role changes", () => {
    const stored = assumeRoleInputs("my-custom-id");
    const updated: TExternalKmsAwsSchema = {
      ...stored,
      credential: {
        type: KmsAwsCredentialType.AssumeRole,
        data: { assumeRoleArn: "arn:aws:iam::210987654321:role/other", externalId: "my-custom-id" }
      }
    };

    expect(resolveAwsKmsInputsVersion({ currentVersion: Legacy, storedInputs: stored, updatedInputs: updated })).toBe(
      OrgBoundExternalId
    );
  });

  test("moves a legacy row to the current rules when the external ID changes", () => {
    expect(
      resolveAwsKmsInputsVersion({
        currentVersion: Legacy,
        storedInputs: assumeRoleInputs("my-custom-id"),
        updatedInputs: assumeRoleInputs(ORG_ID)
      })
    ).toBe(OrgBoundExternalId);
  });

  test("never moves a current row back to legacy", () => {
    const stored = assumeRoleInputs(ORG_ID);

    expect(
      resolveAwsKmsInputsVersion({ currentVersion: OrgBoundExternalId, storedInputs: stored, updatedInputs: stored })
    ).toBe(OrgBoundExternalId);
  });
});

describe("hasLegacyAwsKmsExternalId", () => {
  test.each([
    ["a custom value", "my-custom-id"],
    ["no external ID", undefined],
    ["a project ID of the organization", OWN_PROJECT_ID]
  ])("flags a legacy row with %s", (_, externalId) => {
    expect(
      hasLegacyAwsKmsExternalId({ inputs: assumeRoleInputs(externalId), inputsVersion: Legacy, orgId: ORG_ID })
    ).toBe(true);
  });

  test("does not flag a legacy row that already uses the organization ID", () => {
    expect(hasLegacyAwsKmsExternalId({ inputs: assumeRoleInputs(ORG_ID), inputsVersion: Legacy, orgId: ORG_ID })).toBe(
      false
    );
  });

  test("does not flag a row on the current rules", () => {
    expect(
      hasLegacyAwsKmsExternalId({
        inputs: assumeRoleInputs("my-custom-id"),
        inputsVersion: OrgBoundExternalId,
        orgId: ORG_ID
      })
    ).toBe(false);
  });
});
