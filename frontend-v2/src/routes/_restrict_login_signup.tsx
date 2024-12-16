import { createFileRoute, redirect } from "@tanstack/react-router";

import { authKeys, fetchAuthToken } from "@app/hooks/api/auth/queries";
import { setAuthToken } from "@app/hooks/api/reactQuery";

export const Route = createFileRoute("/_restrict_login_signup")({
  beforeLoad: async ({ context }) => {
    const data = await context.queryClient
      .fetchQuery({
        queryKey: authKeys.getAuthToken,
        queryFn: fetchAuthToken
      })
      .catch(() => {
        return null;
      });
    if (!data) return;

    setAuthToken(data.token);
    if (!data.organizationId) {
      throw redirect({ to: "/login/select-organization" });
    }
    throw redirect({
      to: "/organization/$organizationId/secret-manager",
      params: {
        organizationId: data.organizationId
      }
    });
  }
});
