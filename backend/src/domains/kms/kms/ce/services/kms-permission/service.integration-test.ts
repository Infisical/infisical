import { ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { FakeActorAuditConfig } from "@app/domains/lib/actor-context/testing/fake-actor-audit-config";
import { RuleViolationError } from "@app/domains/lib/errors";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { ProjectPermissionCmekActions, ProjectPermissionSub } from "@app/domains/platform/projects/ce/module";
import { buildProjectsModule } from "@app/domains/platform/projects/ce/testing/projects-module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { kmsProjectRoles } from "../../models/permissions/kms-project-roles";
import { KmsModule } from "../../module";

const encrypt = { action: ProjectPermissionCmekActions.Encrypt, subject: ProjectPermissionSub.Cmek } as const;

describe("KmsPermissionService.getKmsPermission", () => {
  const h = setupIntegration();

  const setup = async (projectType: ProjectType, role: ProjectMembershipRole) => {
    const org = await h.factories.organization();
    const user = await h.factories.user();
    await h.factories.orgMembership({ orgId: org.id, userId: user.id });
    const { project } = await h.factories.project({ orgId: org.id, type: projectType, environments: [] });
    await h.factories.projectMembership({ orgId: org.id, projectId: project.id, userId: user.id, role });
    const projects = buildProjectsModule(h.db, { projectRoles: [kmsProjectRoles] });
    const kms = new KmsModule({ projectPermissionService: projects.projectPermissionService });
    const actor: TActorContext = {
      audit: new FakeActorAuditConfig(),
      principal: {
        type: ActorType.USER,
        id: user.id,
        username: user.username,
        email: user.email ?? null,
        authMethod: AuthMethod.EMAIL,
        isSuperAdmin: false
      },
      org: {
        id: org.id,
        name: org.name,
        rootOrgId: org.id,
        parentOrgId: org.id,
        shouldUseNewPrivilegeSystem: true,
        ssoPolicy: { authEnforced: false, googleSsoAuthEnforced: false, bypassOrgAuthEnabled: false }
      }
    };
    return { kms, projects, actor, projectId: project.id };
  };

  test("should let a cryptographic operator encrypt in a KMS project", async () => {
    // Setup
    const { kms, actor, projectId } = await setup(ProjectType.KMS, ProjectMembershipRole.KmsCryptographicOperator);

    // Action
    const permission = await kms.kmsPermissionService.getKmsPermission({ actor, projectId });

    // Assert
    expect(permission.can(encrypt)).toBe(true);
  });

  test("should keep the cryptographic operator role's key use in a project of another type", async () => {
    // Setup
    const { projects, actor, projectId } = await setup(
      ProjectType.SecretManager,
      ProjectMembershipRole.KmsCryptographicOperator
    );

    // Action
    const permission = await projects.projectPermissionService.getProjectPermission({ actor, projectId });

    // Assert
    expect(permission.can(encrypt)).toBe(true);
  });

  test("should refuse a project that is not a KMS project", async () => {
    // Setup
    const { kms, actor, projectId } = await setup(ProjectType.SecretManager, ProjectMembershipRole.Admin);

    // Action
    const result = kms.kmsPermissionService.getKmsPermission({ actor, projectId });

    // Assert
    await expect(result).rejects.toThrow(RuleViolationError);
    await expect(result).rejects.toThrow(`Operations of type ${ProjectType.KMS} are not allowed.`);
  });
});
