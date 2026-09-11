import { useQuery } from "@tanstack/react-query";

import { fetchSecretMetadata } from "@app/hooks/api/dashboard/queries";

import { fetchCopySecrets } from "./copySecrets.data";

export const copySecretsQueryKeys = {
  preview: ({
    projectId,
    environment,
    secretPath
  }: {
    projectId: string;
    environment: string;
    secretPath: string;
  }) => ["copy-secrets-preview", { projectId, environment, secretPath }] as const
};

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
    queryKey: copySecretsQueryKeys.preview({ projectId, environment, secretPath }),
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
