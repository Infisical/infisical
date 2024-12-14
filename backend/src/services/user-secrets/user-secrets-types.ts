import { ActorAuthMethod, ActorType } from "../auth/auth-type";

export type TUserSecretPermission = {
  actor: ActorType;
  actorId: string;
  orgId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
}

export type TCreateUserSecretDTO = {
  title?: string;
  content?: string;
  username?: string;
  password?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
} & TUserSecretPermission;

export type TUserSecretUpdateDTO = { userSecretId: string; } & TCreateUserSecretDTO;

export type TDeleteUserSecretDTO = {
  userSecretId: string;
} & TUserSecretPermission;
