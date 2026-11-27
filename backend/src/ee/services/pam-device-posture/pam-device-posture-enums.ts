import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export enum PamDevicePostureProvider {
  Rippling = "rippling"
}

export enum PamDevicePostureCheck {
  ManagedDevice = "managed-device",
  DiskEncrypted = "disk-encrypted",
  MinimumOsVersion = "minimum-os-version",
  NoPendingOsUpdate = "no-pending-os-update",
  RecentCheckIn = "recent-check-in",
  ApprovedDevice = "approved-device"
}

export enum PamDeviceVerificationStatus {
  Pending = "pending",
  Passed = "passed",
  Failed = "failed",
  Error = "error",
  Expired = "expired"
}

export enum PamDevicePlatform {
  MacOS = "macos",
  Windows = "windows",
  Linux = "linux"
}

export enum PamDevicePostureErrorCode {
  VerificationRequired = "DEVICE_VERIFICATION_REQUIRED",
  PostureFailed = "DEVICE_POSTURE_FAILED"
}

export enum PamDevicePostureScope {
  Template = "template",
  AutoApproval = "auto-approval"
}

export const PAM_DEVICE_POSTURE_PROVIDER_NAMES: Record<PamDevicePostureProvider, string> = {
  [PamDevicePostureProvider.Rippling]: "Rippling"
};

export const PAM_DEVICE_POSTURE_PROVIDER_APPS: Record<PamDevicePostureProvider, AppConnection> = {
  [PamDevicePostureProvider.Rippling]: AppConnection.Rippling
};

export const PAM_DEVICE_POSTURE_CHECK_LABELS: Record<PamDevicePostureCheck, string> = {
  [PamDevicePostureCheck.ManagedDevice]: "Managed Device",
  [PamDevicePostureCheck.DiskEncrypted]: "Disk Encrypted",
  [PamDevicePostureCheck.MinimumOsVersion]: "Minimum OS Version",
  [PamDevicePostureCheck.NoPendingOsUpdate]: "No Pending OS Update",
  [PamDevicePostureCheck.RecentCheckIn]: "Recent Check-In",
  [PamDevicePostureCheck.ApprovedDevice]: "Approved Device"
};

export const PAM_DEVICE_VERIFICATION_CODE_TTL_MS = 5 * 60 * 1000;
export const PAM_DEVICE_VERIFICATION_VALIDITY_MS = 5 * 60 * 1000;
export const PAM_DEVICE_POSTURE_MAX_CHECK_IN_HOURS = 720;
export const PAM_DEVICE_POSTURE_DEFAULT_CHECK_IN_HOURS = 24;
