import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

export type TAgentVaultActorContext = {
  actor: ActorType;
  actorId: string;
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
};
