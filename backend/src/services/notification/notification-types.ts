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
  APPROVAL_REQUIRED = "approval-required"
}

export interface TCreateUserNotificationDTO {
  userId: string;
  // Adding an orgId will make the notification only show up when a user is in a certain org. Otherwise, it shows up in all orgs.
  // Keep in mind that org-scoped links for a notification will break if orgId is missing and the user is in the wrong org
  orgId?: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}
