import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { CaTab, CertificatesTab, PkiAlertsTab } from "./components";

enum TabSections {
  Ca = "certificate-authorities",
  Certificates = "certificates",
  Alerting = "alerting"
}

export const CertificatesPage = withProjectPermission(
  () => {
    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl py-6 px-6">
          <p className="mr-4 mb-4 text-3xl font-semibold text-white">Internal PKI</p>
          <Tabs defaultValue={TabSections.Certificates}>
            <TabList>
              <Tab value={TabSections.Certificates}>Certificates</Tab>
              <Tab value={TabSections.Ca}>Certificate Authorities</Tab>
              <Tab value={TabSections.Alerting}>Alerting</Tab>
            </TabList>
            <TabPanel value={TabSections.Certificates}>
              <CertificatesTab />
            </TabPanel>
            <TabPanel value={TabSections.Ca}>
              <CaTab />
            </TabPanel>
            <TabPanel value={TabSections.Alerting}>
              <PkiAlertsTab />
            </TabPanel>
          </Tabs>
        </div>
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Certificates }
);
