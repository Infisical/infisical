import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v3/platform";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretScanningFindingActions } from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { SecretScanningFindingsTable } from "../components/findings";

export const SecretScanningFindingsPage = () => {
  const { t } = useTranslation();
  const { status, dataSourceId, resourceId } = useSearch({
    from: ROUTE_PATHS.SecretScanning.FindingsPage.id
  });

  return (
    <>
      <PageTitle title={t("page-titles.secret-scanning-findings")} />
      <ProjectPermissionCan
        renderGuardBanner
        I={ProjectPermissionSecretScanningFindingActions.Read}
        a={ProjectPermissionSub.SecretScanningFindings}
      >
        <div className="h-full bg-page">
          <div className="mx-auto flex flex-col justify-between bg-page text-foreground-inverse">
            <div className="mx-auto mb-6 w-full max-w-8xl">
              <PageHeader
                scope={ProjectType.SecretScanning}
                title="Findings"
                description="Secrets detected across every data source."
              />
              <SecretScanningFindingsTable
                // filters are only read from the URL on mount, so a navigation that changes them needs a fresh table
                key={`${status ?? ""}:${dataSourceId ?? ""}:${resourceId ?? ""}`}
                description="Review and triage leaked secrets."
                initialStatus={status}
                initialDataSourceId={dataSourceId}
                initialResourceId={resourceId}
              />
            </div>
          </div>
        </div>
      </ProjectPermissionCan>
    </>
  );
};
