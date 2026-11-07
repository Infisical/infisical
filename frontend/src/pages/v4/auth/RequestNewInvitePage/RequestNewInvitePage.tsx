import { Link, useSearch } from "@tanstack/react-router";

import { Button } from "@app/components/v4/ui/button";

import { AuthPage } from "../components/AuthPage";

export const RequestNewInvitePage = () => {
  const { reason } = useSearch({ from: "/v4/_v4-auth/requestnewinvite" });
  const isAlreadyMember = reason === "already_member";
  return (
    <AuthPage
      variant="focused"
      pageTitle={isAlreadyMember ? "Already a Member" : "Request a New Invite"}
      title={isAlreadyMember ? "Invite already accepted" : "Your invite has expired"}
      description={
        isAlreadyMember
          ? "You're already a member of this organization."
          : "Ask your administrator to send you a new invitation."
      }
    >
      <Button asChild variant="accent" size="lg" className="w-full">
        <Link to="/v4/login">Go to login</Link>
      </Button>
    </AuthPage>
  );
};
