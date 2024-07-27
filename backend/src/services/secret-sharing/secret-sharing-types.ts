import { SecretSharingAccessType } from "@app/lib/types";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";

export type TSharedSecretPermission = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  orgId: string;
  accessType?: SecretSharingAccessType;
};

export type TCreatePublicSharedSecretDTO = {
  encryptedValue: string;
  iv: string;
  tag: string;
  hashedHex: string;
  expiresAt: string;
  expiresAfterViews?: number;
  accessType: SecretSharingAccessType;
};

export type TCreateSharedSecretDTO = TSharedSecretPermission & TCreatePublicSharedSecretDTO;

export type TDeleteSharedSecretDTO = {
  sharedSecretId: string;
} & TSharedSecretPermission;
