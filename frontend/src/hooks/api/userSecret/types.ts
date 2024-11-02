export enum CredentialType {
  WEB_LOGIN = 'webLogin',
  CREDIT_CARD = 'creditCard',
  SECURE_NOTE = 'secureNote',
}

// Base credential interface
export interface IBaseCredential {
  id?: string;
  type: CredentialType;
  name: string;
  tags?: string[];
  folder?: string;
  description?: string;
}

// Web Login specific fields
export interface IWebLoginCredential extends IBaseCredential {
  type: CredentialType.WEB_LOGIN;
  username: string;
  password: string;
  website?: string;
  notes?: string;
}

// Credit Card specific fields
export interface ICreditCardCredential extends IBaseCredential {
  type: CredentialType.CREDIT_CARD;
  cardNumber: string;
  cardholderName: string;
  expiryDate: string;
  cvv: string;
  brand?: string;
  notes?: string;
}

// Secure Note specific fields
export interface ISecureNoteCredential extends IBaseCredential {
  type: CredentialType.SECURE_NOTE;
  content: string;
}

// Union type for all credential types
export type TCredential = 
  | IWebLoginCredential 
  | ICreditCardCredential 
  | ISecureNoteCredential;

// Form state types
export type TCredentialFormData = {
  type: CredentialType;
  name: string;
  tags?: string[];
  folder?: string;
} & Partial<
  | Omit<IWebLoginCredential, keyof IBaseCredential>
  | Omit<ICreditCardCredential, keyof IBaseCredential>
  | Omit<ISecureNoteCredential, keyof IBaseCredential>
>;

export type TCredentialFormErrors = {
  type?: string;
  name?: string;
  username?: string;
  password?: string;
  website?: string;
  cardNumber?: string;
  cardholderName?: string;
  expiryDate?: string;
  cvv?: string;
  content?: string;
  tags?: string;
  folder?: string;
};

export type TCredentialFormState = {
  isSubmitting: boolean;
  isLoading: boolean;
  errors: TCredentialFormErrors;
  data: TCredentialFormData;
};


export type TUserSecret = {
  id: string;
};

export type TCreateUserSecretRequest = {
  name: string;
  secretType?: CredentialType;
  type?: CredentialType;
  description?: string;
  userName?: string;
  username?: string;
  password?: string;
  website?: string;
  cardholderName?: string;
  expiryDate?: string;
  cvv?: string;
  cardNumber?: string;
  content?: string;
  title?: string;
};
