import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { AccessScope, ProjectMembershipRole, ProjectType, ProjectVersion, TProjects } from "@app/db/schemas";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

type TBootstrapDeps = {
  projectDAL: Pick<TProjectDALFactory, "create" | "find">;
  membershipDAL: Pick<TMembershipDALFactory, "create">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
};

type TBootstrapInput = {
  orgId: string;
  adminUserIds?: string[];
  adminIdentityIds?: string[];
};

// Orgs created before this existed get their project lazily from the secret scanning project resolver.
export const bootstrapSecretScanningProject = async (
  { orgId, adminUserIds = [], adminIdentityIds = [] }: TBootstrapInput,
  { projectDAL, membershipDAL, membershipRoleDAL }: TBootstrapDeps,
  tx: Knex
): Promise<{ project: TProjects; created: boolean }> => {
  // Orgs from before the one-project limit can have several; the newest one is the active project.
  const existing = await projectDAL.find(
    { orgId, type: ProjectType.SecretScanning },
    { sort: [["createdAt", "desc"]], limit: 1, tx }
  );
  if (existing.length) {
    return { project: existing[0], created: false };
  }

  const project = await projectDAL.create(
    {
      name: "Secret Scanning",
      slug: slugify(`secret-scanning-${alphaNumericNanoId(4)}`),
      type: ProjectType.SecretScanning,
      orgId,
      version: ProjectVersion.V3,
      pitVersionLimit: 10
    },
    tx
  );

  const adminActors: Array<{ actorUserId: string } | { actorIdentityId: string }> = [
    ...adminUserIds.map((actorUserId) => ({ actorUserId })),
    ...adminIdentityIds.map((actorIdentityId) => ({ actorIdentityId }))
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
