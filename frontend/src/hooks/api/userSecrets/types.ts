export type TUpdateCredentialRequest = {
  id: string;
  credentialType: string;
  username?: string;
  password?: string;
  cardNumber?: string;
  expiryDate?: string;
  cvv?: string;
  title?: string;
  content?: string;
};

export type TUserSecret = {
  id: string;
  userId: string;
  orgId: string;
  createdAt: Date;
  updatedAt: Date;
  name: string | null;
  lastViewedAt?: Date;
  expiresAt: Date;
  expiresAfterViews: number | null;
  encryptedValue: string;
  iv: string;
  tag: string;
};