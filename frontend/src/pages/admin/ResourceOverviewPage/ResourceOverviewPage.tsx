import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";

import { PageHeader } from "@app/components/v3";

import {
  EmailDomainsTable,
  MachineIdentitiesTable,
  OrganizationsTable,
  UserIdentitiesTable
} from "./components";

export const ResourceOverviewPage = () => {
  const { t } = useTranslation();
  const { selectedTab } = useSearch({
    from: "/_authenticate/_inject-org-details/admin/_admin-layout/resources/overview"
  });

  const activeTab = selectedTab || "organizations";

  return (
    <div className="h-full text-foreground">
      <Helmet>
        <title>{t("common.head-title", { title: "Resource Overview" })}</title>
      </Helmet>
      <div className="mx-auto flex flex-col justify-between">
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-8">
          <PageHeader
            scope="instance"
            title="Resource Overview"
            description="Manage resources within your Infisical instance."
          />
          <div>
            {activeTab === "organizations" && <OrganizationsTable />}
            {activeTab === "users" && <UserIdentitiesTable />}
            {activeTab === "identities" && <MachineIdentitiesTable />}
            {activeTab === "emailDomains" && <EmailDomainsTable />}
          </div>
        </div>
      </div>
    </div>
  );
};
