import { Link, useNavigate } from "@tanstack/react-router";
import { AxiosError } from "axios";
import { ArrowLeftRightIcon, BanIcon, BuildingIcon, LogOutIcon } from "lucide-react";

import { Button } from "@app/components/v3";
import { getBlockedMessage } from "@app/helpers/blocklist";
import { useLogoutUser } from "@app/hooks/api";

import { ErrorPageFrame, useErrorPageTimestamp } from "../ErrorPage/components";

const DEFAULT_MESSAGE =
  "Access to this organization has been restricted. Contact support@infisical.com if you believe this is a mistake.";

type Props = {
  error: unknown;
};

export const OrganizationBlockedPage = ({ error }: Props) => {
  const occurredAt = useErrorPageTimestamp();
  const navigate = useNavigate();
  const logout = useLogoutUser();
  const message = getBlockedMessage(error) || DEFAULT_MESSAGE;

  const reqId =
    error instanceof AxiosError && typeof error.response?.data?.reqId === "string"
      ? error.response.data.reqId
      : undefined;

  const handleLogout = async () => {
    try {
      await logout.mutateAsync();
    } finally {
      navigate({ to: "/login" });
    }
  };

  return (
    <ErrorPageFrame
      pageTitle="Organization Blocked"
      badgeIcon={<BanIcon />}
      badgeText="403 · Organization Blocked"
      heading="This organization has been blocked."
      description={message}
      actions={
        <>
          <Button variant="project" asChild>
            <Link to="/login/select-organization" search={{ force: true }}>
              <ArrowLeftRightIcon />
              Switch Organization
            </Link>
          </Button>
          <Button variant="outline" onClick={handleLogout} isPending={logout.isPending}>
            <LogOutIcon />
            Log Out
          </Button>
        </>
      }
      statusRows={[
        {
          icon: <BuildingIcon />,
          label: "Organization",
          state: "Blocked",
          tone: "warning"
        }
      ]}
      monoRows={[
        ...(reqId ? ([["request", reqId]] as [string, string][]) : []),
        ["route", window.location.pathname],
        ["time", occurredAt]
      ]}
      report={[
        `route: ${window.location.pathname}`,
        "error: 403 OrganizationBlocked",
        `reason: ${message}`,
        reqId ? `request: ${reqId}` : null,
        `time: ${occurredAt}`
      ]
        .filter(Boolean)
        .join("\n")}
    />
  );
};
