import { FastifyRequest } from "fastify";

import { AgentVaultMemberType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { TGenericPermission } from "@app/lib/types";

export const actorContext = (req: FastifyRequest): TGenericPermission => ({
  actorId: req.permission.id,
  actor: req.permission.type,
  actorOrgId: req.permission.orgId,
  actorAuthMethod: req.permission.authMethod
});

export const auditActorFields = (actor: { type: AgentVaultMemberType; id: string }) => ({
  ...(actor.type === AgentVaultMemberType.User && { userId: actor.id }),
  ...(actor.type === AgentVaultMemberType.MachineIdentity && { machineIdentityId: actor.id }),
  ...(actor.type === AgentVaultMemberType.Group && { groupId: actor.id })
});
