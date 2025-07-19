import { ReminderType } from "@app/services/reminder/reminder-enums";

import { registerSecretReminderRouter } from "./secret-reminder-router";

export const SECRET_REMINDER_REGISTER_ROUTER_MAP: Record<ReminderType, (server: FastifyZodProvider) => Promise<void>> =
  {
    [ReminderType.SECRETS]: registerSecretReminderRouter
  };
