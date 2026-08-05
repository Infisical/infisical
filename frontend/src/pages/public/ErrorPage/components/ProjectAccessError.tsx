import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { HouseIcon, SendIcon, UserPlusIcon, UserXIcon } from "lucide-react";

import { RequestProjectAccessModal } from "@app/components/projects";
import { Button } from "@app/components/v3";
import { OrgPermissionSubjects, useOrgPermission } from "@app/context";
import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionProjectActions
} from "@app/context/OrgPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useOrgAdminAccessProject, useSearchProjects } from "@app/hooks/api";
import { useGetOrganizationById } from "@app/hooks/api/organization/queries";

import { ErrorPageFrame, useErrorPageTimestamp } from "./ErrorPageFrame";

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
  const occurredAt = useErrorPageTimestamp();

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
    <ErrorPageFrame
      helmetTitle="Infisical | Access Restricted"
      badgeIcon={<UserXIcon />}
      badgeText="403 · Access Restricted"
      heading={
        <>
          Members only.
          <br />
          <span className="text-2xl">You&rsquo;re not on the list yet.</span>
        </>
      }
      description={
        <>
          You&rsquo;re not currently a member of {accessTargetName}.{" "}
          {(() => {
            if (canJoinAsAdmin)
              return "As an organization admin, you can join directly, or head back home.";
            if (canRequestAccess)
              return "Send an access request for an admin to review, or head back home.";
            return "Your organization role doesn't allow requesting access, so ask an organization admin to add you.";
          })()}
        </>
      }
      actions={
        <>
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
        </>
      }
      statusRows={[
        {
          icon: <UserXIcon />,
          label: "Membership",
          state: "Not found (403)",
          tone: "warning"
        }
      ]}
      monoRows={monoRows}
      report={report}
    >
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
    </ErrorPageFrame>
  );
};
