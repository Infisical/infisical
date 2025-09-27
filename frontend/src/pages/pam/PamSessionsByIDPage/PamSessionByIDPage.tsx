import { Helmet } from "react-helmet";
import { useParams } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPamSessionActions } from "@app/context/ProjectPermissionContext/types";
import { useGetPamSessionById } from "@app/hooks/api/pam";

import { PamSessionDetailsSection } from "./components/PamSessionDetailsSection";
import { PamSessionLogsSection } from "./components/PamSessionLogsSection";

const Page = () => {
  const sessionId = useParams({
    from: ROUTE_PATHS.Pam.PamSessionByIDPage.id,
    select: (el) => el.sessionId
  });
  const { data: session } = useGetPamSessionById(sessionId);

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {session && (
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader
            title={`${session.accountName} Session`}
            description={`View details for this ${session.accountName} session.`}
          />
          <div className="flex">
            <div className="mr-4 w-96">
              <PamSessionDetailsSection session={session} />
            </div>
            <div className="w-full">
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
