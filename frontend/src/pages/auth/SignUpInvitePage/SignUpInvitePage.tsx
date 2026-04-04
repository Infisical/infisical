import { Helmet } from "react-helmet";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";

import { Button } from "@app/components/v2";

import { SignUpPage } from "../SignUpPage/SignUpPage";

export const SignupInvitePage = () => {
  const navigate = useNavigate();
  const { inviteEmail, error } = useRouteContext({
    from: "/_restrict-login-signup/signupinvite"
  }) as { inviteEmail?: string; error?: string };

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
        <Helmet>
          <title>Invalid Invitation</title>
          <link rel="icon" href="/infisical.ico" />
        </Helmet>
        <Link to="/">
          <div className="mb-8 flex justify-center">
            <img
              src="/images/gradientLogo.svg"
              style={{ height: "90px", width: "120px" }}
              alt="Infisical logo"
            />
          </div>
        </Link>
        <div className="mx-auto w-full max-w-md rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-8 text-center">
          <h1 className="mb-2 text-xl font-medium text-gray-200">Invitation Invalid</h1>
          <p className="mb-6 text-sm text-gray-400">{error}</p>
          <p className="mb-4 text-sm text-gray-500">
            Please ask your organization admin to send a new invitation.
          </p>
          <Button onClick={() => navigate({ to: "/login" })} size="sm" colorSchema="primary">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return <SignUpPage invite={{ email: inviteEmail ?? "" }} />;
};
