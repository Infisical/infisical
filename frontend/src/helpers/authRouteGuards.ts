import type { QueryClient } from "@tanstack/react-query";
import { isRedirect, type ParsedLocation, redirect } from "@tanstack/react-router";
import { addSeconds, formatISO } from "date-fns";
import { z } from "zod";

import { captureSignupCompleted } from "@app/components/analytics/experiments/signupFlow/signupExperiment";
import {
  getSignupTrialBillingSearch,
  parseSignupTrialSearch
} from "@app/components/auth/signupTrialIntent";
import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import Telemetry from "@app/components/utilities/telemetry/Telemetry";
import { SessionStorageKeys } from "@app/const";
import { isInfisicalCloud } from "@app/helpers/platform";
import { consumeLoginRedirectUrl } from "@app/helpers/sessionStorage";
import { adminQueryKeys } from "@app/hooks/api/admin/queries";
import { TServerConfig } from "@app/hooks/api/admin/types";
import {
  authKeys,
  fetchAuthToken,
  selectOrganization,
  verifySignupInvite
} from "@app/hooks/api/auth/queries";
import { UserAgentType } from "@app/hooks/api/auth/types";
import {
  fetchOrganizationsWithSubOrgs,
  organizationKeys,
  TOrgWithSubOrgs
} from "@app/hooks/api/organization/queries";
import { onRequestError, setAuthToken } from "@app/hooks/api/reactQuery";
import { clearSession, fetchUserDetails, logoutUser } from "@app/hooks/api/users/queries";
import { userKeys } from "@app/hooks/api/users/query-keys";
import { getSsoEnforcementError } from "@app/pages/auth/SelectOrgPage/SelectOrg.utils";

type TAuthRouteContext = {
  queryClient: QueryClient;
  serverConfig: TServerConfig;
  authToken?: Awaited<ReturnType<typeof fetchAuthToken>> | null;
};

export const LoginSignupQueryParamsSchema = z.object({
  callback_port: z.coerce.number().optional().catch(undefined),
  force: z.boolean().optional(),
  org_id: z.string().optional().catch(undefined)
});

export const SelectOrganizationPageQueryParams = z.object({
  org_id: z.string().optional().catch(""),
  callback_port: z.coerce.number().optional().catch(undefined),
  is_admin_login: z.boolean().optional().catch(false),
  force: z.boolean().optional(),
  mfa_method: z.string().optional().catch(undefined),
  redirect_to: z.string().startsWith("/organizations/").optional().catch(undefined),
  // set by the provider-verified OAuth signup redirect so this page can fire the GTM conversion
  // event that the bypassed signup page would have pushed
  signup_completed: z.boolean().optional().catch(false)
});

export const restrictLoginSignup = async ({
  context,
  location,
  search
}: {
  context: TAuthRouteContext;
  location: ParsedLocation;
  search?: z.infer<typeof LoginSignupQueryParamsSchema>;
}) => {
  if (!context.serverConfig.initialized) {
    if (location.pathname.endsWith("/admin/signup")) return;
    throw redirect({ to: "/admin/signup" });
  }

  const data = context.authToken;
  if (!data) return;

  setAuthToken(data.token);

  if (location.pathname === "/signupinvite") return;

  const isOnSelectOrg = location.pathname.endsWith("select-organization");
  const needsOrgSelection =
    search?.callback_port || search?.force || search?.org_id || !data.organizationId;

  if (needsOrgSelection) {
    if (isOnSelectOrg || (!data.organizationId && location.pathname.endsWith("verify-email")))
      return;

    // org_id makes the select-org page auto-select, so a CLI login must not inherit
    // this browser's org: it would skip the picker the user is waiting on.
    const inheritedOrgId = search?.callback_port ? undefined : data.organizationId;

    throw redirect({
      to: "/login/select-organization",
      search: {
        org_id: search?.org_id || inheritedOrgId,
        callback_port: search?.callback_port
      }
    });
  }

  const orgId = data.subOrganizationId || data.organizationId;
  if (orgId) {
    // A signed-in visitor from a pricing-page trial button lands on their organization's billing page
    // with that product's upgrade dialog open on the plan they picked.
    const trialIntent =
      location.pathname.replace(/\/$/, "") === "/signup"
        ? parseSignupTrialSearch(location.searchStr)
        : null;
    if (trialIntent) {
      const billingSearch = new URLSearchParams(getSignupTrialBillingSearch(trialIntent));
      throw redirect({
        href: `/organizations/${data.organizationId ?? orgId}/billing?${billingSearch.toString()}`
      });
    }
    throw redirect({
      to: "/organizations/$orgId/projects",
      params: { orgId }
    });
  }
};

export const autoSelectOrganization = async ({
  context,
  search
}: {
  context: TAuthRouteContext;
  search: z.infer<typeof SelectOrganizationPageQueryParams>;
}) => {
  // Provider-verified OAuth signups complete server-side and land here directly, bypassing the
  // signup page that normally pushes this conversion event. Fire it before any auto-select
  // redirect so the common single-org case is still counted (cloud only).
  if (search.signup_completed) {
    if (isInfisicalCloud()) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "signup_completed" });
    }

    // Identify on user.username, the distinct id the backend captures signup events with, before
    // recording the provider-verified conversion.
    try {
      const user = await context.queryClient.ensureQueryData({
        queryKey: userKeys.getUser,
        queryFn: fetchUserDetails
      });
      const telemetry = new Telemetry().getInstance();
      telemetry.identify(user.username, user.email ?? user.username);
    } catch {
      // best-effort attribution; it must never block the signup redirect
    }
    captureSignupCompleted("sso");

    // Provider-verified signups arrive with no org; send them to org setup instead of the
    // personal-org fallback. Fetch errors fall through to the strip-redirect, whose main
    // flow re-fetches and surfaces them.
    let hasNoOrg = false;
    try {
      const orgsWithSubOrgs = await context.queryClient.ensureQueryData({
        queryKey: organizationKeys.getUserOrganizationsWithSubOrgs,
        queryFn: fetchOrganizationsWithSubOrgs
      });
      hasNoOrg = orgsWithSubOrgs.length === 0;
    } catch {
      hasNoOrg = false;
    }
    if (hasNoOrg) {
      throw redirect({
        to: "/organizations/onboarding",
        search: { callback_port: search.callback_port },
        replace: true
      });
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
            callback_port: search.callback_port,
            redirect_to: search.redirect_to
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
        setAuthToken(result.token);
        throw redirect({ to: "/cli-redirect", search: { org_id: targetOrgId } });
      }

      setAuthToken(result.token);

      await context.queryClient.refetchQueries({ queryKey: authKeys.getAuthToken });
      await context.queryClient.refetchQueries({ queryKey: adminQueryKeys.serverConfig() });

      createNotification({ text: "Successfully logged in", type: "success" });

      if (search.redirect_to?.startsWith(`/organizations/${targetOrgId}/`)) {
        throw redirect({ href: search.redirect_to });
      }

      // Check for a stored redirect URL from before login (e.g., deep links like /pam/access)
      const loginRedirectUrl = consumeLoginRedirectUrl();
      if (loginRedirectUrl) {
        window.location.assign(loginRedirectUrl);
        return { autoSelectErrorMessage: undefined };
      }

      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId: targetOrgId }
      });
    }
  } catch (error) {
    // If it's a redirect, re-throw it
    if (isRedirect(error)) throw error;
    // selectOrganization is called directly (not via mutation hook), so MutationCache.onError
    // never fires for it — surface SMTP and lockout errors manually and log the user out.
    if (typeof error === "object" && error !== null && "response" in error) {
      const { response } = error as {
        response?: { status?: number; data?: { error?: string; message?: string } };
      };
      const isLockError =
        response?.data?.error === "UserLocked" || response?.data?.message === "Account is locked";
      if (response?.data?.error === "SmtpError" || isLockError) {
        onRequestError(error);
        clearSession();
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
};

export const SignupInvitePageQueryParamsSchema = z.object({
  token: z.string(),
  to: z.string(),
  organization_id: z.string()
});

export const acceptSignupInvite = async ({
  context,
  search
}: {
  context: TAuthRouteContext;
  search: z.infer<typeof SignupInvitePageQueryParamsSchema>;
}) => {
  const email = decodeURIComponent(search.to).trim();
  const { token, organization_id: organizationId } = search;

  // Check if user is already logged in
  const authData = await context.queryClient
    .ensureQueryData({
      queryKey: authKeys.getAuthToken,
      queryFn: fetchAuthToken
    })
    .catch(() => null);

  if (authData) {
    setAuthToken(authData.token);
  }

  try {
    const result = await verifySignupInvite({
      email,
      code: token,
      organizationId
    });

    if (!result.token) {
      createNotification({
        text: "Invitation accepted. Please login into your account",
        type: "success"
      });
    }

    if (authData) {
      // Logged-in user — invitation accepted, go to the org
      throw redirect({
        to: "/login/select-organization",
        search: { org_id: organizationId }
      });
    }

    if (result.token) {
      // New user — store signup token, render the signup form
      SecurityClient.setSignupToken(result.token);
      return { inviteEmail: email, inviteOrganizationName: result.organizationName };
    }

    // Existing user, not logged in, membership accepted — send to login
    throw redirect({ to: "/login" });
  } catch (error: unknown) {
    // Re-throw redirects
    if (typeof error === "object" && error !== null && "to" in error) throw error;

    // "Already a member" — redirect appropriately
    const message =
      (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (error as Error)?.message ||
      "";

    if (message.includes("already a member")) {
      if (authData) {
        throw redirect({
          to: "/login/select-organization",
          search: { org_id: organizationId }
        });
      }
      throw redirect({ to: "/login" });
    }

    // Verification failed — pass error to the page
    return {
      inviteEmail: email,
      error: message || "This invitation link is invalid or has expired."
    };
  }
};
