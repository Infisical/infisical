import { FastifyRequest } from "fastify";

import { TAgentVaultActorName } from "@app/ee/services/agent-vault/agent-vault-actor-name-fns";
import { AgentVaultMemberType } from "@app/ee/services/agent-vault/agent-vault-enums";
import { TGenericPermission } from "@app/lib/types";

export const actorContext = (req: FastifyRequest): TGenericPermission => ({
  actorId: req.permission.id,
  actor: req.permission.type,
  actorOrgId: req.permission.orgId,
  actorAuthMethod: req.permission.authMethod
});

export const auditActorFields = ({
  type,
  id,
  actorName
}: {
  type: AgentVaultMemberType;
  id: string;
  actorName?: TAgentVaultActorName;
}) => ({
  ...(type === AgentVaultMemberType.User && {
    userId: id,
    userName: actorName?.name,
    ...(actorName?.email && { userEmail: actorName.email })
  }),
  ...(type === AgentVaultMemberType.MachineIdentity && { machineIdentityId: id, machineIdentityName: actorName?.name }),
  ...(type === AgentVaultMemberType.Group && { groupId: id, groupName: actorName?.name })
});
