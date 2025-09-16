export enum NotificationType {
  ACCESS_APPROVAL_REQUEST = "access-approval-request",
  ACCESS_APPROVAL_REQUEST_UPDATED = "access-approval-request-updated",
  ACCESS_POLICY_BYPASSED = "access-policy-bypassed",
  SECRET_CHANGE_REQUEST = "secret-change-request"
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
