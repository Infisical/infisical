import { Link } from "@tanstack/react-router";
import { AxiosError } from "axios";
import { ArrowLeftIcon, HouseIcon, LockIcon, ShieldXIcon } from "lucide-react";

import { Button } from "@app/components/v3";

import { ErrorPageFrame, useErrorPageTimestamp } from "../ErrorPage/components";

type Props = {
  // The 403 originates from an Axios request, so forward the error to preserve the backend
  // request ID and response detail for support/log correlation. Optional so the page still
  // renders when no error is supplied.
  error?: unknown;
};

export const ForbiddenPage = ({ error }: Props = {}) => {
  const occurredAt = useErrorPageTimestamp();

  const isAxios = error instanceof AxiosError;

  const reqId =
    isAxios && typeof error.response?.data?.reqId === "string"
      ? error.response.data.reqId
      : undefined;

  const responseData =
    isAxios && error.response?.data ? JSON.stringify(error.response.data, null, 2) : null;

  const monoRows: [string, string][] = [
    ...(reqId ? ([["request", reqId]] as [string, string][]) : []),
    ["route", window.location.pathname],
    ["time", occurredAt]
  ];

  const report = [
    `route: ${window.location.pathname}`,
    "error: 403 Access Denied",
    reqId ? `request: ${reqId}` : null,
    `time: ${occurredAt}`,
    responseData ? `response: ${responseData}` : null
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <ErrorPageFrame
      helmetTitle="Infisical | Access Denied"
      badgeIcon={<LockIcon />}
      badgeText="403 · Access Denied"
      heading={
        <>
          You&rsquo;ve hit a wall.
          <br />
          <span className="text-2xl">Your secrets are behind it.</span>
        </>
      }
      description={
        <>
          You don&rsquo;t have permission to view this page. Check with your admin, or head back
          home.
        </>
      }
      actions={
        <>
          <Button variant="project" asChild>
            <Link to="/">
              <HouseIcon />
              Back to Home
            </Link>
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeftIcon />
            Go Back
          </Button>
        </>
      }
      statusRows={[
        {
          icon: <ShieldXIcon />,
          label: "Access",
          state: "Denied (403)",
          tone: "warning"
        }
      ]}
      monoRows={monoRows}
      report={report}
    />
  );
};
