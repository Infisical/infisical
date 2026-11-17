import type { TAlert, TListAlertsDTO } from "@app/hooks/api/alerts/types";
import type { OrgUser } from "@app/hooks/api/users/types";

import type { V4QueryResult } from "../contract";

export type SecretsReminderChannelsAdapter = {
  useReminderAlerts: (
    dto: TListAlertsDTO,
    options?: { enabled?: boolean }
  ) => V4QueryResult<TAlert[]>;
  useReminderMembers: (orgId: string) => V4QueryResult<OrgUser[]>;
};
