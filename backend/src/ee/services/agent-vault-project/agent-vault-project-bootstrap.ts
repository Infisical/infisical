import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { AccessScope, ProjectMembershipRole, ProjectType, ProjectVersion, TProjects } from "@app/db/schemas";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

type TBootstrapDeps = {
  projectDAL: Pick<TProjectDALFactory, "create" | "findOne">;
  membershipDAL: Pick<TMembershipDALFactory, "create">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
};

type TBootstrapInput = {
  orgId: string;
  adminUserIds?: string[];
  adminIdentityIds?: string[];
  adminGroupIds?: string[];
};

// One Agent Vault project per org, seeded with the org's current admins. Unlike PAM there is nothing else to
// seed: access bundles and proxies are all created by hand.
export const bootstrapAgentVaultProject = async (
  { orgId, adminUserIds = [], adminIdentityIds = [], adminGroupIds = [] }: TBootstrapInput,
  { projectDAL, membershipDAL, membershipRoleDAL }: TBootstrapDeps,
  tx: Knex
): Promise<{ project: TProjects; created: boolean }> => {
  const existing = await projectDAL.findOne({ orgId, type: ProjectType.AgentVault }, tx);
  if (existing) {
    return { project: existing, created: false };
  }

  const slug = slugify(`agent-vault-${alphaNumericNanoId(4)}`);

  const project = await projectDAL.create(
    {
      name: "Agent Vault",
      slug,
      type: ProjectType.AgentVault,
      orgId,
      version: ProjectVersion.V3,
      pitVersionLimit: 10
    },
    tx
  );

  const adminActors: Array<{ actorUserId: string } | { actorIdentityId: string } | { actorGroupId: string }> = [
    ...adminUserIds.map((actorUserId) => ({ actorUserId })),
    ...adminIdentityIds.map((actorIdentityId) => ({ actorIdentityId })),
    ...adminGroupIds.map((actorGroupId) => ({ actorGroupId }))
  ];

  for (const actor of adminActors) {
    // eslint-disable-next-line no-await-in-loop
    const membership = await membershipDAL.create(
      {
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: project.id,
        ...actor,
        isActive: true
      },
      tx
    );

    // eslint-disable-next-line no-await-in-loop
    await membershipRoleDAL.create(
      {
        membershipId: membership.id,
        role: ProjectMembershipRole.Admin
      },
      tx
    );
  }

  return { project, created: true };
};
