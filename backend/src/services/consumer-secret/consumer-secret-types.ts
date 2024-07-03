import { ActorAuthMethod, ActorType } from "../auth/auth-type";

export type TConsumerSecretPermission = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  orgId: string;
};

export type TCreateConsumerSecretDTO = {
  type: string;
  username?: string;
  password?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  title?: string;
  content?: string;
} & TConsumerSecretPermission;

export type TDeleteConsumerSecretDTO = {
  consumerSecretId: string;
} & TConsumerSecretPermission;
