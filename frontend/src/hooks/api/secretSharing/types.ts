export type TSharedSecret = {
  id: string;
  userId: string;
  orgId: string;
  createdAt: Date;
  updatedAt: Date;
} & TCreateSharedSecretRequest;

export type TCreateSharedSecretRequest = {
  encryptedValue: string;
  iv: string;
  tag: string;
  hashedHex: string;
  expiresAt: Date;
  expiresAfterViews: number;
  accessType: SecretSharingAccessType;
};

export type TViewSharedSecretResponse = {
  encryptedValue: string;
  iv: string;
  tag: string;
  accessType: SecretSharingAccessType;
  orgName?: string;
};

export type TDeleteSharedSecretRequest = {
  sharedSecretId: string;
};

export enum SecretSharingAccessType {
  Anyone = "anyone",
  Organization = "organization"
}