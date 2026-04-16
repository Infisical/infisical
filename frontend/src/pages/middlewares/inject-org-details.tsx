import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";

import SecurityClient from "@app/components/utilities/SecurityClient";
import { SessionStorageKeys } from "@app/const";
import { authKeys, fetchAuthToken, selectOrganization } from "@app/hooks/api/auth/queries";
import { fetchOrganizationById, organizationKeys } from "@app/hooks/api/organization/queries";
import { projectKeys } from "@app/hooks/api/projects";
import { fetchUserOrgPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { subOrganizationsQuery } from "@app/hooks/api/subOrganizations";
import { fetchOrgSubscription, subscriptionQueryKeys } from "@app/hooks/api/subscriptions/queries";

// Route context to fill in organization's data like details, subscription etc
export const Route = createFileRoute("/_authenticate/_inject-org-details")({
  beforeLoad: async ({ context, params }) => {
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
        try {
          const { token, isMfaEnabled, mfaMethod } = await selectOrganization({
            organizationId: urlOrgId
          });

          if (isMfaEnabled) {
            sessionStorage.setItem(SessionStorageKeys.MFA_TEMP_TOKEN, token);
            throw redirect({
              to: "/login/select-organization",
              search: { org_id: urlOrgId, mfa_method: mfaMethod }
            });
          }

          if (!isMfaEnabled && token) {
            SecurityClient.setToken(token);
            SecurityClient.setProviderAuthToken("");

            context.queryClient.removeQueries({ queryKey: authKeys.getAuthToken });
            context.queryClient.removeQueries({ queryKey: projectKeys.getAllUserProjects() });
            context.queryClient.removeQueries({ queryKey: subOrganizationsQuery.allKey() });

            await context.queryClient.fetchQuery({
              queryKey: authKeys.getAuthToken,
              queryFn: fetchAuthToken
            });
          }
        } catch (error) {
          if (isRedirect(error)) {
            throw error;
          }
          console.warn("Failed to automatically exchange token for organization:", error);
        }
      }
    }

    await context.queryClient.ensureQueryData({
      queryKey: organizationKeys.getOrgById(organizationId),
      queryFn: () => fetchOrganizationById(organizationId)
    });

    // Prefetch subscription and permissions data but don't block route
    // loading if they fail — the components using this data have their
    // own useQuery hooks that will retry independently.
    await Promise.allSettled([
      context.queryClient.ensureQueryData({
        queryKey: subscriptionQueryKeys.getOrgSubsription(organizationId),
        queryFn: () => fetchOrgSubscription(organizationId)
      }),
      context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserOrgPermissions({ orgId: organizationId }),
        queryFn: () => fetchUserOrgPermissions({ orgId: organizationId })
      })
    ]);

    return { organizationId };
  }
});
