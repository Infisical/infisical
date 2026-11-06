import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, LogInIcon, UserXIcon } from "lucide-react";

import { Button } from "@app/components/v3";
import { ErrorPageFrame, useErrorPageTimestamp } from "@app/pages/public/ErrorPage/components";

export const LoginProviderErrorPage = () => {
  const occurredAt = useErrorPageTimestamp();

  return (
    <ErrorPageFrame
      pageTitle="Login Failed"
      badgeIcon={<UserXIcon />}
      badgeText="Login Failed"
      heading="We couldn't sign you in."
      description="Your sign-in provider didn't complete the login. Go back to the login page and try again."
      actions={
        <Button variant="project" asChild>
          <Link to="/login">
            <ArrowLeftIcon />
            Back to Login
          </Link>
        </Button>
      }
      statusRows={[
        {
          icon: <LogInIcon />,
          label: "Sign-in provider",
          state: "Not completed",
          tone: "warning"
        }
      ]}
      monoRows={[
        ["route", window.location.pathname],
        ["time", occurredAt]
      ]}
      report={[
        `route: ${window.location.pathname}`,
        "error: Sign-in provider did not complete the login",
        `time: ${occurredAt}`
      ].join("\n")}
    />
  );
};
