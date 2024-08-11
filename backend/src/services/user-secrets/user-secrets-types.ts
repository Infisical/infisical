export const enum UserSecretType {
  WEB_LOGIN = "web_login",
  CREDIT_CARD = "credit_card",
  SECURE_NOTE = "secure_note"
}

export type TCreateUserSecretDTO = {
  actorId: string;
  secretType: UserSecretType;
  name: string;
  loginURL?: string;
  username?: string;
  password?: string;
  isUsernameSecret: boolean;
  cardNumber?: string;
  cardExpiry?: string;
  cardLastFourDigits?: string;
  cardCvv?: string;
  secureNote?: string;
};
