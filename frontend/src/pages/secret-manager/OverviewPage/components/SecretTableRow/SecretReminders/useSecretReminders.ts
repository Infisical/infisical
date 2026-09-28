import { useCallback } from "react";

import { useProject } from "@app/context";
import { AlertResourceType, TAlert, useListAlerts } from "@app/hooks/api/alerts";

// Every row reads the same project-wide list, so React Query sends one request per project rather
// than one per secret.
export const useSecretReminders = (secretId?: string) => {
  const { projectId } = useProject();

  const select = useCallback(
    (alerts: TAlert[]) => alerts.filter((alert) => alert.resourceId === secretId),
    [secretId]
  );

  return useListAlerts(
    { resourceType: AlertResourceType.SecretReminder, projectId },
    { enabled: Boolean(secretId), select }
  );
};
