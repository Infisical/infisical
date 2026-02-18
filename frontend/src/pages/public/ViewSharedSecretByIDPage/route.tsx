import { createFileRoute } from "@tanstack/react-router";

import { authKeys, fetchAuthToken } from "@app/hooks/api/auth/queries";

import { ViewSharedSecretByIDPage } from "./ViewSharedSecretByIDPage";

export const Route = createFileRoute("/shared/secret/$secretId")({
  component: ViewSharedSecretByIDPage,
  beforeLoad: async ({ context }) => {
    // we load the auth token because the view shared secret screen serves both public and authenticated users
    await context.queryClient
      .ensureQueryData({
        queryKey: authKeys.getAuthToken,
        queryFn: fetchAuthToken
      })
      .catch(() => undefined);
  }
});
