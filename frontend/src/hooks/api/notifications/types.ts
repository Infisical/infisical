export enum NotificationType {
  ACCESS_APPROVAL_REQUEST = "access-approval-request",
  ACCESS_APPROVAL_REQUEST_UPDATED = "access-approval-request-updated",
  ACCESS_POLICY_BYPASSED = "access-policy-bypassed",
  SECRET_CHANGE_REQUEST = "secret-change-request",
  SECRET_CHANGE_POLICY_BYPASSED = "secret-change-policy-bypassed",
  SECRET_ROTATION_FAILED = "secret-rotation-failed",
  SECRET_SCANNING_SECRETS_DETECTED = "secret-scanning-secrets-detected",
  SECRET_SCANNING_SCAN_FAILED = "secret-scanning-scan-failed",
  LOGIN_FROM_NEW_DEVICE = "login-from-new-device",
  ADMIN_SSO_BYPASS = "admin-sso-bypass",
  IMPORT_STARTED = "import-started",
  IMPORT_SUCCESSFUL = "import-successful",
  IMPORT_FAILED = "import-failed",
  DIRECT_PROJECT_ACCESS_ISSUED_TO_ADMIN = "direct-project-access-issued-to-admin",
  PROJECT_ACCESS_REQUEST = "project-access-request",
  PROJECT_INVITATION = "project-invitation",
  SECRET_SYNC_FAILED = "secret-sync-failed",
  GATEWAY_HEALTH_ALERT = "gateway-health-alert",
  RELAY_HEALTH_ALERT = "relay-health-alert",
  APPROVAL_REQUIRED = "approval-required",
  PKI_ALERT_CHANNEL_FAILED = "pki-alert-channel-failed",
  CREDENTIAL_ROTATION_FAILED = "credential-rotation-failed"
}

export interface TUserNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

export const CRITICAL_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.GATEWAY_HEALTH_ALERT,
  NotificationType.RELAY_HEALTH_ALERT
];

export const isCriticalNotification = (type: NotificationType): boolean =>
  CRITICAL_NOTIFICATION_TYPES.includes(type);
