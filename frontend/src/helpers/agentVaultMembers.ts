import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultActorIdsDTO, TAgentVaultActorRef } from "@app/hooks/api/agentVault/types";

export const actorIdsPayload = (actors: TAgentVaultActorRef[]): TAgentVaultActorIdsDTO => ({
  userIds: actors
    .filter((actor) => actor.type === AgentVaultMemberType.User)
    .map((actor) => actor.id),
  groupIds: actors
    .filter((actor) => actor.type === AgentVaultMemberType.Group)
    .map((actor) => actor.id),
  machineIdentityIds: actors
    .filter((actor) => actor.type === AgentVaultMemberType.MachineIdentity)
    .map((actor) => actor.id)
});
