import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { addSeconds, formatISO } from "date-fns";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { SessionStorageKeys } from "@app/const";
import { authKeys, selectOrganization } from "@app/hooks/api/auth/queries";
import { UserAgentType } from "@app/hooks/api/auth/types";
import {
  fetchOrganizationsWithSubOrgs,
  organizationKeys
} from "@app/hooks/api/organization/queries";
import { onRequestError, setAuthToken } from "@app/hooks/api/reactQuery";
import { fetchUserDetails, logoutUser } from "@app/hooks/api/users/queries";

import { SelectOrgPage } from "./SelectOrgPage";

export const SelectOrganizationPageQueryParams = z.object({
  org_id: z.string().optional().catch(""),
  callback_port: z.coerce.number().optional().catch(undefined),
  is_admin_login: z.boolean().optional().catch(false),
  force: z.boolean().optional(),
  mfa_method: z.string().optional().catch(undefined)
});

export const Route = createFileRoute("/_restrict-login-signup/login/select-organization")({
  component: SelectOrgPage,
  validateSearch: zodValidator(SelectOrganizationPageQueryParams),
  search: {
    middlewares: [
      stripSearchParams({
        org_id: "",
        callback_port: undefined,
        is_admin_login: false,
        mfa_method: undefined
      })
    ]
  },
  beforeLoad: async ({ context, search }) => {
    // Skip auto-select for MFA pending or force flag
    if (search.mfa_method || search.force) return;

    try {
      const orgsWithSubOrgs = await context.queryClient.ensureQueryData({
        queryKey: organizationKeys.getUserOrganizationsWithSubOrgs,
        queryFn: fetchOrganizationsWithSubOrgs
      });

      if (orgsWithSubOrgs.length === 0) {
        throw redirect({ to: "/organizations/none" });
      }

      // Auto-select only when exactly 1 root org with no sub-orgs
      const hasSingleOrgWithNoSubOrgs =
        orgsWithSubOrgs.length === 1 && orgsWithSubOrgs[0].subOrganizations.length === 0;

      if (hasSingleOrgWithNoSubOrgs) {
        const orgId = orgsWithSubOrgs[0].id;

        // If org_id is specified and doesn't match the only org, let the page handle it
        if (search.org_id && search.org_id !== orgId) return;

        const result = await selectOrganization({
          organizationId: orgId,
          userAgent: search.callback_port ? UserAgentType.CLI : undefined
        });

        if (result.isMfaEnabled) {
          // MFA required — redirect back to this page with MFA params so the component renders MFA immediately
          sessionStorage.setItem(SessionStorageKeys.MFA_TEMP_TOKEN, result.token);
          throw redirect({
            to: "/login/select-organization",
            search: {
              mfa_method: result.mfaMethod,
              org_id: orgId,
              callback_port: search.callback_port
            }
          });
        }

        if (search.callback_port) {
          const user = await fetchUserDetails();
          const payload = {
            JTWToken: result.token,
            email: user.email,
            privateKey: ""
          };

          sessionStorage.setItem(
            SessionStorageKeys.CLI_TERMINAL_TOKEN,
            JSON.stringify({
              expiry: formatISO(addSeconds(new Date(), 30)),
              data: window.btoa(JSON.stringify(payload)),
              callbackPort: search.callback_port
            })
          );
          throw redirect({ to: "/cli-redirect" });
        }

        setAuthToken(result.token);
        createNotification({ text: "Successfully logged in", type: "success" });
        throw redirect({
          to: "/organizations/$orgId/projects",
          params: { orgId }
        });
      }
    } catch (error) {
      console.error(error);
      // If it's a redirect, re-throw it
      if (error instanceof Error && error.message === "REDIRECT") throw error;
      // For redirect objects from TanStack Router
      if (typeof error === "object" && error !== null && "to" in error) throw error;
      // selectOrganization is called directly (not via mutation hook), so MutationCache.onError
      // never fires for it — surface SMTP errors manually and log the user out.
      if (typeof error === "object" && error !== null && "response" in error) {
        const { response } = error as {
          response?: { data?: { error?: string; message?: string } };
        };
        if (response?.data?.error === "SmtpError") {
          onRequestError(error);
          // We can't use the useLogoutUser hook here (beforeLoad runs outside React),
          // so we replicate its mutationFn manually:
          // - setAuthToken("") stops outgoing requests from carrying the stale token.
          // - removeQueries drops the cached auth token so the restrict-login-signup
          //   middleware doesn't find it and redirect back to select-organization.
          // - logoutUser() invalidates the session on the server.
          setAuthToken("");
          context.queryClient.removeQueries({ queryKey: authKeys.getAuthToken });
          await logoutUser().catch(() => {}); // best-effort — redirect must always fire
          throw redirect({ to: "/login" });
        }
      }
    }
  }
});
