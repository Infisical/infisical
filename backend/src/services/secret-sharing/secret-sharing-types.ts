import { ActorAuthMethod, ActorType } from "../auth/auth-type";

export type TSharedSecretPermission = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  projectId: string;
};

export type TCreateSharedSecretDTO = {
  name: string;
  signedValue: string;
  expiresAt: Date;
} & TSharedSecretPermission;

export type TDeleteSharedSecretDTO = {
  sharedSecretId: string;
} & TSharedSecretPermission;
