import { createFileRoute, redirect } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { userKeys } from "@app/hooks/api";
import { authKeys, fetchAuthToken } from "@app/hooks/api/auth/queries";
import { setAuthToken } from "@app/hooks/api/reactQuery";
import { fetchUserDetails } from "@app/hooks/api/users/queries";

export const Route = createFileRoute("/_authenticate")({
  beforeLoad: async ({ context }) => {
    try {
      const data = await context.queryClient.fetchQuery({
        queryKey: authKeys.getAuthToken,
        queryFn: fetchAuthToken
      });
      setAuthToken(data.token);
      if (!data.organizationId) {
        throw redirect({ to: "/login/select-organization" });
      }

      const user = await context.queryClient.fetchQuery({
        queryKey: userKeys.getUser,
        queryFn: fetchUserDetails
      });

      return { organizationId: data.organizationId as string, isAuthenticated: true, user };
    } catch {
      createNotification({
        type: "error",
        title: "Access Restricted",
        text: " You need to log in to access this page. Please log in to continue."
      });
      throw redirect({
        to: "/login"
      });
    }
  }
});
