import { createFileRoute } from "@tanstack/react-router";

import { authKeys, fetchAuthToken } from "@app/hooks/api/auth/queries";

import { ViewSecretRequestByIDPage } from "./ViewSecretRequestByIDPage";

export const Route = createFileRoute("/secret-request/secret/$secretRequestId")({
  component: ViewSecretRequestByIDPage,
  beforeLoad: async ({ context }) => {
    await context.queryClient
      .ensureQueryData({
        queryKey: authKeys.getAuthToken,
        queryFn: fetchAuthToken
      })
      .catch(() => undefined);
  }
});
