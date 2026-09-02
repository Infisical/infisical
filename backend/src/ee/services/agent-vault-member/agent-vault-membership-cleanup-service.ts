import { Knex } from "knex";

import { TAgentVaultAccessBundleMemberDALFactory } from "./agent-vault-access-bundle-member-dal";

type TAgentVaultMembershipCleanupServiceFactoryDep = {
  agentVaultAccessBundleMemberDAL: Pick<
    TAgentVaultAccessBundleMemberDALFactory,
    "deleteActorGrantsInProject" | "deleteUserGrantsInProject"
  >;
};

export type TAgentVaultMembershipCleanupServiceFactory = ReturnType<typeof agentVaultMembershipCleanupServiceFactory>;

export enum AgentVaultMemberKind {
  User = "user",
  Identity = "identity",
  Group = "group"
}

// Access-bundle grants live in our own join table, so the shared application-membership reaper does not
// see them. Without this, an actor removed from the Agent Vault project keeps a live grant the mint path
// still honours. Wired into the same five call sites as that reaper, inside the same transaction.
export const agentVaultMembershipCleanupServiceFactory = ({
  agentVaultAccessBundleMemberDAL
}: TAgentVaultMembershipCleanupServiceFactoryDep) => {
  const cleanupActorAgentVaultMemberships = async (
    { projectId, actorKind, actorId }: { projectId: string; actorKind: AgentVaultMemberKind; actorId: string },
    tx: Knex
  ) => {
    const actorFilter: Record<string, string> = {};
    if (actorKind === AgentVaultMemberKind.User) actorFilter.userId = actorId;
    else if (actorKind === AgentVaultMemberKind.Identity) actorFilter.identityId = actorId;
    else actorFilter.groupId = actorId;

    await agentVaultAccessBundleMemberDAL.deleteActorGrantsInProject({ projectId, actorFilter }, tx);
  };

  const cleanupUsersAgentVaultMemberships = async (
    { projectId, userIds }: { projectId: string; userIds: string[] },
    tx: Knex
  ) => {
    if (!userIds.length) return;
    await agentVaultAccessBundleMemberDAL.deleteUserGrantsInProject({ projectId, userIds }, tx);
  };

  return { cleanupActorAgentVaultMemberships, cleanupUsersAgentVaultMemberships };
};
