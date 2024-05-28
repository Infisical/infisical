export type TSharedSecret = {
  id: string;
  name: string;
  signedValue: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type TCreateSharedSecretRequest = {
  name: string;
  signedValue: string;
  expiresAt: Date;
  workspaceId: string;
};

export type TViewSharedSecretResponse = {
  name: string;
  signedValue: string;
  expiresAt: Date;
};

export type TDeleteSharedSecretRequest = {
  sharedSecretId: string;
  workspaceId: string;
};
