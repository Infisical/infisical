import { Button } from "@infisical/cipher/ui/button";
import { Link, useRouteContext } from "@tanstack/react-router";

import { v4Path } from "../../links";
import { AuthPage } from "../components/AuthPage";
import { SignUpPage } from "../SignUpPage/SignUpPage";

export const SignUpInvitePage = () => {
  const { inviteEmail, inviteOrganizationName, error } = useRouteContext({
    from: "/v4/_v4-auth/signupinvite"
  }) as { inviteEmail?: string; inviteOrganizationName?: string; error?: string };

  if (error) {
    return (
      <AuthPage
        variant="focused"
        pageTitle="Invalid Invitation"
        title="This invitation isn't valid"
        description="Ask your organization administrator to send you a new invitation."
      >
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link to={v4Path("/login")}>Back to login</Link>
        </Button>
      </AuthPage>
    );
  }

  return (
    <SignUpPage invite={{ email: inviteEmail ?? "", organizationName: inviteOrganizationName }} />
  );
};
