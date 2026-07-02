import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

export type TGetSecretsActivationStatusDTO = {
  actor: ActorType;
  actorId: string;
  actorOrgId: string;
  actorAuthMethod: ActorAuthMethod;
};
