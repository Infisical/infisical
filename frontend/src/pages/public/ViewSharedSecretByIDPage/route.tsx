import { createFileRoute } from "@tanstack/react-router";

import { handoffToV4 } from "@app/helpers/v4Bridge";
import { authKeys, fetchAuthToken } from "@app/hooks/api/auth/queries";

import { ViewSharedSecretByIDPage } from "./ViewSharedSecretByIDPage";

export const Route = createFileRoute("/shared/secret/$secretId")({
  component: ViewSharedSecretByIDPage,
  beforeLoad: async ({ context, location }) => {
    await handoffToV4(location);
    // we load the auth token because the view shared secret screen serves both public and authenticated users
    await context.queryClient
      .ensureQueryData({
        queryKey: authKeys.getAuthToken,
        queryFn: fetchAuthToken
      })
      .catch(() => undefined);
  }
});
