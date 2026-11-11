import { randomUUID } from "node:crypto";

import { AccessScope, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { buildAccessControlForTests } from "@app/domains/platform/access-control/ce/testing/build-access-control";
import { ProjectPermissionCmekActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import { buildProjectsForTests } from "@app/domains/platform/projects/ce/testing/build-projects";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { KmsModule } from "./module";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const encrypt = { action: ProjectPermissionCmekActions.Encrypt, subject: ProjectPermissionSub.Cmek };

const setup = () => {
  const { service: accessControlDomain, inMemory } = buildAccessControlForTests();
  const orgId = randomUUID();
  const userId = randomUUID();
  const kmsProjectId = randomUUID();
  const secretsProjectId = randomUUID();
  const { service: projectsDomain, productAccessRegistry } = buildProjectsForTests({
    accessControlDomain,
    organizationsDomain: { getOrgPermission: async () => ({}) as never },
    projects: [
      { id: kmsProjectId, orgId, type: ProjectType.KMS },
      { id: secretsProjectId, orgId, type: ProjectType.SecretManager }
    ]
  });
  const kms = new KmsModule({ projectsDomain, productAccessRegistry });
  const actor: TActorContext = {
    principal: {
      type: ActorType.USER,
      id: userId,
      username: "u",
      email: null,
      authMethod: AuthMethod.EMAIL,
      isSuperAdmin: false
    },
    org: {
      id: orgId,
      name: "o",
      rootOrgId: orgId,
      parentOrgId: orgId,
      shouldUseNewPrivilegeSystem: true,
      ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
    },
    plan: async () => {
      throw new Error("not needed");
    }
  };
  const addRole = (projectId: string, role: string) =>
    inMemory!.transactionRunner.run(({ dataAccess }) =>
      dataAccess.memberships.create({
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        actorUserId: userId,
        roles: [{ role }]
      })
    );
  return { kms, projectsDomain, actor, addRole, kmsProjectId, secretsProjectId };
};

describe("KmsModule.getKmsPermission", () => {
  test("should let a cryptographic operator encrypt in a KMS project", async () => {
    // Setup
    const { kms, actor, addRole, kmsProjectId } = setup();
    await addRole(kmsProjectId, ProjectMembershipRole.KmsCryptographicOperator);

    // Action
    const permission = await kms.service.getKmsPermission({ actor, projectId: kmsProjectId });

    // Assert
    expect(permission.can(encrypt)).toBe(true);
  });

  test("should give the cryptographic operator role nothing outside a KMS project", async () => {
    // Setup
    const { projectsDomain, actor, addRole, secretsProjectId } = setup();
    await addRole(secretsProjectId, ProjectMembershipRole.KmsCryptographicOperator);

    // Action
    const permission = await projectsDomain.getProjectPermission({ actor, projectId: secretsProjectId });

    // Assert
    expect(permission.can(encrypt)).toBe(false);
  });

  test("should refuse a project that is not a KMS project", async () => {
    // Setup
    const { kms, actor, addRole, secretsProjectId } = setup();
    await addRole(secretsProjectId, ProjectMembershipRole.Admin);

    // Action
    const result = kms.service.getKmsPermission({ actor, projectId: secretsProjectId });

    // Assert
    await expect(result).rejects.toThrow(ProjectType.KMS);
  });
});
