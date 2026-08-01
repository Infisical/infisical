import { faHome } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";

import { OrgPermissionCan } from "@app/components/permissions";
import { RequestProjectAccessModal } from "@app/components/projects";
import { AccessRestrictedBanner, Button } from "@app/components/v2";
import { OrgPermissionSubjects } from "@app/context";
import { OrgPermissionAdminConsoleAction } from "@app/context/OrgPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useOrgAdminAccessProject, useSearchProjects } from "@app/hooks/api";
import { useGetOrganizationById } from "@app/hooks/api/organization/queries";

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

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <AccessRestrictedBanner
        body={
          <>
            You are not currently a member of {accessTargetName}. Request access to join.
            <div className="mt-4 flex w-full justify-center gap-2">
              <Link to="/">
                <Button variant="outline_bg">
                  <FontAwesomeIcon icon={faHome} className="mr-2" />
                  Back To Home
                </Button>
              </Link>
              <OrgPermissionCan
                I={OrgPermissionAdminConsoleAction.AccessAllProjects}
                an={OrgPermissionSubjects.AdminConsole}
              >
                {(isAllowed) =>
                  isAllowed ? (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleAccessProject();
                      }}
                      disabled={orgAdminAccessProject.isPending}
                      isLoading={isProjectLoading || orgAdminAccessProject.isPending}
                    >
                      {joinButtonText}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handlePopUpOpen("requestAccessConfirmation")}
                      isLoading={isProjectLoading}
                    >
                      {requestButtonText}
                    </Button>
                  )
                }
              </OrgPermissionCan>
            </div>
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
          </>
        }
      />
    </div>
  );
};
