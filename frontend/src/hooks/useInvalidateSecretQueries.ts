import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { dashboardKeys } from "./api/dashboard/queries";
import { secretKeys } from "./api/secrets/queries";
import { secretSnapshotKeys } from "./api/secretSnapshots/queries";
import { commitKeys } from "./api/folderCommits/queries";
import { secretApprovalRequestKeys } from "./api/secretApprovalRequest/queries";

export function useInvalidateSecretQueries(projectId: string) {
  const queryClient = useQueryClient();

  const invalidSecretQueries = useCallback(
    <T>({ environment, secretPath }: { environment: string; secretPath: string }, result?: T) => {
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({
          projectId,
          secretPath
        })
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
    []
  );

  return invalidSecretQueries;
}
