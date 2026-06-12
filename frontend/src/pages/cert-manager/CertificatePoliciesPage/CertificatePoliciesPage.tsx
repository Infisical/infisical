import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionCertificatePolicyActions } from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CertificatePoliciesTab } from "../PoliciesPage/components";

export const CertificatePoliciesPage = () => {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Certificate Policies" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title="Certificate Policies"
          description="Rules that define what certificates can look like, how they can be used, and how long they stay valid."
        />
        <ProjectPermissionCan
          renderGuardBanner
          I={ProjectPermissionCertificatePolicyActions.Read}
          a={ProjectPermissionSub.CertificatePolicies}
        >
          <CertificatePoliciesTab />
        </ProjectPermissionCan>
      </div>
    </div>
  );
};
