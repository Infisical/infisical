export enum NotificationType {
  ACCESS_APPROVAL_REQUEST = "access-approval-request"
}

export interface TCreateUserNotificationDTO {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}
