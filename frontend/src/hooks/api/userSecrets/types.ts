export enum UserSecretType {
  WEB_LOGIN = "WEB_LOGIN",
  CREDIT_CARD = "CREDIT_CARD",
  SECURE_NOTE = "SECURE_NOTE"
}

// Base types
interface BaseUserSecret {
  id: string;
  organizationId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// Secret data types
type WebLoginData = {
  url?: string;
  username: string;
  password: string;
};

type CreditCardData = {
  cardNumber: string;
  expiryDate: string;
  cvv: string;
};

type SecureNoteData = {
  content: string;
};

// User Secret types using discriminated union
export type UserSecret = BaseUserSecret & (
  | { type: UserSecretType.WEB_LOGIN; data: WebLoginData }
  | { type: UserSecretType.CREDIT_CARD; data: CreditCardData }
  | { type: UserSecretType.SECURE_NOTE; data: SecureNoteData }
);

// API DTOs
export type CreateUserSecretDTO = Omit<UserSecret, "id" | "createdAt" | "updatedAt" | "createdBy">;
export type UpdateUserSecretDTO = { id: string } & Partial<CreateUserSecretDTO>;

// API params and response
export interface GetUserSecretsParams {
  organizationId: string;
  offset?: number;
  limit?: number;
}

export interface GetUserSecretsResponse {
  secrets: UserSecret[];
  totalCount: number;
}

// Common form type for both create and edit
export type UserSecretFormData = {
  type: UserSecretType;
  name: string;
  data: UserSecret["data"];
}; 