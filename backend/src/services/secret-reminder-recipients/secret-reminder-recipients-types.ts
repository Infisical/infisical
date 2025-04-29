export type TSecretReminderRecipient = {
  user: {
    id: string;
    username: string;
    email?: string | null;
  };
  id: string;
};
