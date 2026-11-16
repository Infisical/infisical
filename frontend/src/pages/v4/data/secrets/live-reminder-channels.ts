import { useListAlerts } from "@app/hooks/api/alerts/queries";
import { useGetOrgUsers } from "@app/hooks/api/users/queries";

import type { SecretsReminderChannelsAdapter } from "./contract-reminder-channels";

export const secretsReminderChannelsLive: SecretsReminderChannelsAdapter = {
  useReminderAlerts: (dto, options) => {
    const { data, isPending, isFetching, error } = useListAlerts(dto, {
      enabled: options?.enabled,
      refetchOnMount: "always"
    });
    return {
      data: isFetching ? undefined : data,
      isPending: isPending || isFetching,
      error
    };
  },
  useReminderMembers: useGetOrgUsers
};
