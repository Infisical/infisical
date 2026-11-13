import { useTranslation } from "react-i18next";

import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v3";
import { ProjectPermissionKmipActions, ProjectPermissionSub } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { KmipClientTable } from "./components/KmipClientTable";

export const KmipPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-page">
      <PageTitle title={t("page-titles.kmip")} />
      <div className="mx-auto flex flex-col bg-page text-foreground">
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
          <PageHeader
            scope={ProjectType.KMS}
            title="KMIP"
            description="Integrate with Infisical KMS via Key Management Interoperability Protocol."
          />
          <ProjectPermissionCan
            renderGuardBanner
            I={ProjectPermissionKmipActions.ReadClients}
            a={ProjectPermissionSub.Kmip}
          >
            <KmipClientTable />
          </ProjectPermissionCan>
        </div>
      </div>
    </div>
  );
};
