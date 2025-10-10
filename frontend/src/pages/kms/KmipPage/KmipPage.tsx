import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ProjectPermissionKmipActions, ProjectPermissionSub } from "@app/context";

import { KmipClientTable } from "./components/KmipClientTable";

export const KmipPage = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-bunker-800 h-full">
      <Helmet>
        <title>{t("common.head-title", { title: "KMS" })}</title>
      </Helmet>
      <div className="bg-bunker-800 container mx-auto flex flex-col justify-between text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader
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
