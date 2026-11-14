import type { QueryClient } from "@tanstack/react-query";
import { type ParsedLocation, redirect } from "@tanstack/react-router";
import { AxiosError } from "axios";
import { addSeconds, formatISO } from "date-fns";

import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import Telemetry from "@app/components/utilities/telemetry/Telemetry";
import { SessionStorageKeys } from "@app/const";
import { ROUTE_PATHS } from "@app/const/routes";
import { userKeys } from "@app/hooks/api";
import { TServerConfig } from "@app/hooks/api/admin/types";
import { authKeys, fetchAuthToken, selectOrganization } from "@app/hooks/api/auth/queries";
import { resetOrganizationCache } from "@app/hooks/api/organization/cache";
import { fetchOrganizationById, organizationKeys } from "@app/hooks/api/organization/queries";
import { fetchUserOrgPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { fetchOrgSubscription, subscriptionQueryKeys } from "@app/hooks/api/subscriptions/queries";
import { clearSession, fetchUserDetails, logoutUser } from "@app/hooks/api/users/queries";

let identifiedUsername: string | undefined;

export const authenticateSession = async ({
  context,
  location
}: {
  context: { queryClient: QueryClient; serverConfig: TServerConfig };
  location: ParsedLocation;
}) => {
  if (!context.serverConfig.initialized) {
    throw redirect({ to: "/admin/signup" });
  }

  const data = await context.queryClient
    .fetchQuery({
      queryKey: authKeys.getAuthToken,
      queryFn: fetchAuthToken,
      staleTime: 0
    })
    .catch(() => {
      createNotification({
        type: "error",
        title: "Access Restricted",
        text: " You need to log in to access this page. Please log in to continue."
      });

      // persist current URL in session storage so that we can come back to this after successful login
      sessionStorage.setItem(
        SessionStorageKeys.ORG_LOGIN_SUCCESS_REDIRECT_URL,
        JSON.stringify({
          expiry: formatISO(addSeconds(new Date(), 60)),
          data: window.location.href
        })
      );

      context.queryClient.removeQueries({
        queryKey: authKeys.getAuthToken
      });
      throw redirect({
        to: "/login"
      });
    });

  if (
    !data.organizationId &&
    location.pathname !== ROUTE_PATHS.Auth.PasswordSetupPage.path &&
    location.pathname !== "/organizations/none" &&
    location.pathname !== "/organizations/onboarding"
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
        createNotification({
          type: "error",
          title: "Access Denied",
          text: "Something went wrong with your session. Please log in again."
        });
      }
      clearSession();
      await logoutUser();

      throw redirect({
        to: "/login"
      });
    });

  // A session that never passes through login or org selection would otherwise stay anonymous,
  // and PostHog drops the organization group from anonymous events.
  if (identifiedUsername !== user.username) {
    identifiedUsername = user.username;
    new Telemetry().getInstance().identify(user.username, user.email ?? user.username);
  }

  const isOnAdminSetup = location.pathname === "/admin/setup";

  if (user.superAdmin && context.serverConfig.onboardingCompleted === false && !isOnAdminSetup) {
    throw redirect({ to: "/admin/setup" });
  }

  const isSubOrganization = !!data.subOrganizationId;
  return {
    organizationId: isSubOrganization ? data.subOrganizationId : (data.organizationId as string),
    isAuthenticated: true,
    user
  };
};

export const injectOrgDetails = async ({
  context,
  params,
  location
}: {
  context: { queryClient: QueryClient; organizationId?: string };
  params: unknown;
  location: ParsedLocation;
}) => {
  let organizationId: string;

  if ((params as { orgId?: string })?.orgId) {
    organizationId = (params as { orgId: string }).orgId;
  } else {
    organizationId = context.organizationId!;
  }

  if ((params as { orgId?: string })?.orgId && context.organizationId) {
    const urlOrgId = (params as { orgId: string }).orgId;
    const currentTokenOrgId = context.organizationId;

    if (urlOrgId !== currentTokenOrgId) {
      const { token, isMfaEnabled, mfaMethod } = await selectOrganization({
        organizationId: urlOrgId
      });

      if (isMfaEnabled) {
        sessionStorage.setItem(SessionStorageKeys.MFA_TEMP_TOKEN, token);
        throw redirect({
          to: "/login/select-organization",
          search: {
            org_id: urlOrgId,
            mfa_method: mfaMethod,
            redirect_to: location.href
          }
        });
      }

      SecurityClient.setToken(token);
      await context.queryClient.fetchQuery({
        queryKey: authKeys.getAuthToken,
        queryFn: fetchAuthToken,
        staleTime: 0
      });
    }
  }

  resetOrganizationCache(context.queryClient, organizationId);

  await context.queryClient.ensureQueryData({
    queryKey: organizationKeys.getOrgById(organizationId),
    queryFn: () => fetchOrganizationById(organizationId)
  });

  await context.queryClient.ensureQueryData({
    queryKey: subscriptionQueryKeys.getOrgSubsription(organizationId),
    queryFn: () => fetchOrgSubscription(organizationId)
  });

  await context.queryClient.ensureQueryData({
    queryKey: roleQueryKeys.getUserOrgPermissions({ orgId: organizationId }),
    queryFn: () => fetchUserOrgPermissions({ orgId: organizationId })
  });
  return { organizationId };
};
