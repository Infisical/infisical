export type UserSecretsSharedData = {
  id: string;
  name: string;
};

export type WebLoginSecret = {
  type: "webLogin";
  password: string;
  username?: string;
} & UserSecretsSharedData;

export type CreditCardSecret = {
  type: "creditCard";
  cardNumber: string;
  expiryDate?: string;
  cvv?: string;
} & UserSecretsSharedData;

export type SecureNoteSecret = {
  type: "secureNote";
  content: string;
} & UserSecretsSharedData;

export type UserSecret = WebLoginSecret | CreditCardSecret | SecureNoteSecret;

export type NewUserSecretDTO =
  | Omit<WebLoginSecret, "id">
  | Omit<CreditCardSecret, "id">
  | Omit<SecureNoteSecret, "id">;

export type GetUserSecretsResponse = {
  webLogins: WebLoginSecret[];
  creditCards: CreditCardSecret[];
  secureNotes: SecureNoteSecret[];
};
