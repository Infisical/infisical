import { Helmet } from "react-helmet";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useParams } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useOrganization, useProject } from "@app/context";
import { ProjectPermissionPamSessionActions } from "@app/context/ProjectPermissionContext/types";
import { useGetPamSessionById } from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";

import { PamSessionDetailsSection } from "./components/PamSessionDetailsSection";
import { PamSessionLogsSection } from "./components/PamSessionLogsSection";

const Page = () => {
  const sessionId = useParams({
    from: ROUTE_PATHS.Pam.PamSessionByIDPage.id,
    select: (el) => el.sessionId
  });
  const { data: session } = useGetPamSessionById(sessionId);
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {session && (
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
          <Link
            to="/organizations/$orgId/projects/pam/$projectId/sessions"
            params={{
              orgId: currentOrg.id,
              projectId: currentProject.id
            }}
            className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
            Sessions
          </Link>
          <PageHeader
            scope={ProjectType.PAM}
            title={`${session.accountName} Session`}
            description={`View details for this ${session.accountName} session.`}
          />
          <div className="flex">
            <div className="mr-4 flex h-fit w-96">
              <PamSessionDetailsSection session={session} />
            </div>
            <div className="flex w-full min-w-0">
              <PamSessionLogsSection session={session} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const PamSessionByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>PAM Session</title>
      </Helmet>
      <ProjectPermissionCan
        I={ProjectPermissionPamSessionActions.Read}
        a={ProjectPermissionSub.PamSessions}
        passThrough={false}
        renderGuardBanner
      >
        <Page />
      </ProjectPermissionCan>
    </>
  );
};
