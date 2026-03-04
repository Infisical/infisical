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
  expiresIn: string;
  maxViews?: number;
  accessType?: SecretSharingAccessType;
  authorizedEmails?: string[];
};

export type TCreateSecretRequestRequestDTO = {
  name?: string;
  accessType?: SecretSharingAccessType;
  expiresIn: string;
};

export type TSetSecretRequestValueRequest = {
  secretValue: string;
  id: string;
};

export type TRevealSecretRequestValueRequest = {
  id: string;
};

export type TBrandingConfig = {
  hasLogo: boolean;
  hasFavicon: boolean;
  primaryColor?: string;
  secondaryColor?: string;
};

// Sanitized shared secret - omits sensitive fields like password, encryptedSecret, etc.
export type TSanitizedSharedSecret = {
  id: string;
  userId: string | null;
  orgId: string | null;
  createdAt: string;
  updatedAt: string;
  name: string | null;
  lastViewedAt: string | null;
  accessType: SecretSharingAccessType;
  expiresAt: string;
  expiresAfterViews: number | null;
};

export type TSharedSecretPublicDetails = TSanitizedSharedSecret & {
  isPasswordProtected: boolean;
};

export type TAccessSharedSecretResponse = {
  secretValue: string;
  accessType: SecretSharingAccessType;
  orgName?: string;
  expiresAt?: Date | string;
  expiresAfterViews?: number | null;
};

export type TAccessSharedSecretRequest = {
  sharedSecretId: string;
  password?: string;
};

export type TGetSecretRequestByIdResponse = {
  request: {
    id: string;
    orgId: string;
    accessType: SecretSharingAccessType;
    requester: {
      organizationName: string;
      username: string;
      firstName?: string;
      lastName?: string;
    };
  };
  brandingConfig?: TBrandingConfig;
  isSecretValueSet: boolean;
  error?: string;
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
