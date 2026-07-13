import { apiRequest } from "@app/config/request";

import { TSecretsActivationStatus } from "./types";

export const userActivationKeys = {
  secretsStatus: (orgId: string, userId: string) =>
    [{ orgId, userId }, "user-activation-secrets"] as const
};

// This is a POST because hitting it advances a per-user/per-org state machine on the backend, so
// it is not a pure read. It is driven imperatively (see useSecretsActivationNudge) and cached for
// the session (gcTime Infinity), so it runs at most once per session no matter how many triggers fire.
export const fetchSecretsActivationStatus = async () => {
  const { data } = await apiRequest.post<TSecretsActivationStatus>(
    "/api/v1/user-activation/secrets"
  );
  return data;
};
