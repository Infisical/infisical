export type TUserSecret = {
  id: string;
  userId: string;
  orgId: string;
  title: string | null;
  content: string | null;
  username: string | null;
  password: string | null;
  cardNumber: string | null;
  expiryDate: string | null;
  cvv: string | null;
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
