export enum UserSecretType {
  WEB_LOGIN = "WEB_LOGIN",
  CREDIT_CARD = "CREDIT_CARD",
  SECURE_NOTE = "SECURE_NOTE"
}

// Base types
interface BaseUserSecret {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// Secret data types
export type WebLoginData = {
  url?: string;
  username: string;
  password: string;
};

export type CreditCardData = {
  cardNumber: string;
  expiryDate: string;
  cvv: string;
};

export type SecureNoteData = {
  content: string;
};

// Form data types with discriminated unions
export type WebLoginFormData = {
  name: string;
  data: {
    type: UserSecretType.WEB_LOGIN;
    data: WebLoginData;
  };
};

export type CreditCardFormData = {
  name: string;
  data: {
    type: UserSecretType.CREDIT_CARD;
    data: CreditCardData;
  };
};

export type SecureNoteFormData = {
  name: string;
  data: {
    type: UserSecretType.SECURE_NOTE;
    data: SecureNoteData;
  };
};

// User Secret type with discriminated union
export type UserSecret = BaseUserSecret & (
  | { type: UserSecretType.WEB_LOGIN; data: WebLoginData }
  | { type: UserSecretType.CREDIT_CARD; data: CreditCardData }
  | { type: UserSecretType.SECURE_NOTE; data: SecureNoteData }
);

// API DTOs
export type CreateUserSecretDTO = 
  | WebLoginFormData
  | CreditCardFormData
  | SecureNoteFormData;

export type UpdateUserSecretDTO = {
  id: string;
  name?: string;
  data?: {
    type: UserSecretType;
    data: WebLoginData | CreditCardData | SecureNoteData;
  };
};

// API response types
export interface GetUserSecretsResponse {
  secrets: UserSecret[];
  totalCount: number;
}

// Common base type for form components
export type BaseFormData = {
  name: string;
}; 