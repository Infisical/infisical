import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { CaTab } from "./components";
// import { CaTable } from "./components";

// TODO: fix permission

/**
 * TODO 1: CA section
 * TODO 2: Certificates section
 */

enum TabSections {
  Ca = "certificate-authorities",
  Certificates = "certificates"
}

export const CertificatesPage = withProjectPermission(
  () => {
    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl py-6 px-6">
          <p className="mr-4 mb-4 text-3xl font-semibold text-white">Certificates</p>
          <Tabs defaultValue={TabSections.Ca}>
            <TabList>
              <Tab value={TabSections.Ca}>Certificate Authorities</Tab>
              <Tab value={TabSections.Certificates}>Certificates</Tab>
            </TabList>
            <TabPanel value={TabSections.Ca}>
              <CaTab />
            </TabPanel>
            <TabPanel value={TabSections.Certificates}>
              <div>Certs</div>
              {/* <OrgGroupsTab /> */}
            </TabPanel>
          </Tabs>
        </div>
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.AuditLogs }
);
