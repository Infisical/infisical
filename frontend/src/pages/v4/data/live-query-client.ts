import { type MutationOptions, QueryClient } from "@tanstack/react-query";

import { queryClient } from "@app/hooks/api/reactQuery";

// v4 call sites report their own failures with failed(), so main's global error toast would repeat
// them. A mutation opts back in with `meta: { skipErrorToast: false }`.
class LiveQueryClient extends QueryClient {
  defaultMutationOptions<T extends MutationOptions<unknown, unknown, unknown, unknown>>(
    options?: T
  ): T {
    const defaulted = super.defaultMutationOptions(options);
    return { ...defaulted, meta: { skipErrorToast: true, ...defaulted.meta } };
  }
}

export const liveQueryClient = new LiveQueryClient({
  queryCache: queryClient.getQueryCache(),
  mutationCache: queryClient.getMutationCache(),
  defaultOptions: queryClient.getDefaultOptions()
});
