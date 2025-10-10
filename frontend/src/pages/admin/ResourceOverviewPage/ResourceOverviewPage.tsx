import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";

import { MachineIdentitiesTable, OrganizationsTable, UserIdentitiesTable } from "./components";

export const ResourceOverviewPage = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-bunker-800 h-full">
      <Helmet>
        <title>{t("common.head-title", { title: "Resource Overview" })}</title>
      </Helmet>
      <div className="bg-bunker-800 container mx-auto flex flex-col justify-between text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader
            title="Resource Overview"
            description="Manage resources within your Infisical instance."
          />
          <Tabs defaultValue="tab-organizations">
            <TabList>
              <Tab value="tab-organizations">Organizations</Tab>
              <Tab value="tab-users">Users</Tab>
              <Tab value="tab-identities">Identities</Tab>
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
