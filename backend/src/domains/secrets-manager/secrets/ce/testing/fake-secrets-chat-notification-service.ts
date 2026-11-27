import { TSecretsChatNotification, TSecretsChatNotificationService } from "../services/chat-notification/service";

// For legacy callers' tests: records every notification the caller asked for.
export class FakeSecretsChatNotificationService implements TSecretsChatNotificationService {
  readonly notifications: { projectId: string; notification: TSecretsChatNotification }[] = [];

  notify = async (input: { projectId: string; notification: TSecretsChatNotification }) => {
    this.notifications.push(input);
  };
}
