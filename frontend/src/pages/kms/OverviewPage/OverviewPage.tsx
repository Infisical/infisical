import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v3/platform";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CmekTable } from "./components";

export const OverviewPage = () => {
  return (
    <div className="h-full bg-page">
      <PageTitle title="KMS" />
      <div className="mx-auto flex flex-col justify-between bg-page text-foreground-inverse">
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <PageHeader
            scope={ProjectType.KMS}
            title="Project Overview"
            description="Manage keys and perform cryptographic operations."
          />
          <ProjectPermissionCan
            renderGuardBanner
            I={ProjectPermissionActions.Read}
            a={ProjectPermissionSub.Cmek}
          >
            <CmekTable />
          </ProjectPermissionCan>
        </div>
      </div>
    </div>
  );
};
