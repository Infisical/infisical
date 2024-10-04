import { TUserSecretCredentials, TUserSecrets } from "@app/db/schemas";

export enum CredentialTypes {
  WebLogin = "web_login",
  CreditCard = "credit_card",
  SecureNote = "secure_note"
}

export type GetSecretReturnType = TUserSecrets & TUserSecretCredentials;
