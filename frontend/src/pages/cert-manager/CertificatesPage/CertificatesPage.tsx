import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";

import { PkiCollectionSection } from "../AlertingPage/components";
import { CertificatesSection } from "./components";

export const CertificatesPage = () => {
  const { t } = useTranslation();
  const { permission } = useProjectPermission();

  const canAccessPkiColl = permission.can(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.PkiCollections
  );
  const canAccessCerts = permission.can(
    ProjectPermissionCertificateActions.Read,
    ProjectPermissionSub.Certificates
  );

  return (
    <div className="container mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Certificates" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-7xl">
        <PageHeader
          title="Certificates"
          description="View and track issued certificates, monitor expiration dates, and manage certificate lifecycles."
        />
        {/* If both are false, the section does not render. This is to prevent duplicate banners. */}
        {(canAccessCerts || canAccessPkiColl) && (
          <ProjectPermissionCan
            renderGuardBanner
            I={ProjectPermissionActions.Read}
            a={ProjectPermissionSub.PkiCollections}
          >
            <PkiCollectionSection />
          </ProjectPermissionCan>
        )}
        <ProjectPermissionCan
          renderGuardBanner
          I={ProjectPermissionCertificateActions.Read}
          a={ProjectPermissionSub.Certificates}
        >
          <CertificatesSection />
        </ProjectPermissionCan>
      </div>
    </div>
  );
};
