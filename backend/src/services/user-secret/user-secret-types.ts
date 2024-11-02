import { TUserSecretType } from "@app/lib/types";
import { ActorAuthMethod, ActorType } from "../auth/auth-type";

// Secret Data Types
export interface CreditCardData {
  cardNumber: string;
  cardHolder: string;
  expiryDate: string;
  cvv: string;
  notes?: string;
  issuer?: string;
  billingAddress?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
}

export interface WebLoginData {
  username: string;
  password: string;
  url: string;
  notes?: string;
  totp?: string; // For 2FA secrets
  customFields?: {
    key: string;
    value: string;
  }[];
}

export interface ContentData {
  content: string;
  notes?: string;
  tags?: string[];
  category?: string;
}

export type SecretData = CreditCardData | WebLoginData | ContentData;

// DTO Types
export type TCreateUserSecretDTO = {
  actor: ActorType;
  actorId: string;
  orgId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  secretType: TUserSecretType;
  name: string;
  description?: string;
  website?: string;
  userName?: string;
  password?: string;
  cvv?: string;
  expiryDate?: string;
  cardNumber?: string;
  cardholderName?: string;
  content?: string;
  title?: string;
};

export type TGetUserSecretsDTO = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  offset: number;
  limit: number;
  secretType?: TUserSecretType;
  username?: string;
  website?: string;
  password?: string;
};

export type TGetUserSecretByIdDTO = {
  secretId: string;
  actor: ActorType;
  actorId: string;
  orgId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
};

export type TDeleteUserSecretDTO = {
  actor: ActorType;
  actorId: string;
  orgId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  secretId: string;
};

export type TUpdateUserSecretDTO = {
  actor: ActorType;
  actorId: string;
  orgId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  secretType: TUserSecretType;
  name: string;
  description?: string;
  website?: string;
  userName?: string;
  password?: string;
  cvv?: string;
  expiryDate?: string;
  cardNumber?: string;
  cardholderName?: string;
  content?: string;
  title?: string;
  secretId: string;
};

// Response Types
export type TUserSecretResponse = {
  id: string;
  name: string;
  secretType: TUserSecretType;
  secretData: SecretData;
  userId: string;
  orgId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TGetUserSecretsResponse = {
  secrets: TUserSecretResponse[];
  totalCount: number;
};
