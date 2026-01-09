export type TSharedSecret = {
  id: string;
  userId: string;
  orgId: string;
  createdAt: Date;
  updatedAt: Date;
  name: string | null;
  lastViewedAt?: Date;
  accessType: SecretSharingAccessType;
  expiresAt: Date;
  expiresAfterViews: number | null;
  encryptedValue: string;
  encryptedSecret: string;
  iv: string;
  tag: string;
};

export type TRevealedSecretRequest = {
  secretRequest: {
    secretValue: string;
  } & TSharedSecret;
};

export type TCreatedSharedSecret = {
  id: string;
};

export type TCreateSharedSecretRequest = {
  name?: string;
  password?: string;
  secretValue: string;
  expiresAt: Date;
  expiresAfterViews?: number;
  accessType?: SecretSharingAccessType;
  emails?: string[];
};

export type TCreateSecretRequestRequestDTO = {
  name?: string;
  accessType?: SecretSharingAccessType;
  expiresAt: Date;
};

export type TSetSecretRequestValueRequest = {
  secretValue: string;
  id: string;
};

export type TRevealSecretRequestValueRequest = {
  id: string;
};

export type TSharedSecretResponse = {
  secretValue?: string;
  encryptedValue: string;
  iv: string;
  tag: string;
  accessType: SecretSharingAccessType;
  orgName?: string;
  expiresAt?: Date | string;
  expiresAfterViews?: number | null;
};

export type TViewSharedSecretResponse = {
  isPasswordProtected: boolean;
  brandingConfig?: {
    hasLogoUrl: boolean;
    hasFaviconUrl: boolean;
    primaryColor?: string;
    secondaryColor?: string;
  };
  secret?: TSharedSecretResponse;
  error?: string;
};

export type TGetSecretRequestByIdResponse = {
  secretRequest: {
    isSecretValueSet: boolean;
    accessType: SecretSharingAccessType;
    requester: {
      organizationName: string;
      username: string;
      firstName?: string;
      lastName?: string;
    };
  };
};

export type TDeleteSharedSecretRequestDTO = {
  sharedSecretId: string;
};

export type TDeleteSecretRequestDTO = {
  secretRequestId: string;
};

export enum SecretSharingAccessType {
  Anyone = "anyone",
  Organization = "organization"
}
