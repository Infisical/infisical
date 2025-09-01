export enum NotificationType {
  ACCESS_APPROVAL_REQUEST = "access-approval-request"
}

export interface TUserNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  isRead: boolean;
  createdAt: Date;
}

export interface TCreateUserNotificationDTO {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}
