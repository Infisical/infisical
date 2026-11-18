import type { TActorContext } from "@app/domains/lib/actor-context";
import { ActorType } from "@app/lib/auth/actor-types";
import { SecretSharingAccessType, TActorInput } from "@app/lib/types";

export enum SecretSharingType {
  Share = "share",
  Request = "request"
}

export type TGetSharedSecretsDTO = {
  type: SecretSharingType;
  offset: number;
  limit: number;
} & TActorInput;

export type TSharedSecretPermission = TActorInput & {
  orgId: string;
  accessType?: SecretSharingAccessType;
  name?: string;
  password?: string;
  emails?: string[];
  allowExternalEmails?: boolean;
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
  actor?: ActorType;
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
  orgId: string;
} & TActorInput;

export type TRevealSecretRequestValueDTO = {
  id: string;
  orgId: string;
} & TActorInput;

export type TGetSecretRequestByIdDTO = {
  id: string;
  actor?: TActorContext;
};

export type TSetSecretRequestValueDTO = {
  id: string;
  secretValue: string;
  actor?: TActorContext;
};

export type TDeleteSharedSecretDTO = {
  sharedSecretId: string;
  type: SecretSharingType;
} & TSharedSecretPermission;
