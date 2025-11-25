import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";

import { MachineIdentitiesTable, OrganizationsTable, UserIdentitiesTable } from "./components";

export const ResourceOverviewPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "Resource Overview" })}</title>
      </Helmet>
      <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <PageHeader
            scope="instance"
            title="Resource Overview"
            description="Manage resources within your Infisical instance."
          />
          <Tabs orientation="vertical" defaultValue="tab-organizations">
            <TabList>
              <Tab variant="instance" value="tab-organizations">
                Organizations
              </Tab>
              <Tab variant="instance" value="tab-users">
                Users
              </Tab>
              <Tab variant="instance" value="tab-identities">
                Machine Identities
              </Tab>
            </TabList>
            <TabPanel value="tab-organizations">
              <OrganizationsTable />
            </TabPanel>
            <TabPanel value="tab-users">
              <UserIdentitiesTable />
            </TabPanel>
            <TabPanel value="tab-identities">
              <MachineIdentitiesTable />
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </div>
  );
};
