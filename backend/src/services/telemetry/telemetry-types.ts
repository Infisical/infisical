export enum PostHogEventTypes {
  SecretPush = "secrets pushed",
  SecretPulled = "secrets pulled",
  SecretCreated = "secrets added",
  SecretUpdated = "secrets modified",
  SecretDeleted = "secrets deleted",
  AdminInit = "admin initialization",
  UserSignedUp = "User Signed Up",
  SecretRotated = "secrets rotated",
  SecretScannerFull = "historical cloud secret scan",
  SecretScannerPush = "cloud secret scan"
}

export type TSecretModifiedEvent = {
  event:
    | PostHogEventTypes.SecretPush
    | PostHogEventTypes.SecretRotated
    | PostHogEventTypes.SecretPulled
    | PostHogEventTypes.SecretCreated
    | PostHogEventTypes.SecretUpdated
    | PostHogEventTypes.SecretDeleted;
  properties: {
    numberOfSecrets: number;
    environment: string;
    workspaceId: string;
    secretPath: string;
    channel?: string;
    userAgent?: string;
  };
};

export type TAdminInitEvent = {
  event: PostHogEventTypes.AdminInit;
  properties: {
    email: string;
    firstName: string;
    lastName: string;
  };
};

export type TUserSignedUpEvent = {
  event: PostHogEventTypes.UserSignedUp;
  properties: {
    email: string;
    attributionSource?: string;
  };
};

export type TSecretScannerEvent = {
  event: PostHogEventTypes.SecretScannerFull | PostHogEventTypes.SecretScannerPush;
  properties: {
    numberOfRisks: number;
  };
};

export type TPostHogEvent = { distinctId: string } & (
  | TSecretModifiedEvent
  | TAdminInitEvent
  | TUserSignedUpEvent
  | TSecretScannerEvent
);
