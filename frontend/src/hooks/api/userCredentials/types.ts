export enum CredentialKind {
  login = "login",
  secureNote = "secureNote",
}

type CredentialVariant = {
  kind: CredentialKind.login;
  website: string
  username: string;
  password: string;
} | {
  kind: CredentialKind.secureNote;
  note: string;
}

export type TUserCredential = {
  credentialId?: string;
  name: string;
} & CredentialVariant


