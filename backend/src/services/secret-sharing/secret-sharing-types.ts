import { ActorAuthMethod, ActorType } from "../auth/auth-type";

export type TSharedSecretPermission = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  orgId: string;
};

export type TCreateSharedSecretDTO = {
  name: string;
  encryptedValue: string;
  iv: string;
  tag: string;
  hashedHex: string;
  expiresAt: Date;
} & TSharedSecretPermission;

export type TDeleteSharedSecretDTO = {
  sharedSecretId: string;
} & TSharedSecretPermission;
