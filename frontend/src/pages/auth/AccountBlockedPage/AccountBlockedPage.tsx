import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, BanIcon, UserXIcon } from "lucide-react";

import { Button } from "@app/components/v3";
import { readAccountBlockedMessage } from "@app/helpers/blocklist";
import { ErrorPageFrame, useErrorPageTimestamp } from "@app/pages/public/ErrorPage/components";

const DEFAULT_MESSAGE =
  "Access to Infisical has been restricted for this account. Contact support@infisical.com if you believe this is a mistake.";

export const AccountBlockedPage = () => {
  const occurredAt = useErrorPageTimestamp();
  const [message] = useState(() => readAccountBlockedMessage() || DEFAULT_MESSAGE);

  return (
    <ErrorPageFrame
      pageTitle="Account Blocked"
      badgeIcon={<BanIcon />}
      badgeText="403 · Account Blocked"
      heading="Your account has been blocked."
      description={message}
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
          icon: <UserXIcon />,
          label: "Account",
          state: "Blocked",
          tone: "warning"
        }
      ]}
      monoRows={[
        ["route", window.location.pathname],
        ["time", occurredAt]
      ]}
      report={[
        `route: ${window.location.pathname}`,
        "error: 403 AccountBlocked",
        `reason: ${message}`,
        `time: ${occurredAt}`
      ].join("\n")}
    />
  );
};
