import { FastifyRequest } from "fastify";

import { TAgentVaultActorContext } from "@app/ee/services/agent-vault/agent-vault-actor-types";
import { AgentVaultMemberType } from "@app/ee/services/agent-vault/agent-vault-enums";

export const actorContext = (req: FastifyRequest): TAgentVaultActorContext => ({
  actorId: req.permission.id,
  actor: req.permission.type,
  actorOrgId: req.permission.orgId,
  actorAuthMethod: req.permission.authMethod
});

export const auditActorFields = (actor: { type: AgentVaultMemberType; id: string }) => ({
  ...(actor.type === AgentVaultMemberType.User && { userId: actor.id }),
  ...(actor.type === AgentVaultMemberType.MachineIdentity && { identityId: actor.id }),
  ...(actor.type === AgentVaultMemberType.Group && { groupId: actor.id })
});
