import { createFileRoute, redirect } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { authKeys, fetchAuthToken } from "@app/hooks/api/auth/queries";
import { userKeys } from "@app/hooks/api";
import { fetchUserDetails } from "@app/hooks/api/users/queries";
import { setAuthToken } from "@app/hooks/api/reactQuery";

export const Route = createFileRoute("/_authenticate")({
  beforeLoad: async ({ context, location }) => {
    const isLoginRoute = location.pathname.startsWith("/login");
    const isSignupRoute = location.pathname.startsWith("/signup");
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
      if (isLoginRoute || isSignupRoute) return {};
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
