import { adminQueryKeys, fetchServerConfig } from "@app/hooks/api/admin/queries";
import { useSuspenseQuery } from "@tanstack/react-query";

export const useServerConfig = () => {
  const { data: config } = useSuspenseQuery({
    queryKey: adminQueryKeys.serverConfig(),
    queryFn: fetchServerConfig
  });

  return { config };
};
