import { Tables } from "knex/types/tables";

import { TableName } from "@app/db/schemas";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";

// Align with frontend enum
export enum UserSecretType {
  WEB_LOGIN = "WEB_LOGIN",
  CREDIT_CARD = "CREDIT_CARD",
  SECURE_NOTE = "SECURE_NOTE"
}

// Permission type (from secret-sharing)
export type TUserSecretPermission = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  orgId: string;
};

// API Types (matching frontend contract)
export type TWebLoginData = {
  url?: string;
  username: string;
  password: string;
};

export type TCreditCardData = {
  cardNumber: string;
  expiryDate: string;
  cvv: string;
};

export type TSecureNoteData = {
  content: string;
};

export type TUserSecretData = TWebLoginData | TCreditCardData | TSecureNoteData;

// DTOs with permissions (for service layer)
export type TCreateUserSecretDTO = {
  name: string;
  type: UserSecretType;
  data: TUserSecretData;
} & TUserSecretPermission;

export type TUpdateUserSecretDTO = {
  secretId: string;
  data: Partial<{
    name: string;
    data: TUserSecretData;
  }>;
} & TUserSecretPermission;

export type TGetUserSecretDTO = {
  secretId: string;
} & TUserSecretPermission;

export type TListUserSecretsDTO = {
  offset?: number;
  limit?: number;
} & TUserSecretPermission;

export type TDeleteUserSecretDTO = {
  secretId: string;
} & TUserSecretPermission;

// Response types (matching frontend contract)
export type TUserSecretResponse = {
  id: string;
  name: string;
  type: UserSecretType;
  data: TUserSecretData;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type TListUserSecretsResponse = {
  secrets: TUserSecretResponse[];
  totalCount: number;
};

export type TUserSecret = Tables[TableName.UserSecrets]["base"];
