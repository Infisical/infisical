import { Helmet } from "react-helmet";
import { Link, useSearch } from "@tanstack/react-router";

import { Button } from "@app/components/v2";

/**
 * This is the page that shows up when a user's invitation
 * to join a project/organization on Infisical has expired
 * or when the user is already a member of the organization
 */
export const RequestNewInvitePage = () => {
  const { reason } = useSearch({ from: "/_restrict-login-signup/requestnewinvite" });
  const isAlreadyMember = reason === "already_member";

  return (
    <div className="flex flex-col justify-between bg-bunker-700 md:h-screen">
      <Helmet>
        <title>{isAlreadyMember ? "Already a Member" : "Request a New Invite"}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="mt-8 flex h-screen w-screen flex-col items-center justify-center text-bunker-200">
        {isAlreadyMember ? (
          <>
            <p className="text-4xl text-primary-100">You&apos;re already a member</p>
            <p className="my-4 text-lg">You&apos;ve already joined this organization.</p>
            <Link to="/login">
              <Button size="lg">Go to Login</Button>
            </Link>
          </>
        ) : (
          <>
            <p className="text-4xl text-primary-100">Oops, your invite has expired</p>
            <p className="my-4 text-lg">Ask your admin for a new one.</p>
            <p className="max-w-xs px-7 text-center text-sm leading-tight text-bunker-400">
              <span className="rounded-md bg-primary-500/40 px-1 text-black">Note:</span> If it
              still doesn&apos;t work, please reach out to us at support@infisical.com
            </p>
          </>
        )}
      </div>
    </div>
  );
};
