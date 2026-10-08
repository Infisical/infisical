import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { AgentVaultMemberType } from "./agent-vault-enums";

export type TAgentVaultActorNameDALs = {
  userDAL: Pick<TUserDALFactory, "find">;
  groupDAL: Pick<TGroupDALFactory, "find">;
  identityDAL: Pick<TIdentityDALFactory, "find">;
};

export type TAgentVaultActorName = { name: string; email?: string | null };

export const agentVaultActorKey = (actor: { type: AgentVaultMemberType; id: string }) => `${actor.type}:${actor.id}`;

// Not org-scoped, so a name may only be surfaced for an actor already proven to be in the org: for any other,
// it would hand back another tenant's names, and tell a real id apart from a made-up one.
export const resolveAgentVaultActorNames = async (
  { userDAL, groupDAL, identityDAL }: TAgentVaultActorNameDALs,
  actors: { type: AgentVaultMemberType; id: string }[]
) => {
  const idsOf = (type: AgentVaultMemberType) => actors.filter((actor) => actor.type === type).map((actor) => actor.id);
  const userIds = idsOf(AgentVaultMemberType.User);
  const groupIds = idsOf(AgentVaultMemberType.Group);
  const identityIds = idsOf(AgentVaultMemberType.MachineIdentity);

  const [users, groups, identities] = await Promise.all([
    userIds.length ? userDAL.find({ $in: { id: userIds } }) : [],
    groupIds.length ? groupDAL.find({ $in: { id: groupIds } }) : [],
    identityIds.length ? identityDAL.find({ $in: { id: identityIds } }) : []
  ]);

  const nameByKey = new Map<string, TAgentVaultActorName>();
  users.forEach((user) =>
    nameByKey.set(agentVaultActorKey({ type: AgentVaultMemberType.User, id: user.id }), {
      name: user.username,
      email: user.email
    })
  );
  groups.forEach((group) =>
    nameByKey.set(agentVaultActorKey({ type: AgentVaultMemberType.Group, id: group.id }), { name: group.name })
  );
  identities.forEach((identity) =>
    nameByKey.set(agentVaultActorKey({ type: AgentVaultMemberType.MachineIdentity, id: identity.id }), {
      name: identity.name
    })
  );
  return nameByKey;
};
