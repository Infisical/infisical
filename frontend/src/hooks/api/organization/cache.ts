import { hashKey, QueryClient } from "@tanstack/react-query";

import { adminQueryKeys } from "../admin/queries";
import { announcementKeys } from "../announcement/queries";
import { authKeys } from "../auth/queries";
import { userKeys } from "../users/query-keys";

const organizationScopes = new WeakMap<QueryClient, string>();
const retainedQueryHashes = new Set([
  hashKey(authKeys.getAuthToken),
  hashKey(adminQueryKeys.serverConfig()),
  hashKey(announcementKeys.recent()),
  hashKey(userKeys.getUser)
]);

export const resetOrganizationCache = (queryClient: QueryClient, organizationId: string) => {
  if (organizationScopes.get(queryClient) === organizationId) return;

  queryClient.removeQueries({
    predicate: (query) => !retainedQueryHashes.has(query.queryHash)
  });
  organizationScopes.set(queryClient, organizationId);
};
