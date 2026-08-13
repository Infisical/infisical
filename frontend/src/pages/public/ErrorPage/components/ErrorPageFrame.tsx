import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { ActivityIcon, CheckIcon, CopyIcon, MonitorCheckIcon, ShieldCheckIcon } from "lucide-react";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { Badge, Button, Card } from "@app/components/v3";
import { useTimedReset } from "@app/hooks";

const TONES = {
  warning: { chip: "bg-warning/10 text-warning", dot: "bg-warning", text: "text-warning" },
  success: { chip: "bg-success/10 text-success", dot: "bg-success", text: "text-success" }
};

export type ErrorPageStatusRow = {
  icon: ReactNode;
  label: string;
  state: string;
  tone: keyof typeof TONES;
};

// The timestamp appears in both the mono rows and the copyable report, so the caller owns it
// (via this hook) and passes it into both.
export const useErrorPageTimestamp = () => {
  const [occurredAt] = useState(
    () => `${new Date().toISOString().slice(0, 19).replace("T", " ")} UTC`
  );
  return occurredAt;
};

type Props = {
  helmetTitle?: string;
  badgeIcon: ReactNode;
  badgeText: string;
  heading: ReactNode;
  description: ReactNode;
  actions: ReactNode;
  // Page-specific rows; the frame appends the standard Dashboard / Your secrets reassurance rows
  statusRows: ErrorPageStatusRow[];
  monoRows: [string, string][];
  report: string;
  children?: ReactNode;
};

// Shared shell for the full-page error/status family (ErrorPage, ForbiddenPage, NotFoundPage,
// ProjectAccessError): vault backdrop, two-column card, badge + heading + actions on the left,
// "What We Know" status column on the right.
export const ErrorPageFrame = ({
  helmetTitle,
  badgeIcon,
  badgeText,
  heading,
  description,
  actions,
  statusRows,
  monoRows,
  report,
  children
}: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // These pages render from the router's error/not-found boundaries, so they can appear
  // full-screen at the root or nested inside the app layout chrome (sidebar, header), where
  // the full-screen vault backdrop doesn't fit
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [copyLabel, isCopied, setCopyLabel] = useTimedReset<string>({
    initialState: "Copy Report"
  });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setIsFullScreen(rect.top < 2 && rect.left < 2 && window.innerWidth - rect.width < 4);
  }, []);

  const allStatusRows: ErrorPageStatusRow[] = [
    ...statusRows,
    {
      icon: <MonitorCheckIcon />,
      label: "Dashboard",
      state: "Operational",
      tone: "success"
    },
    {
      icon: <ShieldCheckIcon />,
      label: "Your secrets",
      state: "Encrypted & safe",
      tone: "success"
    }
  ];

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center p-4 ${
        isFullScreen
          ? "min-h-screen bg-linear-to-tr from-card via-bunker-900 to-card"
          : "min-h-full"
      }`}
    >
      {helmetTitle && (
        <Helmet>
          <title>{helmetTitle}</title>
        </Helmet>
      )}
      {isFullScreen && <AuthPageBackground />}
      <Card className="relative z-10 grid w-full max-w-5xl gap-0 overflow-hidden p-0 lg:grid-cols-[1fr_26rem]">
        <div className="flex flex-col p-8">
          <img alt="Infisical" src="/images/logotransparent.png" className="h-5 self-start" />
          <div className="mt-6 flex flex-col items-start gap-5">
            <Badge variant="warning" className="h-6 px-2">
              {badgeIcon}
              {badgeText}
            </Badge>
            <h1 className="text-3xl font-semibold text-foreground">{heading}</h1>
            <p className="max-w-md text-sm leading-relaxed text-accent">{description}</p>
            <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
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
        <div className="flex flex-col border-t border-border bg-bunker-800/50 lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between gap-2 border-b border-border py-4 pr-5 pl-6">
            <div className="flex items-center gap-2.5 text-muted">
              <ActivityIcon className="size-4" />
              <span className="text-xs font-medium tracking-[0.2em] uppercase">What We Know</span>
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                navigator.clipboard.writeText(report).then(() => {
                  setCopyLabel("Copied");
                });
              }}
            >
              {isCopied ? <CheckIcon /> : <CopyIcon />}
              {copyLabel}
            </Button>
          </div>
          {allStatusRows.map((row) => {
            const tone = TONES[row.tone];
            return (
              <div
                key={row.label}
                className="flex items-center gap-3.5 border-b border-border px-6 py-4"
              >
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-md [&>svg]:size-4 ${tone.chip}`}
                >
                  {row.icon}
                </div>
                <span className="text-sm text-foreground">{row.label}</span>
                <div className="ml-auto flex items-center gap-2">
                  <span className={`size-1.5 rounded-full ${tone.dot}`} />
                  <span className={`text-sm whitespace-nowrap ${tone.text}`}>{row.state}</span>
                </div>
              </div>
            );
          })}
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
      {children}
    </div>
  );
};
