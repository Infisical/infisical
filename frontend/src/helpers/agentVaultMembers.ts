import { AgentVaultMemberType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultActorIdsDTO, TAgentVaultActorRef } from "@app/hooks/api/agentVault/types";

// Every member write takes one array per actor kind, so the one place that splits a mixed selection
// into them lives here rather than in each dialog.
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
