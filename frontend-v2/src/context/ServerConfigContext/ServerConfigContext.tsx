import { useSuspenseQuery } from "@tanstack/react-query";

import { adminQueryKeys, fetchServerConfig } from "@app/hooks/api/admin/queries";

export const useServerConfig = () => {
  const { data: config } = useSuspenseQuery({
    queryKey: adminQueryKeys.serverConfig(),
    queryFn: fetchServerConfig,
    staleTime: Infinity
  });

  return { config };
};
