import { SecretSharingAccessType, TGenericPermission, TOrgPermission } from "@app/lib/types";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";

export enum SecretSharingType {
  Share = "share",
  Request = "request"
}

export type TGetSharedSecretsDTO = {
  type: SecretSharingType;
  offset: number;
  limit: number;
} & TGenericPermission;

export type TSharedSecretPermission = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  orgId: string;
  accessType?: SecretSharingAccessType;
  name?: string;
  password?: string;
  authorizedEmails?: string[];
};

export type TCreatePublicSharedSecretDTO = {
  secretValue: string;
  expiresIn: string;
  maxViews?: number;
  password?: string;
  accessType: SecretSharingAccessType;
};

export type TGetActiveSharedSecretByIdDTO = {
  sharedSecretId: string;
  orgId?: string;
  actorId?: string;
  password?: string;
};

export type TValidateActiveSharedSecretDTO = TGetActiveSharedSecretByIdDTO & {
  password: string;
};

export type TCreateSharedSecretDTO = TSharedSecretPermission & TCreatePublicSharedSecretDTO;

export type TCreateSecretRequestDTO = {
  name?: string;
  accessType: SecretSharingAccessType;
  expiresIn: string;
} & TOrgPermission;

export type TRevealSecretRequestValueDTO = {
  id: string;
} & TOrgPermission;

export type TGetSecretRequestByIdDTO = {
  id: string;
} & Omit<TOrgPermission, "orgId">;

export type TSetSecretRequestValueDTO = {
  id: string;
  secretValue: string;
} & Omit<TOrgPermission, "orgId">;

export type TDeleteSharedSecretDTO = {
  sharedSecretId: string;
  type: SecretSharingType;
} & TSharedSecretPermission;
