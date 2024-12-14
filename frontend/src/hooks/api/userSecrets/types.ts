export type TUserSecret = {
  id: string;
  userId: string;
  orgId: string;
  title?: string;
  content?: string;
  username?: string;
  password?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
};

export type TCreatedUserSecret = {
  id: string;
};

export type TCreateUserSecretRequest = {
  title?: string;
  content?: string;
  username?: string;
  password?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
};

export type TDeleteUserSecretRequest = {
  userSecretId: string;
}

export type TUpdateUserSecretRequest = TCreateUserSecretRequest & TDeleteUserSecretRequest;
