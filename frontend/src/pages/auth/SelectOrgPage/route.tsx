import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { addSeconds, formatISO } from "date-fns";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { SessionStorageKeys } from "@app/const";
import { isInfisicalCloud } from "@app/helpers/platform";
import { adminQueryKeys } from "@app/hooks/api/admin/queries";
import { authKeys, selectOrganization } from "@app/hooks/api/auth/queries";
import { UserAgentType } from "@app/hooks/api/auth/types";
import {
  fetchOrganizationsWithSubOrgs,
  organizationKeys,
  TOrgWithSubOrgs
} from "@app/hooks/api/organization/queries";
import { onRequestError, setAuthToken } from "@app/hooks/api/reactQuery";
import { fetchUserDetails, logoutUser } from "@app/hooks/api/users/queries";

import { getSsoEnforcementError } from "./SelectOrg.utils";
import { SelectOrgPage } from "./SelectOrgPage";

export const SelectOrganizationPageQueryParams = z.object({
  org_id: z.string().optional().catch(""),
  callback_port: z.coerce.number().optional().catch(undefined),
  is_admin_login: z.boolean().optional().catch(false),
  force: z.boolean().optional(),
  mfa_method: z.string().optional().catch(undefined),
  // set by the provider-verified OAuth signup redirect so this page can fire the GTM conversion
  // event that the bypassed signup page would have pushed
  signup_completed: z.boolean().optional().catch(false)
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
    // Provider-verified OAuth signups complete server-side and land here directly, bypassing the
    // signup page that normally pushes this conversion event. Fire it before any auto-select
    // redirect so the common single-org case is still counted (cloud only).
    if (search.signup_completed) {
      if (isInfisicalCloud()) {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({ event: "signup_completed" });
      }
      // Consume the one-shot param so refresh/back-nav can't re-fire the conversion event
      // (search middlewares never run on the initial document load, so it must be stripped here).
      throw redirect({
        to: "/login/select-organization",
        search: { ...search, signup_completed: undefined },
        replace: true
      });
    }

    // Breakglass, MFA continuation, and ?force=true all need the user to act on this page
    if (search.mfa_method || search.force || search.is_admin_login) {
      return { autoSelectErrorMessage: undefined };
    }

    // Failures are handed to the component via route context; toasts fired here would be
    // dropped on cold loads (Toaster not yet mounted)
    let autoSelectErrorMessage: string | undefined;

    try {
      const orgsWithSubOrgs = await context.queryClient.ensureQueryData({
        queryKey: organizationKeys.getUserOrganizationsWithSubOrgs,
        queryFn: fetchOrganizationsWithSubOrgs
      });

      if (orgsWithSubOrgs.length === 0) {
        throw redirect({ to: "/organizations/none" });
      }

      // Auto-select target: explicit org_id or the instance default org, membership required
      const autoSelectOrgId = search.org_id || context.serverConfig?.defaultAuthOrgId;
      let target: { org: TOrgWithSubOrgs; subOrgId?: string } | undefined;

      if (autoSelectOrgId) {
        const rootOrg = orgsWithSubOrgs.find((org) => org.id === autoSelectOrgId);
        const subOrgParent = rootOrg
          ? undefined
          : orgsWithSubOrgs.find((org) =>
              org.subOrganizations.some((sub) => sub.id === autoSelectOrgId)
            );
        if (rootOrg) target = { org: rootOrg };
        else if (subOrgParent) target = { org: subOrgParent, subOrgId: autoSelectOrgId };
      }

      // Sole-org fallback, including when the requested org isn't one the user can enter
      // (e.g. a default org they aren't a member of)
      if (
        !target &&
        orgsWithSubOrgs.length === 1 &&
        orgsWithSubOrgs[0].subOrganizations.length === 0
      ) {
        target = { org: orgsWithSubOrgs[0] };
      }

      // Pre-empt the server-side SSO-enforcement rejection so the picker shows with guidance
      const ssoEnforcementError = target && getSsoEnforcementError(target.org);
      if (ssoEnforcementError) {
        autoSelectErrorMessage = ssoEnforcementError;
      } else if (target) {
        const targetOrgId = target.subOrgId || target.org.id;

        const result = await selectOrganization({
          organizationId: targetOrgId,
          userAgent: search.callback_port ? UserAgentType.CLI : undefined
        });

        if (result.isMfaEnabled) {
          // MFA required — redirect back to this page with MFA params so the component renders MFA immediately
          sessionStorage.setItem(SessionStorageKeys.MFA_TEMP_TOKEN, result.token);
          throw redirect({
            to: "/login/select-organization",
            search: {
              mfa_method: result.mfaMethod,
              org_id: targetOrgId,
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

        await context.queryClient.refetchQueries({ queryKey: authKeys.getAuthToken });
        await context.queryClient.refetchQueries({ queryKey: adminQueryKeys.serverConfig() });

        createNotification({ text: "Successfully logged in", type: "success" });

        throw redirect({
          to: "/organizations/$orgId/projects",
          params: { orgId: targetOrgId }
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
          response?: { status?: number; data?: { error?: string; message?: string } };
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
        // Surface user-actionable select failures on the picker; 401s are session-expiry
        // noise the axios interceptor already handles
        if (response?.status !== 401 && response?.data?.message) {
          autoSelectErrorMessage = response.data.message;
        }
      }
    }

    return { autoSelectErrorMessage };
  }
});
