import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";

import { PageHeader } from "@app/components/v2";

import { MachineIdentitiesTable, OrganizationsTable, UserIdentitiesTable } from "./components";

export const ResourceOverviewPage = () => {
  const { t } = useTranslation();
  const { selectedTab } = useSearch({
    from: "/_authenticate/_inject-org-details/admin/_admin-layout/resources/overview"
  });

  const activeTab = selectedTab || "organizations";

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
          <div>
            {activeTab === "organizations" && <OrganizationsTable />}
            {activeTab === "users" && <UserIdentitiesTable />}
            {activeTab === "identities" && <MachineIdentitiesTable />}
          </div>
        </div>
      </div>
    </div>
  );
};
