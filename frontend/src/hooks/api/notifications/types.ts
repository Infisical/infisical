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
