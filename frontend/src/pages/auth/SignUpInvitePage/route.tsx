import { createFileRoute, redirect } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { authKeys, fetchAuthToken, verifySignupInvite } from "@app/hooks/api/auth/queries";
import { setAuthToken } from "@app/hooks/api/reactQuery";

import { SignupInvitePage } from "./SignUpInvitePage";

const SignupInvitePageQueryParamsSchema = z.object({
  token: z.string(),
  to: z.string(),
  organization_id: z.string()
});

export const Route = createFileRoute("/_restrict-login-signup/signupinvite")({
  component: SignupInvitePage,
  validateSearch: zodValidator(SignupInvitePageQueryParamsSchema),
  beforeLoad: async ({ context, search }) => {
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

      if (authData) {
        // Logged-in user — invitation accepted, go to the org
        throw redirect({
          to: "/login/select-organization",
          search: { org_id: organizationId }
        });
      }

      if (!result.token && result.ssoRedirect) {
        // SSO-enforced org — the invitee must authenticate via the org's IdP. Send them straight
        // to the SSO login flow instead of the generic login screen.
        const { method, orgSlug } = result.ssoRedirect as {
          method: "oidc" | "saml";
          orgSlug: string;
        };
        const ssoUrl =
          method === "oidc"
            ? `/api/v1/sso/oidc/login?orgSlug=${encodeURIComponent(orgSlug)}`
            : `/api/v1/sso/redirect/saml2/organizations/${encodeURIComponent(orgSlug)}`;
        window.location.assign(ssoUrl);
        return { inviteEmail: email };
      }

      if (!result.token) {
        createNotification({
          text: "Invitation accepted. Please login into your account",
          type: "success"
        });
      }

      if (result.token) {
        // New user — store signup token, render the signup form
        SecurityClient.setSignupToken(result.token);
        return { inviteEmail: email };
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
  }
});
