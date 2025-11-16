import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { dashboardKeys } from "./api/dashboard/queries";
import { commitKeys } from "./api/folderCommits/queries";
import { secretApprovalRequestKeys } from "./api/secretApprovalRequest/queries";
import { secretKeys } from "./api/secrets/queries";
import { secretSnapshotKeys } from "./api/secretSnapshots/queries";

export function useInvalidateSecretQueries(projectId: string) {
  const queryClient = useQueryClient();

  const invalidSecretQueries = useCallback(
    <T>(
      { environment, secretPath, key }: { environment: string; secretPath: string; key: string },
      result: T
    ) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({
          projectId,
          secretPath
        })
      });

      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getSecretValue({
          projectId,
          environment,
          secretPath,
          secretKey: key
        }),
        exact: false
      });

      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getProjectSecretsDetails({
          projectId,
          secretPath,
          environment
        } as any),
        exact: false
      });

      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getProjectSecretsOverview({
          projectId,
          secretPath
        } as any),
        exact: false
      });

      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ projectId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.list({
          projectId,
          environment,
          directory: secretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: secretSnapshotKeys.count({
          projectId,
          environment,
          directory: secretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.count({ projectId, environment, directory: secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: commitKeys.history({
          projectId,
          environment,
          directory: secretPath
        })
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.count({ projectId })
      });

      return result;
    },
    [queryClient, projectId]
  );

  return invalidSecretQueries;
}
