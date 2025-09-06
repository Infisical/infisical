export enum NotificationType {
  ACCESS_APPROVAL_REQUEST = "access-approval-request",
  ACCESS_APPROVAL_REQUEST_UPDATED = "access-approval-request-updated"
}

export interface TCreateUserNotificationDTO {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}
