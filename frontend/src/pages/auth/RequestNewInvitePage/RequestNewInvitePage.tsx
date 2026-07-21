import { Helmet } from "react-helmet";
import { Link, useSearch } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { Button, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";

/**
 * This is the page that shows up when a user's invitation
 * to join a project/organization on Infisical has expired
 * or when the user is already a member of the organization
 */
export const RequestNewInvitePage = () => {
  const { reason } = useSearch({ from: "/_restrict-login-signup/requestnewinvite" });
  const isAlreadyMember = reason === "already_member";

  return (
    <AuthPageLayout>
      <Helmet>
        <title>{isAlreadyMember ? "Already a Member" : "Request a New Invite"}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <AuthPagePanel>
        <CardHeader className="mb-6 gap-2 text-center">
          <CardTitle>
            {isAlreadyMember ? "Invite already accepted" : "Your invite has expired"}
          </CardTitle>
          <CardDescription>
            {isAlreadyMember
              ? "You're already a member of this organization."
              : "Ask your administrator to send you a new invitation."}
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
};
