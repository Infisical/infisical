import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TGetSecretHttpProxyConfigDTO, TSecretHttpProxyConfig } from "./types";

export const secretHttpProxyConfigKeys = {
  bySecretId: ({ projectId, secretId }: TGetSecretHttpProxyConfigDTO) =>
    [{ projectId, secretId }, "secret-http-proxy-config"] as const
};

export const useGetSecretHttpProxyConfig = ({
  projectId,
  secretId,
  enabled = true
}: TGetSecretHttpProxyConfigDTO & { enabled?: boolean }) => {
  return useQuery({
    queryKey: secretHttpProxyConfigKeys.bySecretId({ projectId, secretId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ proxyConfig: TSecretHttpProxyConfig | null }>(
        `/api/v1/projects/${projectId}/secrets/${secretId}/http-proxy-config`
      );
      return data.proxyConfig;
    },
    enabled
  });
};
