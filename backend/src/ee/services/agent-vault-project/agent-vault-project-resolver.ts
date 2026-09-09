import { Knex } from "knex";

import { ProjectType } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { bootstrapAgentVaultProject } from "./agent-vault-project-bootstrap";

type TResolverDeps = {
  db: Knex;
  projectDAL: Pick<TProjectDALFactory, "find" | "findOne" | "create">;
  membershipDAL: Pick<TMembershipDALFactory, "create">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

export type TAgentVaultProjectResolverFactory = ReturnType<typeof agentVaultProjectResolverFactory>;

export const agentVaultProjectResolverFactory = ({
  db,
  projectDAL,
  membershipDAL,
  membershipRoleDAL,
  keyStore
}: TResolverDeps) => {
  const findDefaultProjectId = async (orgId: string, tx?: Knex): Promise<string | null> => {
    const projects = await projectDAL.find(
      { orgId, type: ProjectType.AgentVault },
      { sort: [["createdAt", "desc"]], limit: 1, tx }
    );
    return projects.length ? projects[0].id : null;
  };

  const ensureDefaultProject = async (orgId: string): Promise<string> =>
    db.transaction(async (tx) => {
      // Serialize concurrent bootstraps; a unique constraint won't work since zombie projects share type=agent-vault.
      await tx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [`agent-vault-bootstrap:${orgId}`]);

      const existingId = await findDefaultProjectId(orgId, tx);
      if (existingId) return existingId;

      // The project starts with no members. Org admins join themselves through grant-admin-access the
      // first time they open the product, which is also the only path for admins promoted later.
      const { project } = await bootstrapAgentVaultProject(
        { orgId },
        { projectDAL, membershipDAL, membershipRoleDAL },
        tx
      );
      return project.id;
    });

  return {
    resolve: (actorOrgId: string): Promise<string> =>
      withCache({
        keyStore,
        key: KeyStorePrefixes.AgentVaultDefaultProject(actorOrgId),
        ttlSeconds: KeyStoreTtls.AgentVaultDefaultProjectInSeconds,
        fetcher: async () => {
          const existingId = await findDefaultProjectId(actorOrgId);
          if (existingId) return existingId;
          return ensureDefaultProject(actorOrgId);
        }
      })
  };
};
