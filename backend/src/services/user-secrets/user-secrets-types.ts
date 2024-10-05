import { TUserSecretCredentials, TUserSecretCredentialsInsert, TUserSecrets } from "@app/db/schemas";

export enum CredentialTypes {
  WebLogin = "web_login",
  CreditCard = "credit_card",
  SecureNote = "secure_note"
}

export type GetSecretReturnType = TUserSecrets & TUserSecretCredentials;

export type CreateSecretDALParamsType = Omit<TUserSecretCredentialsInsert, "secretId"> & {
  userId: string;
  orgId: string;
};

export type CreateSecretFuncParamsType = Omit<TUserSecretCredentialsInsert, "secretId" | "fields"> & {
  fields: Record<string, string>;
  orgId: string;
  userId: string;
};

export type GetSecretsServiceReturnType = {
  title: string;
  fields: Record<string, string>;
};
