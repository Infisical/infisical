import { useLayoutEffect, useRef, useState } from "react";
import { ErrorComponentProps, Link } from "@tanstack/react-router";
import { AxiosError } from "axios";
import {
  ActivityIcon,
  BugIcon,
  CheckIcon,
  CopyIcon,
  HouseIcon,
  MonitorCheckIcon,
  RefreshCwIcon,
  ServerCrashIcon,
  ShieldCheckIcon,
  TriangleAlertIcon
} from "lucide-react";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { Badge, Button, Card } from "@app/components/v3";
import { useTimedReset } from "@app/hooks";

import { ProjectAccessError } from "./components";

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

const TONES = {
  warning: { chip: "bg-warning/10 text-warning", dot: "bg-warning", text: "text-warning" },
  success: { chip: "bg-success/10 text-success", dot: "bg-success", text: "text-success" }
};

export const ErrorPage = ({ error }: ErrorComponentProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Errors thrown in nested routes render inside the app layout chrome (sidebar,
  // header), where the full-screen vault backdrop doesn't fit
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [occurredAt] = useState(
    () => `${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`
  );
  const [copyLabel, isCopied, setCopyLabel] = useTimedReset<string>({
    initialState: "Copy Report"
  });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setIsFullScreen(rect.top < 2 && rect.left < 2 && window.innerWidth - rect.width < 4);
  }, []);

  if (isProjectAccessDeniedError(error)) {
    return <ProjectAccessError />;
  }

  const isAxios = error instanceof AxiosError;
  const status = isAxios ? (error.status ?? error.response?.status) : undefined;
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

  const statusRows = [
    isAxios
      ? {
          icon: <ServerCrashIcon className="size-4" />,
          label: isGatewayIssue ? "Secrets gateway" : "API request",
          state: isGatewayIssue ? "Unavailable" : `Failed${status ? ` (${status})` : ""}`,
          tone: TONES.warning
        }
      : {
          icon: <BugIcon className="size-4" />,
          label: "This page",
          state: "Render error",
          tone: TONES.warning
        },
    {
      icon: <MonitorCheckIcon className="size-4" />,
      label: "Dashboard",
      state: "Operational",
      tone: TONES.success
    },
    {
      icon: <ShieldCheckIcon className="size-4" />,
      label: "Your secrets",
      state: "Encrypted & safe",
      tone: TONES.success
    }
  ];

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
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center p-4 ${
        isFullScreen
          ? "min-h-screen bg-linear-to-tr from-card via-bunker-900 to-card"
          : "min-h-full"
      }`}
    >
      {isFullScreen && <AuthPageBackground />}
      <Card className="relative z-10 grid w-full max-w-4xl gap-0 overflow-hidden p-0 md:grid-cols-2">
        <div className="flex flex-col p-8">
          <img alt="Infisical" src="/images/logotransparent.png" className="h-5 self-start" />
          <div className="mt-6 flex flex-col items-start gap-5">
            <Badge variant="warning" className="h-6 px-2">
              <TriangleAlertIcon />
              {badgeText}
            </Badge>
            <h1 className="text-3xl font-semibold text-foreground md:text-4xl">
              The page broke.
              <br />
              Your secrets didn&rsquo;t.
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-accent">
              {causeSentence} Retry, or head back home.
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
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
            </div>
            <p className="text-xs text-muted">
              Still stuck? Email{" "}
              <a
                className="underline underline-offset-4 hover:text-foreground"
                href="mailto:support@infisical.com"
              >
                support@infisical.com
              </a>{" "}
              or{" "}
              <a
                className="underline underline-offset-4 hover:text-foreground"
                target="_blank"
                rel="noopener noreferrer"
                href="https://infisical.com/slack"
              >
                join us on Slack
              </a>
              .
            </p>
          </div>
        </div>
        <div className="flex flex-col border-t border-border bg-bunker-800/50 md:border-t-0 md:border-l">
          <div className="flex items-center justify-between gap-2 border-b border-border py-4 pr-5 pl-6">
            <div className="flex items-center gap-2.5 text-muted">
              <ActivityIcon className="size-4" />
              <span className="text-xs font-medium tracking-[0.2em] uppercase">What We Know</span>
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                navigator.clipboard.writeText(errorReport).then(() => {
                  setCopyLabel("Copied");
                });
              }}
            >
              {isCopied ? <CheckIcon /> : <CopyIcon />}
              {copyLabel}
            </Button>
          </div>
          {statusRows.map((row) => (
            <div
              key={row.label}
              className="flex items-center gap-3.5 border-b border-border px-6 py-4"
            >
              <div
                className={`flex size-9 shrink-0 items-center justify-center rounded-md ${row.tone.chip}`}
              >
                {row.icon}
              </div>
              <span className="text-sm text-foreground">{row.label}</span>
              <div className="ml-auto flex items-center gap-2">
                <span className={`size-1.5 rounded-full ${row.tone.dot}`} />
                <span className={`text-sm ${row.tone.text}`}>{row.state}</span>
              </div>
            </div>
          ))}
          <div className="mt-auto flex flex-col gap-1.5 px-6 py-6 pt-10">
            {monoRows.map(([key, value]) => (
              <div key={key} className="flex gap-4 font-mono text-xs">
                <span className="w-14 shrink-0 text-muted">{key}</span>
                <span className="break-all text-label">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};
