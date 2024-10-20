import { TGenericPermission,SecretSharingAccessType } from "@app/lib/types";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";

export type TGetAllSecretsDTO = {
  offset: number;
  limit: number;
} & TGenericPermission;

export type TUpdateUserSecretDTO = {
  id: string;
  updateData: any; 
};


export type TUserSecretPermission = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  orgId: string;
  accessType?: SecretSharingAccessType;
  name?: string;
  password?: string;
};

export type TDeleteUserSecretDTO = {
  secretId: string;
} & TUserSecretPermission;
