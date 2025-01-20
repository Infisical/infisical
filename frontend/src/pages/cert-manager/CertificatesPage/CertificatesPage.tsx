import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";

import { CaTab, CertificatesTab, PkiAlertsTab } from "./components";

enum TabSections {
  Ca = "certificate-authorities",
  Certificates = "certificates",
  Alerting = "alerting"
}

export const CertificatesPage = () => {
  const { t } = useTranslation();
  return (
    <div className="container mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Certificates" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-7xl">
        <PageHeader title="Overview" />
        <Tabs defaultValue={TabSections.Certificates}>
          <TabList>
            <Tab value={TabSections.Certificates}>Certificates</Tab>
            <Tab value={TabSections.Ca}>Certificate Authorities</Tab>
            <Tab value={TabSections.Alerting}>Alerting</Tab>
          </TabList>
          <TabPanel value={TabSections.Certificates}>
            <ProjectPermissionCan
              renderGuardBanner
              passThrough={false}
              I={ProjectPermissionActions.Read}
              a={ProjectPermissionSub.Certificates}
            >
              <CertificatesTab />
            </ProjectPermissionCan>
          </TabPanel>
          <TabPanel value={TabSections.Ca}>
            <ProjectPermissionCan
              renderGuardBanner
              passThrough={false}
              I={ProjectPermissionActions.Read}
              a={ProjectPermissionSub.CertificateAuthorities}
            >
              <CaTab />
            </ProjectPermissionCan>
          </TabPanel>
          <TabPanel value={TabSections.Alerting}>
            <ProjectPermissionCan
              renderGuardBanner
              passThrough={false}
              I={ProjectPermissionActions.Read}
              a={ProjectPermissionSub.PkiAlerts}
            >
              <PkiAlertsTab />
            </ProjectPermissionCan>
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
