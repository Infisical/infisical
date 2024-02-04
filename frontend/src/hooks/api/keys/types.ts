export type UserWsKeyPair = {
  id: string;
  encryptedKey: string;
  nonce: string;
  sender: Sender;
  receiver: string;
  workspace: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
};

export type Sender = {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
  firstName: string;
  lastName: string;
  publicKey: string;
};

export type UploadWsKeyDTO = {
  userId: string;
  encryptedKey: string;
  nonce: string;
  workspaceId: string;
};
