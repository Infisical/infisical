import { createMongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { OrgPermissionAppConnectionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { ActorType, AuthMethod } from "@app/services/auth/auth-type";

import { AppConnection } from "../app-connection-enums";
import { appConnectionServiceFactory } from "../app-connection-service";
import { AwsConnectionMethod } from "./aws-connection-enums";

vi.mock("@app/services/app-connection/app-connection-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/app-connection/app-connection-fns")>()),
  validateAppConnectionCredentials: vi.fn(async ({ credentials }: { credentials: unknown }) => credentials)
}));

const ORG_ID = "org-1";
const CONNECTION_ID = "conn-1";
const ACCOUNT_ID = "123456789012";
const ROLE_NAME = "infisical-app-connection";
const ROLE_ARN = `arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}`;

const actor = {
  type: ActorType.USER,
  id: "user-1",
  authMethod: AuthMethod.EMAIL,
  orgId: ORG_ID,
  rootOrgId: ORG_ID,
  parentOrgId: ORG_ID
};

const provisioning = (overrides: Record<string, unknown> = {}) => ({
  launchMethod: "launch-stack",
  useCases: ["secrets-manager"],
  stackName: "infisical-aws-connection",
  partition: "aws",
  templateVersion: "1",
  region: "us-east-1",
  roleName: ROLE_NAME,
  ...overrides
});

const toBlob = (value: unknown) => Buffer.from(JSON.stringify(value));
const fromBlob = (blob: Buffer) => JSON.parse(blob.toString()) as Record<string, unknown>;

const setup = ({
  storedConfiguration,
  storedRoleArn = ROLE_ARN
}: {
  storedConfiguration: unknown;
  storedRoleArn?: string;
}) => {
  const storedCredentials = toBlob({ roleArn: storedRoleArn });
  const row = {
    id: CONNECTION_ID,
    app: AppConnection.AWS,
    method: AwsConnectionMethod.AssumeRole,
    orgId: ORG_ID,
    projectId: null,
    name: "aws",
    version: 2,
    encryptedCredentials: storedCredentials,
    encryptedConfiguration: toBlob(storedConfiguration)
  };

  const updateById = vi.fn(async (_id: string, data: Record<string, unknown>) => {
    const defined = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    return { ...row, ...defined };
  });

  const overrides: Record<string, unknown> = {
    appConnectionDAL: {
      findById: vi.fn(async () => row),
      updateById,
      transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({}))
    },
    kmsService: {
      createCipherPairWithDataKey: vi.fn(async () => ({
        encryptor: ({ plainText }: { plainText: Buffer }) => ({ cipherTextBlob: plainText }),
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
      }))
    },
    permissionService: {
      getOrgPermission: vi.fn(async () => ({
        permission: createMongoAbility([
          { action: OrgPermissionAppConnectionActions.Edit, subject: OrgPermissionSubjects.AppConnections }
        ])
      }))
    },
    licenseService: { getPlan: vi.fn(async () => ({})) }
  };

  const deps = new Proxy(overrides, {
    get: (target, key: string) => (key in target ? target[key] : new Proxy({}, { get: () => vi.fn() }))
  });
  const service = appConnectionServiceFactory(deps as unknown as Parameters<typeof appConnectionServiceFactory>[0]);

  const update = (body: { credentials?: { roleArn: string }; configuration?: Record<string, unknown> }) =>
    service.updateAppConnection(AppConnection.AWS, { connectionId: CONNECTION_ID, ...body }, actor);

  const lastWrite = () => updateById.mock.calls.at(-1)?.[1] as Record<string, unknown> | undefined;

  const storedProvisioningAfter = (): unknown => {
    const written = lastWrite()?.encryptedConfiguration as Buffer | undefined;
    const configuration = written ? fromBlob(written) : (storedConfiguration as Record<string, unknown>);
    return configuration.provisioning;
  };

  return { update, lastWrite, storedProvisioningAfter };
};

describe("saving an AWS connection's configuration through the update path", () => {
  beforeEach(() => vi.clearAllMocks());

  test("replaces the recorded use cases without touching the stored credentials", async () => {
    const { update, lastWrite } = setup({ storedConfiguration: { provisioning: provisioning() } });
    const requested = provisioning({ useCases: ["secrets-manager", "parameter-store"] });

    const connection = await update({ configuration: { provisioning: requested } });

    expect(fromBlob(lastWrite()?.encryptedConfiguration as Buffer)).toEqual({ provisioning: requested });
    expect(lastWrite()?.encryptedCredentials).toBeUndefined();
    expect(connection.configuration).toEqual({ provisioning: requested });
  });

  test("keeps the provisioning when the same stack's Role ARN is saved", async () => {
    const { update, storedProvisioningAfter } = setup({ storedConfiguration: { provisioning: provisioning() } });

    await update({ credentials: { roleArn: ROLE_ARN } });

    expect(storedProvisioningAfter()).toEqual(provisioning());
  });

  test("clears the provisioning when a Role ARN with another role name is saved", async () => {
    const { update, storedProvisioningAfter } = setup({ storedConfiguration: { provisioning: provisioning() } });

    await update({ credentials: { roleArn: `arn:aws:iam::${ACCOUNT_ID}:role/some-other-role` } });

    expect(storedProvisioningAfter()).toBeNull();
  });

  test("clears the provisioning when a Role ARN in another account is saved", async () => {
    const { update, storedProvisioningAfter } = setup({ storedConfiguration: { provisioning: provisioning() } });

    await update({ credentials: { roleArn: `arn:aws:iam::210987654321:role/${ROLE_NAME}` } });

    expect(storedProvisioningAfter()).toBeNull();
  });

  test("clears the provisioning when a Role ARN in another partition is saved", async () => {
    const { update, storedProvisioningAfter } = setup({ storedConfiguration: { provisioning: provisioning() } });

    await update({ credentials: { roleArn: `arn:aws-us-gov:iam::${ACCOUNT_ID}:role/${ROLE_NAME}` } });

    expect(storedProvisioningAfter()).toBeNull();
  });

  test("clears the provisioning when the new Role ARN has a path the stack's role does not", async () => {
    const { update, storedProvisioningAfter } = setup({ storedConfiguration: { provisioning: provisioning() } });

    await update({ credentials: { roleArn: `arn:aws:iam::${ACCOUNT_ID}:role/team/${ROLE_NAME}` } });

    expect(storedProvisioningAfter()).toBeNull();
  });

  test("keeps the other configuration when it clears the provisioning", async () => {
    const { update, lastWrite } = setup({
      storedConfiguration: { provisioning: provisioning(), other: "kept" }
    });

    await update({ credentials: { roleArn: `arn:aws:iam::${ACCOUNT_ID}:role/some-other-role` } });

    expect(fromBlob(lastWrite()?.encryptedConfiguration as Buffer)).toEqual({ provisioning: null, other: "kept" });
  });

  test("clears the provisioning of a record without a role name when the Role ARN changes", async () => {
    const { update, storedProvisioningAfter } = setup({
      storedConfiguration: { provisioning: provisioning({ roleName: undefined }) }
    });

    await update({ credentials: { roleArn: `arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}-renamed` } });

    expect(storedProvisioningAfter()).toBeNull();
  });

  test("keeps the provisioning of a record without a role name when the saved Role ARN is unchanged", async () => {
    const { update, storedProvisioningAfter } = setup({
      storedConfiguration: { provisioning: provisioning({ roleName: undefined }) }
    });

    await update({ credentials: { roleArn: ROLE_ARN } });

    expect(storedProvisioningAfter()).toEqual(provisioning({ roleName: undefined }));
  });

  test("checks the Role ARN against the provisioning saved in the same request", async () => {
    const { update, storedProvisioningAfter } = setup({ storedConfiguration: { provisioning: provisioning() } });
    const requested = provisioning({ useCases: ["secrets-manager", "parameter-store"] });

    await update({ credentials: { roleArn: ROLE_ARN }, configuration: { provisioning: requested } });

    expect(storedProvisioningAfter()).toEqual(requested);
  });

  test("clears the provisioning saved in the same request when its Role ARN is not the stack's", async () => {
    const { update, storedProvisioningAfter } = setup({ storedConfiguration: { provisioning: provisioning() } });

    await update({
      credentials: { roleArn: `arn:aws:iam::${ACCOUNT_ID}:role/some-other-role` },
      configuration: { provisioning: provisioning({ useCases: ["parameter-store"] }) }
    });

    expect(storedProvisioningAfter()).toBeNull();
  });

  test("leaves a connection that was not created by Launch Stack alone", async () => {
    const { update, lastWrite } = setup({ storedConfiguration: { provisioning: null } });

    await update({ credentials: { roleArn: `arn:aws:iam::${ACCOUNT_ID}:role/some-other-role` } });

    expect(lastWrite()?.encryptedConfiguration).toBeUndefined();
  });
});
