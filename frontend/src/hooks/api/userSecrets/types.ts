export type TUserSecret = {
  id: string;
  secretType: UserSecretType;
  name: string;
  loginURL: null | string;
  username: null | string;
  password: null | string;
  isUsernameSecret: boolean;
  cardNumber: null | string;
  cardExpiry: null | string;
  cardLastFourDigits: null | string;
  cardCvv: null | string;
  secureNote: null | string;
  createdAt: Date;
  updatedAt: Date;
};

export const enum UserSecretType {
  WEB_LOGIN = "web_login",
  CREDIT_CARD = "credit_card",
  SECURE_NOTE = "secure_note"
}

export type TUserSecretRequest = {
  secretType: UserSecretType;
  name: string;
  loginURL?: string;
  username?: string;
  password?: string;
  isUsernameSecret: boolean;
  cardLastFourDigits?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  secureNote?: string;
};

export type TDeleteUserSecretRequest = {
  id: string;
};

export type TUserSecretResponse = {
  id: string;
};
