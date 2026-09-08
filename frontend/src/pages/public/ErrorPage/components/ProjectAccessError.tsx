import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { HouseIcon, SendIcon, UserPlusIcon, UserXIcon } from "lucide-react";

import { RequestProjectAccessModal } from "@app/components/projects";
import { Button } from "@app/components/v3";
import { OrgPermissionSubjects, useOrgPermission } from "@app/context";
import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionProjectActions
} from "@app/context/OrgPermissionContext/types";
import { getOrgScopedProductPath, getProjectTitle } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { useOrgAdminAccessProject, useSearchProjects } from "@app/hooks/api";
import { useGetOrganizationById } from "@app/hooks/api/organization/queries";
import { ProjectType } from "@app/hooks/api/projects/types";

import { ErrorPageFrame, useErrorPageTimestamp } from "./ErrorPageFrame";

type ProjectAccessErrorProps = {
  projectId?: string;
};

// Products users experience as a single app rather than something they pick a project for
// (ProjectSelect hides itself for both), so the copy names the product instead of "this project".
// Cert Manager still carries a $projectId in its route for legacy multi-instance orgs, so it isn't
// in the org-scoped registry.
const CERT_MANAGER_PATH_RE = /^\/organizations\/[^/]+\/projects\/cert-manager(?:\/|$)/;

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

  // Org-scoped products have no $projectId route param, and TanStack attributes beforeLoad
  // failures to the nearest matched ancestor rather than the failing route, so derive the org id
  // from the URL. Keep in sync with the product layouts.
  const orgScopedPath = getOrgScopedProductPath(window.location.pathname);
  const productName = (() => {
    if (orgScopedPath) return getProjectTitle(orgScopedPath.product.type);
    return CERT_MANAGER_PATH_RE.test(window.location.pathname)
      ? getProjectTitle(ProjectType.CertificateManager)
      : undefined;
  })();

  const needsOrgFallback = !projectIdProp && !routeProjectId;
  const orgScopedOrgId = needsOrgFallback ? orgScopedPath?.orgId : undefined;
  // Not useOrganization(): that reads the _inject-org-details route context, which throws when the
  // failure happened at or above that route, and this is the default error component.
  const { data: org, isPending: isOrgPending } = useGetOrganizationById(orgScopedOrgId ?? "", {
    enabled: Boolean(orgScopedOrgId)
  });

  const projectId =
    projectIdProp ??
    routeProjectId ??
    (orgScopedPath && org ? (org[orgScopedPath.product.projectIdField] ?? undefined) : undefined);

  const { data, isPending: isProjectSearchPending } = useSearchProjects({
    projectIds: projectId ? [projectId] : [],
    options: {
      enabled: Boolean(projectId)
    }
  });

  const [project] = data?.projects ?? [];

  // A disabled query reports isPending forever, so only an enabled query counts as in-flight
  const isResolvingProjectId = Boolean(orgScopedOrgId) && isOrgPending;
  const isProjectResolving = isResolvingProjectId || (Boolean(projectId) && isProjectSearchPending);
  // Nothing in flight and still no project: the search errored or returned nothing, or no id
  // could be resolved. The request flow needs the resolved project (the modal renders nothing
  // without it), so disable it rather than leave it enabled but inert.
  const isProjectUnavailable = !isProjectResolving && !project;
  // Joining only needs the id (the server re-validates it), so it survives a failed project
  // lookup and is blocked only when no id could be resolved at all
  const isJoinUnavailable = !projectId && !isResolvingProjectId;

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
    if (!projectId) return;
    await orgAdminAccessProject.mutateAsync({
      projectId
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

  const lookupFailedCopy = (action: string) =>
    `We couldn't load its details, so ${action} isn't available right now. Refresh to try again, or head back home.`;

  const monoRows: [string, string][] = [
    ...(project ? ([["project", project.name]] as [string, string][]) : []),
    ["route", window.location.pathname],
    ["time", occurredAt]
  ];

  const projectReportValue = (() => {
    if (!projectId) return null;
    if (project) return `${projectId} (${project.name})`;
    return isProjectUnavailable ? `${projectId} (name lookup failed)` : projectId;
  })();

  const report = [
    `route: ${window.location.pathname}`,
    "error: 403 ProjectMembershipNotFound",
    projectReportValue ? `project: ${projectReportValue}` : null,
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
            if (canJoinAsAdmin) {
              if (isJoinUnavailable) return lookupFailedCopy("joining");
              return "As an organization admin, you can join directly, or head back home.";
            }
            if (canRequestAccess) {
              if (isProjectUnavailable) return lookupFailedCopy("requesting access");
              return "Send an access request for an admin to review, or head back home.";
            }
            return "Your organization role doesn't allow requesting access, so ask an organization admin to add you.";
          })()}
        </>
      }
      actions={
        <>
          {canJoinAsAdmin && (
            <Button
              variant="project"
              isPending={isResolvingProjectId || orgAdminAccessProject.isPending}
              isDisabled={isJoinUnavailable}
              onClick={() => handleAccessProject()}
            >
              <UserPlusIcon />
              {joinButtonText}
            </Button>
          )}
          {!canJoinAsAdmin && canRequestAccess && (
            <Button
              variant="project"
              isPending={isProjectResolving}
              isDisabled={isProjectUnavailable}
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
