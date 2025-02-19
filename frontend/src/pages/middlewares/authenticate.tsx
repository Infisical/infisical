import { createFileRoute, redirect } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ROUTE_PATHS } from "@app/const/routes";
import { userKeys } from "@app/hooks/api";
import { authKeys, fetchAuthToken } from "@app/hooks/api/auth/queries";
import { fetchUserDetails } from "@app/hooks/api/users/queries";
import { AxiosError } from "axios";
import { clearSession, logoutUser } from "@app/hooks/api/users/queries";

export const Route = createFileRoute("/_authenticate")({
  beforeLoad: async ({ context, location }) => {
    if (!context.serverConfig.initialized) {
      throw redirect({ to: "/admin/signup" });
    }

    const data = await context.queryClient
      .ensureQueryData({
        queryKey: authKeys.getAuthToken,
        queryFn: fetchAuthToken
      })
      .catch(() => {
        createNotification({
          type: "error",
          title: "Access Restricted",
          text: " You need to log in to access this page. Please log in to continue."
        });
        throw redirect({
          to: "/login"
        });
      });

    if (
      !data.organizationId &&
      location.pathname !== ROUTE_PATHS.Auth.PasswordSetupPage.path &&
      location.pathname !== "/organization/none"
    ) {
      throw redirect({ to: "/login/select-organization" });
    }

    const user = await context.queryClient
      .ensureQueryData({
        queryKey: userKeys.getUser,
        queryFn: fetchUserDetails
      })
      .catch(async (error) => {
        const err = error as AxiosError;
        if (err.response?.status === 403) {
          // (dangtony98): this edge-case can occur if the user's token corresponds to an organization
          // that has been deleted for which we must clear the refresh token in http-only cookie
          clearSession(true);
          await logoutUser();
          throw redirect({
            to: "/login"
          });
        }
      });

    return { organizationId: data.organizationId as string, isAuthenticated: true, user };
  }
});
