import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionCertificateProfileActions } from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CertificateProfilesTab } from "../PoliciesPage/components";

export const CertificateProfilesPage = () => {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Certificate Profiles" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title="Certificate Profiles"
          description="Reusable presets that pair a certificate authority with a policy to issue certificates."
        />
        <ProjectPermissionCan
          renderGuardBanner
          I={ProjectPermissionCertificateProfileActions.Read}
          a={ProjectPermissionSub.CertificateProfiles}
        >
          <CertificateProfilesTab />
        </ProjectPermissionCan>
      </div>
    </div>
  );
};
