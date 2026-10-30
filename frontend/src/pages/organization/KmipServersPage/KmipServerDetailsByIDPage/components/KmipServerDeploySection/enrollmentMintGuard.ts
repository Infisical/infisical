import { QueryClient, QueryKey } from "@tanstack/react-query";

type MintedEnrollment = { token: string; expiresAt: string };

export const createKmipEnrollmentMintCommit = (
  queryClient: QueryClient,
  queryKey: QueryKey,
  lifecycleRevision: number
) => {
  const cacheUpdateCount = queryClient.getQueryState(queryKey)?.dataUpdateCount ?? 0;

  return (result: MintedEnrollment, currentLifecycleRevision: number) => {
    const currentCacheUpdateCount = queryClient.getQueryState(queryKey)?.dataUpdateCount ?? 0;

    if (
      currentLifecycleRevision !== lifecycleRevision ||
      currentCacheUpdateCount !== cacheUpdateCount
    ) {
      return false;
    }

    queryClient.setQueryData<MintedEnrollment>(queryKey, result);
    return true;
  };
};
