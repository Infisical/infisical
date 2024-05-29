export type TSharedSecret = {
  id: string;
  name: string;
  encryptedValue: string;
  iv: string;
  tag: string;
  hashedHex: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type TCreateSharedSecretRequest = {
  name: string;
  encryptedValue: string;
  iv: string;
  tag: string;
  hashedHex: string;
  expiresAt: Date;
};

export type TViewSharedSecretResponse = {
  name: string;
  encryptedValue: string;
  iv: string;
  tag: string;
  expiresAt: Date;
};

export type TDeleteSharedSecretRequest = {
  sharedSecretId: string;
};
