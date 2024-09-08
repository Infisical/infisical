export enum CredentialKind {
  login = "login",
  secureNote = "secureNote",
  creditCard = "creditCard",
}

type CredentialVariant = {
  kind: CredentialKind.login;
  website: string
  username: string;
  password: string;
} | {
  kind: CredentialKind.secureNote;
  note: string;
} | {
  kind: CredentialKind.creditCard;
  cardNumber: string;
  expiry: string;
  cvv: string;
}

export type TUserCredential = {
  id?: string;
  name: string;
} & CredentialVariant


