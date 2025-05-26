import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

import { ExternalCaSection } from "./components/ExternalCaSection";
import { CaSection } from "./components";

export const CertificateAuthoritiesPage = () => {
  const { t } = useTranslation();
  return (
    <div className="container mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Certificate Authorities" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-7xl">
        <PageHeader
          title="Certificate Authorities"
          description="Manage certificate authorities for issuing and signing certificates"
        />
        <ProjectPermissionCan
          renderGuardBanner
          I={ProjectPermissionActions.Read}
          a={ProjectPermissionSub.CertificateAuthorities}
        >
          <CaSection />
          <ExternalCaSection />
        </ProjectPermissionCan>
      </div>
    </div>
  );
};
