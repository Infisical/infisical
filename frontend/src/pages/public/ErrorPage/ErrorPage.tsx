import { ErrorComponentProps, Link } from "@tanstack/react-router";
import { AxiosError } from "axios";
import {
  BugIcon,
  HouseIcon,
  RefreshCwIcon,
  ServerCrashIcon,
  TriangleAlertIcon
} from "lucide-react";

import { Button } from "@app/components/v3";

import { ForbiddenPage } from "../ForbiddenPage/ForbiddenPage";
import { ErrorPageFrame, ProjectAccessError, useErrorPageTimestamp } from "./components";

const isProjectAccessDeniedError = (error: unknown): error is AxiosError =>
  error instanceof AxiosError &&
  error.status === 403 &&
  error.response?.data?.error === "ProjectMembershipNotFound";

const STATUS_LABELS: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Access Denied",
  404: "Not Found",
  408: "Request Timeout",
  429: "Too Many Requests",
  500: "Server Error",
  502: "Gateway Unavailable",
  503: "Service Unavailable",
  504: "Gateway Timeout"
};

export const ErrorPage = ({ error }: ErrorComponentProps) => {
  const occurredAt = useErrorPageTimestamp();

  if (isProjectAccessDeniedError(error)) {
    return <ProjectAccessError />;
  }

  const isAxios = error instanceof AxiosError;
  const status = isAxios ? (error.status ?? error.response?.status) : undefined;

  if (status === 403) {
    return <ForbiddenPage error={error} />;
  }

  const isGatewayIssue =
    status === 502 || status === 503 || status === 504 || (isAxios && !error.response);

  let badgeText: string;
  let causeSentence: string;
  if (isAxios && status) {
    badgeText = `${status} · ${STATUS_LABELS[status] ?? "Request Failed"}`;
    if (status === 504) {
      causeSentence = "A gateway timeout stopped this page from loading.";
    } else if (isGatewayIssue) {
      causeSentence = "A gateway error stopped this page from loading.";
    } else {
      causeSentence = "A failed request stopped this page from loading.";
    }
  } else if (isAxios) {
    badgeText = "Network Error";
    causeSentence = "A network error stopped this page from loading.";
  } else {
    badgeText = error?.name || "Unexpected Error";
    causeSentence = "An unexpected error stopped this page from loading.";
  }

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

  const errorReport = [
    `route: ${window.location.pathname}`,
    `error: ${error?.name ?? "Unknown"}`,
    `message: ${error?.message ?? ""}`,
    status ? `status: ${status}` : null,
    reqId ? `request: ${reqId}` : null,
    `time: ${occurredAt}`,
    responseData ? `response: ${responseData}` : null
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <ErrorPageFrame
      badgeIcon={<TriangleAlertIcon />}
      badgeText={badgeText}
      heading={
        <>
          The page broke.
          <br />
          <span className="text-2xl">Your secrets didn&rsquo;t.</span>
        </>
      }
      description={`${causeSentence} Retry, or head back home.`}
      actions={
        <>
          <Button variant="project" asChild>
            <Link to="/">
              <HouseIcon />
              Back to Home
            </Link>
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCwIcon />
            Retry
          </Button>
        </>
      }
      statusRows={[
        isAxios
          ? {
              icon: <ServerCrashIcon />,
              label: isGatewayIssue ? "Secrets gateway" : "API request",
              state: isGatewayIssue ? "Unavailable" : `Failed${status ? ` (${status})` : ""}`,
              tone: "warning"
            }
          : {
              icon: <BugIcon />,
              label: "This page",
              state: "Render error",
              tone: "warning"
            }
      ]}
      monoRows={monoRows}
      report={errorReport}
    />
  );
};
