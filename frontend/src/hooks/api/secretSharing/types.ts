export type TSharedSecret = {
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

export type TCreateSharedSecretRequest = {
  name?: string;
  password?: string;
  encryptedValue: string;
  hashedHex: string;
  iv: string;
  tag: string;
  expiresAt: Date;
  expiresAfterViews?: number;
  accessType?: SecretSharingAccessType;
};

export type TViewSharedSecretResponse = {
  isPasswordProtected: boolean;
  secret: {
    encryptedValue: string;
    iv: string;
    tag: string;
    accessType: SecretSharingAccessType;
    orgName?: string;
  };
};

export type TDeleteSharedSecretRequest = {
  sharedSecretId: string;
};

export enum SecretSharingAccessType {
  Anyone = "anyone",
  Organization = "organization"
}

