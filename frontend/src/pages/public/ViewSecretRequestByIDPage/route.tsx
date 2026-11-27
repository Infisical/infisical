import { createFileRoute } from "@tanstack/react-router";

import { handoffToV4 } from "@app/helpers/v4Bridge";
import { authKeys, fetchAuthToken } from "@app/hooks/api/auth/queries";

import { ViewSecretRequestByIDPage } from "./ViewSecretRequestByIDPage";

export const Route = createFileRoute("/secret-request/secret/$secretRequestId")({
  component: ViewSecretRequestByIDPage,
  beforeLoad: async ({ context, location }) => {
    await handoffToV4(location);
    await context.queryClient
      .ensureQueryData({
        queryKey: authKeys.getAuthToken,
        queryFn: fetchAuthToken
      })
      .catch(() => undefined);
  }
});
