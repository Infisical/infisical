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

// PAM is a per-org singleton with no $projectId route param, unlike other product routes, so this
// screen can't read the project id off the route the normal way when it fires for a PAM page. Its
// beforeLoad throws from a parent route's error boundary (TanStack attributes a beforeLoad failure
// to the nearest already-matched ancestor, not the failing route itself), so a PAM-specific
// errorComponent on the PAM route never runs either. Derive the org id from the URL instead.
// Keep in sync with the PAM route path declared in `frontend/src/pages/pam/layout.tsx`.
const getPamOrgIdFromPath = () =>
  window.location.pathname.match(/\/organizations\/([^/]+)\/pam(\/|$)/)?.[1];

export const ProjectAccessError = ({ projectId: projectIdProp }: ProjectAccessErrorProps = {}) => {
  const orgAdminAccessProject = useOrgAdminAccessProject();

  const navigate = useNavigate();

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp([
    "requestAccessConfirmation"
  ] as const);

  const { projectId: routeProjectId } = useParams({
    strict: false
  });

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

  return (
    <div className="flex h-full min-h-screen w-full items-center justify-center bg-bunker-800">
      <AccessRestrictedBanner
        body={
          <>
            You are not currently a member of this project. Request access to join project.
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
                      Join Project as Admin
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handlePopUpOpen("requestAccessConfirmation")}
                      isLoading={isProjectLoading}
                    >
                      Request Access to Project
                    </Button>
                  )
                }
              </OrgPermissionCan>
            </div>
            <RequestProjectAccessModal
              isOpen={popUp.requestAccessConfirmation.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle("requestAccessConfirmation", isOpen)}
              project={project}
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
