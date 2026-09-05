import { useQuery } from "@tanstack/react-query";

import { dashboardKeys, fetchSecretMetadata } from "@app/hooks/api/dashboard/queries";

import { fetchCopySecrets } from "./copySecrets.data";

export const useCopySecretsQuery = ({
  projectId,
  environment,
  secretPath,
  enabled
}: {
  projectId: string;
  environment: string;
  secretPath: string;
  enabled: boolean;
}) =>
  useQuery({
    queryKey: [
      ...dashboardKeys.getDashboardSecrets({ projectId, secretPath }),
      "copy-secrets",
      environment
    ],
    enabled: enabled && Boolean(projectId && environment),
    staleTime: 0,
    // Retry individual pages so a failed page never restarts the recursive scan.
    retry: false,
    queryFn: ({ signal }) =>
      fetchCopySecrets(
        (cursor, limit) =>
          fetchSecretMetadata(
            {
              projectId,
              environment,
              secretPath,
              cursor,
              limit
            },
            signal
          ),
        signal
      )
  });
