import { Helmet } from "react-helmet";
import { Link, useRouteContext } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { Button, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

import { SignUpPage } from "../SignUpPage/SignUpPage";

export const SignupInvitePage = () => {
  const { inviteEmail, error } = useRouteContext({
    from: "/_restrict-login-signup/signupinvite"
  }) as { inviteEmail?: string; error?: string };

  if (error) {
    return (
      <AuthPageLayout>
        <Helmet>
          <title>Invalid Invitation</title>
          <link rel="icon" href="/infisical.ico" />
        </Helmet>
        <AuthPagePanel>
          <CardHeader className="mb-6 gap-2 text-center">
            <CardTitle>Invitation Invalid</CardTitle>
            <CardDescription>{error}</CardDescription>
            <CardDescription>
              Please ask your organization administrator to send a new invitation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="project" size="lg" isFullWidth>
              <Link to="/login">Go to Login</Link>
            </Button>
          </CardContent>
        </AuthPagePanel>
      </AuthPageLayout>
    );
  }

  return <SignUpPage invite={{ email: inviteEmail ?? "" }} />;
};
