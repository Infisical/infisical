export type TBot = {
  _id: string;
  name: string;
  workspace: string;
  isActive: boolean;
  publicKey: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
};

export type TSetBotActiveStatusDto = {
  workspaceId: string;
  botId: string;
  isActive: boolean;
  botKey?: {
    encryptedKey: string;
    nonce: string;
  };
};
