import type { TDbClient } from "@app/db";
import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  ProjectType,
  TableName,
  TMemberships,
  TOrganizations,
  TOrganizationsInsert,
  TProjectEnvironments,
  TProjects,
  TProjectsInsert,
  TUsers,
  TUsersInsert
} from "@app/db/schemas";
import { AuthMethod } from "@app/services/auth/auth-type";

import { randomId } from "./run";

// Platform tables no domain owns yet, so rows go in directly. A domain's own tables go through its
// module so its tests hit its rules. Projects get no legacy E2EE keys or ghost user; nothing here reads them.

export const DEFAULT_ENVIRONMENTS = [
  { name: "Development", slug: "dev" },
  { name: "Staging", slug: "staging" },
  { name: "Production", slug: "prod" }
];

export type TTenant = {
  org: TOrganizations;
  admin: TUsers;
  adminOrgMembership: TMemberships;
  project: TProjects;
  environments: TProjectEnvironments[];
};

export const createPlatformFactories = (db: TDbClient) => {
  const user = async (overrides: Partial<TUsersInsert> = {}): Promise<TUsers> => {
    const id = randomId();
    const email = `${id}@integration.test`;
    const [row] = await db(TableName.Users)
      .insert({
        username: email,
        email,
        firstName: "Test",
        lastName: id,
        isAccepted: true,
        isEmailVerified: true,
        authMethods: [AuthMethod.EMAIL],
        ...overrides
      })
      .returning("*");
    return row;
  };

  const organization = async (overrides: Partial<TOrganizationsInsert> = {}): Promise<TOrganizations> => {
    const id = randomId();
    const [row] = await db(TableName.Organization)
      .insert({ name: `org-${id}`, slug: `org-${id}`, ...overrides })
      .returning("*");
    return row;
  };

  const orgMembership = async ({
    orgId,
    userId,
    role = OrgMembershipRole.Admin
  }: {
    orgId: string;
    userId: string;
    role?: OrgMembershipRole;
  }): Promise<TMemberships> => {
    const [membership] = await db(TableName.Membership)
      .insert({
        scope: AccessScope.Organization,
        scopeOrgId: orgId,
        actorUserId: userId,
        status: OrgMembershipStatus.Accepted,
        isActive: true
      })
      .returning("*");
    await db(TableName.MembershipRole).insert({ membershipId: membership.id, role });
    return membership;
  };

  const project = async ({
    orgId,
    environments = DEFAULT_ENVIRONMENTS,
    ...overrides
  }: Partial<TProjectsInsert> & {
    orgId: string;
    environments?: { name: string; slug: string }[];
  }): Promise<{ project: TProjects; environments: TProjectEnvironments[] }> => {
    const id = randomId();
    const [row] = await db(TableName.Project)
      .insert({ name: `project-${id}`, slug: `project-${id}`, type: ProjectType.SecretManager, orgId, ...overrides })
      .returning("*");

    const envRows: TProjectEnvironments[] = environments.length
      ? await db(TableName.Environment)
          .insert(environments.map((env, position) => ({ ...env, position: position + 1, projectId: row.id })))
          .returning("*")
      : [];

    return { project: row, environments: envRows };
  };

  const projectMembership = async ({
    orgId,
    projectId,
    userId,
    role = ProjectMembershipRole.Admin
  }: {
    orgId: string;
    projectId: string;
    userId: string;
    role?: ProjectMembershipRole;
  }): Promise<TMemberships> => {
    const [membership] = await db(TableName.Membership)
      .insert({
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: projectId,
        actorUserId: userId,
        status: OrgMembershipStatus.Accepted,
        isActive: true
      })
      .returning("*");
    await db(TableName.MembershipRole).insert({ membershipId: membership.id, role });
    return membership;
  };

  const tenant = async ({
    projectType = ProjectType.SecretManager
  }: { projectType?: ProjectType } = {}): Promise<TTenant> => {
    const org = await organization();
    const admin = await user();
    const adminOrgMembership = await orgMembership({ orgId: org.id, userId: admin.id });
    const created = await project({ orgId: org.id, type: projectType });
    await projectMembership({ orgId: org.id, projectId: created.project.id, userId: admin.id });

    return { org, admin, adminOrgMembership, project: created.project, environments: created.environments };
  };

  return { user, organization, orgMembership, project, projectMembership, tenant };
};

export type TPlatformFactories = ReturnType<typeof createPlatformFactories>;
