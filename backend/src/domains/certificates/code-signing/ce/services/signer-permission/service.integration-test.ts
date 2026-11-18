import { randomUUID } from "node:crypto";

import { ProjectMembershipRole, ProjectType, RESOURCE_SCOPE, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { PermissionDeniedError, RuleViolationError } from "@app/domains/lib/errors";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { KnexGrantSeeder } from "@app/domains/platform/access-control/ce/testing/knex-grant-seeder";
import { buildProjectsModule } from "@app/domains/platform/projects/ce/testing/projects-module";
import { ActorType, AuthMethod } from "@app/lib/auth/actor-types";

import { SignerPermissionActions, SignerPermissionSub } from "../../models/signer-roles";
import { CodeSigningModule } from "../../module";

const check = (action: SignerPermissionActions) => ({ action, subject: SignerPermissionSub.Signer });

describe("SignerPermissionService.getSignerPermission", () => {
  const h = setupIntegration();

  const setup = async ({
    projectRole,
    projectType = ProjectType.CertificateManager
  }: {
    projectRole?: ProjectMembershipRole;
    projectType?: ProjectType;
  } = {}) => {
    const org = await h.factories.organization();
    const user = await h.factories.user();
    await h.factories.orgMembership({ orgId: org.id, userId: user.id });
    const { project } = await h.factories.project({ orgId: org.id, type: projectType, environments: [] });
    if (projectRole) {
      await h.factories.projectMembership({ orgId: org.id, projectId: project.id, userId: user.id, role: projectRole });
    }
    const signerId = randomUUID();
    const seed = new KnexGrantSeeder(h.db);
    const assignSignerRole = (role: string) =>
      seed.membership({
        scope: RESOURCE_SCOPE,
        orgId: org.id,
        projectId: project.id,
        resourceType: ResourceType.Signer,
        resourceId: signerId,
        actor: { userId: user.id },
        roles: [{ role }]
      });
    const projects = buildProjectsModule(h.db);
    const { signerPermissionService } = new CodeSigningModule({
      projectResourcePermissionService: projects.projectResourcePermissionService
    });
    const actor: TActorContext = {
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
    const get = () => signerPermissionService.getSignerPermission({ actor, projectId: project.id, signerId });
    return { get, assignSignerRole };
  };

  test("should let a signer operator sign, even without a project role", async () => {
    // Setup
    const { get, assignSignerRole } = await setup();
    await assignSignerRole("operator");

    // Action
    const permission = await get();

    // Assert
    expect(permission.can(check(SignerPermissionActions.Sign))).toBe(true);
    expect(permission.can(check(SignerPermissionActions.ManageMembers))).toBe(false);
    expect(permission.isImplicitAdmin).toBe(false);
  });

  test("should give a project admin with no signer role read and member management only", async () => {
    // Setup
    const { get } = await setup({ projectRole: ProjectMembershipRole.Admin });

    // Action
    const permission = await get();

    // Assert
    expect(permission.isImplicitAdmin).toBe(true);
    expect(permission.can(check(SignerPermissionActions.Read))).toBe(true);
    expect(permission.can(check(SignerPermissionActions.ManageMembers))).toBe(true);
    expect(permission.can(check(SignerPermissionActions.Sign))).toBe(false);
  });

  test("should add the project-admin rules to the signer role a project admin holds", async () => {
    // Setup
    const { get, assignSignerRole } = await setup({ projectRole: ProjectMembershipRole.Admin });
    await assignSignerRole("auditor");

    // Action
    const permission = await get();

    // Assert
    expect(permission.can(check(SignerPermissionActions.ExportCertificate))).toBe(true);
    expect(permission.can(check(SignerPermissionActions.ManageMembers))).toBe(true);
    expect(permission.can(check(SignerPermissionActions.Sign))).toBe(false);
  });

  test("should refuse a project member with no signer role", async () => {
    // Setup
    const { get } = await setup({ projectRole: ProjectMembershipRole.Member });

    // Action
    const result = get();

    // Assert
    await expect(result).rejects.toThrow(PermissionDeniedError);
    await expect(result).rejects.toThrow(`You are not a member of this ${ResourceType.Signer}.`);
  });

  test("should refuse a signer in a project of another type", async () => {
    // Setup
    const { get } = await setup({ projectRole: ProjectMembershipRole.Admin, projectType: ProjectType.KMS });

    // Action
    const result = get();

    // Assert
    await expect(result).rejects.toThrow(RuleViolationError);
  });
});
