import { useLayoutEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ActivityIcon,
  CheckIcon,
  CopyIcon,
  HouseIcon,
  MonitorCheckIcon,
  SendIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UserXIcon
} from "lucide-react";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { RequestProjectAccessModal } from "@app/components/projects";
import { Badge, Button, Card } from "@app/components/v3";
import { OrgPermissionSubjects, useOrgPermission } from "@app/context";
import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionProjectActions
} from "@app/context/OrgPermissionContext/types";
import { usePopUp, useTimedReset } from "@app/hooks";
import { useOrgAdminAccessProject, useSearchProjects } from "@app/hooks/api";
import { useGetOrganizationById } from "@app/hooks/api/organization/queries";

const TONES = {
  warning: { chip: "bg-warning/10 text-warning", dot: "bg-warning", text: "text-warning" },
  success: { chip: "bg-success/10 text-success", dot: "bg-success", text: "text-success" }
};

type ProjectAccessErrorProps = {
  projectId?: string;
};

// PAM has no $projectId route param, and TanStack attributes beforeLoad failures to the nearest
// matched ancestor rather than the failing route, so derive the org id from the URL. Keep in sync with pam/layout.tsx.
const getPamOrgIdFromPath = () =>
  window.location.pathname.match(/\/organizations\/([^/]+)\/pam(\/|$)/)?.[1];

// Products users experience as a single app rather than something they pick a project for
// (ProjectSelect hides itself for both), so the copy names the product instead of "this project".
// Cert Manager still carries a $projectId in its route for legacy multi-instance orgs.
const PRODUCTS = [
  { pattern: /\/organizations\/[^/]+\/pam(\/|$)/, name: "Privileged Access Manager" },
  {
    pattern: /\/organizations\/[^/]+\/projects\/cert-manager(\/|$)/,
    name: "Certificate Manager"
  }
];

const getProductNameFromPath = () =>
  PRODUCTS.find(({ pattern }) => pattern.test(window.location.pathname))?.name;

export const ProjectAccessError = ({ projectId: projectIdProp }: ProjectAccessErrorProps = {}) => {
  const orgAdminAccessProject = useOrgAdminAccessProject();

  const navigate = useNavigate();
  const { permission } = useOrgPermission();

  const containerRef = useRef<HTMLDivElement>(null);
  // Rendered by the error boundary, so it can appear full-screen at the root or nested inside
  // the app layout chrome (sidebar, header), where the full-screen vault backdrop doesn't fit
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

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp([
    "requestAccessConfirmation"
  ] as const);

  const { projectId: routeProjectId } = useParams({
    strict: false
  });

  const productName = getProductNameFromPath();
  const needsPamFallback = !projectIdProp && !routeProjectId;
  const pamOrgId = needsPamFallback ? getPamOrgIdFromPath() : undefined;
  const { data: pamOrg } = useGetOrganizationById(pamOrgId ?? "", {
    enabled: Boolean(pamOrgId)
  });

  const projectId = projectIdProp ?? routeProjectId ?? pamOrg?.pamProjectId ?? undefined;

  const { data, isPending: isProjectLoading } = useSearchProjects({
    projectIds: projectId ? [projectId] : [],
    options: {
      enabled: Boolean(projectId)
    }
  });

  const [project] = data?.projects ?? [];

  const canJoinAsAdmin = permission.can(
    OrgPermissionAdminConsoleAction.AccessAllProjects,
    OrgPermissionSubjects.AdminConsole
  );

  // Mirrors the org-level check requestProjectAccess enforces server-side; without it the
  // request would only fail on submit, so don't offer the action at all.
  const canRequestAccess = permission.can(
    OrgPermissionProjectActions.RequestAccess,
    OrgPermissionSubjects.Project
  );

  const handleAccessProject = async () => {
    if (!project) return;
    await orgAdminAccessProject.mutateAsync({
      projectId: project.id
    });
    await navigate({
      to: "."
    });
  };

  const accessTargetName = productName ?? "this project";
  const joinButtonText = productName ? "Join as Admin" : "Join Project as Admin";
  const requestButtonText = productName ? "Request Access" : "Request Access to Project";
  const modalSubTitle = productName
    ? `Requesting access to ${productName}. You may include an optional note for admins to review your request.`
    : undefined;

  const statusRows = [
    {
      icon: <UserXIcon className="size-4" />,
      label: "Membership",
      state: "Not found (403)",
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

  const monoRows: [string, string][] = [
    ...(project ? ([["project", project.name]] as [string, string][]) : []),
    ["route", window.location.pathname],
    ["time", occurredAt]
  ];

  const report = [
    `route: ${window.location.pathname}`,
    "error: 403 ProjectMembershipNotFound",
    projectId ? `project: ${projectId}${project ? ` (${project.name})` : ""}` : null,
    `time: ${occurredAt}`
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
      <Helmet>
        <title>Infisical | Access Restricted</title>
      </Helmet>
      {isFullScreen && <AuthPageBackground />}
      <Card className="relative z-10 grid w-full max-w-5xl gap-0 overflow-hidden p-0 lg:grid-cols-[1fr_26rem]">
        <div className="flex flex-col p-8">
          <img alt="Infisical" src="/images/logotransparent.png" className="h-5 self-start" />
          <div className="mt-6 flex flex-col items-start gap-5">
            <Badge variant="warning" className="h-6 px-2">
              <UserXIcon />
              403 · Access Restricted
            </Badge>
            <h1 className="text-3xl font-semibold text-foreground">
              Members only.
              <br />
              <span className="text-2xl">You&rsquo;re not on the list yet.</span>
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-accent">
              You&rsquo;re not currently a member of {accessTargetName}.{" "}
              {(() => {
                if (canJoinAsAdmin)
                  return "As an organization admin, you can join directly, or head back home.";
                if (canRequestAccess)
                  return "Send an access request for an admin to review, or head back home.";
                return "Your organization role doesn't allow requesting access, so ask an organization admin to add you.";
              })()}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              {canJoinAsAdmin && (
                <Button
                  variant="project"
                  isPending={isProjectLoading || orgAdminAccessProject.isPending}
                  onClick={() => handleAccessProject()}
                >
                  <UserPlusIcon />
                  {joinButtonText}
                </Button>
              )}
              {!canJoinAsAdmin && canRequestAccess && (
                <Button
                  variant="project"
                  isPending={isProjectLoading}
                  onClick={() => handlePopUpOpen("requestAccessConfirmation")}
                >
                  <SendIcon />
                  {requestButtonText}
                </Button>
              )}
              <Button variant={canJoinAsAdmin || canRequestAccess ? "outline" : "project"} asChild>
                <Link to="/">
                  <HouseIcon />
                  Back to Home
                </Link>
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
                <span className={`text-sm whitespace-nowrap ${row.tone.text}`}>{row.state}</span>
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
      <RequestProjectAccessModal
        isOpen={popUp.requestAccessConfirmation.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("requestAccessConfirmation", isOpen)}
        project={project}
        subTitle={modalSubTitle}
        onComplete={() => {
          navigate({
            to: "/"
          });
        }}
      />
    </div>
  );
};
