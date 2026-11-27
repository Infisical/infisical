export enum MicrosoftAutoenrollmentFailureReason {
  NotInAllowedGroup = "not-in-allowed-group",
  ComputerNotFound = "computer-not-found",
  ComputerDisabled = "computer-disabled",
  NoDnsHostName = "no-dns-host-name",
  DirectoryUnreachable = "directory-unreachable",
  DirectoryLookupFailed = "directory-lookup-failed",
  RenewalRefused = "renewal-refused",
  ChannelBindingUnverifiable = "channel-binding-unverifiable",
  ProfileMisconfigured = "profile-misconfigured"
}

export enum MicrosoftAutoenrollmentChannelBindingStatus {
  Enforced = "enforced",
  Unverifiable = "unverifiable",
  NotChecked = "not-checked"
}

export enum MicrosoftAutoenrollmentKeytabSource {
  Uploaded = "uploaded",
  Reused = "reused",
  Unchanged = "unchanged"
}

export enum MicrosoftAutoenrollmentIssuanceResult {
  Issued = "issued",
  Pending = "pending"
}

export enum MicrosoftAutoenrollmentMetadataKey {
  ComputerSid = "microsoft-autoenrollment-computer-sid",
  ComputerAccount = "microsoft-autoenrollment-computer-account"
}

export type TMicrosoftAutoenrollmentRequestDTO = {
  applicationId: string;
  profileId: string;
  authorizationHeader?: string;
  body: string;
  clientIp: string;
};

export type TMicrosoftAutoenrollmentResponse = {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
};

export const MICROSOFT_AUTOENROLLMENT_NOT_ENABLED_MESSAGE =
  "Microsoft Autoenrollment is not turned on for this profile in the application.";
