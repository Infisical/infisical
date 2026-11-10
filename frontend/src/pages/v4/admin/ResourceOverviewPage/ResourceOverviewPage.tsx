import { useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";

import { EmailDomainsTab } from "./EmailDomainsTab";
import { IdentitiesTab } from "./IdentitiesTab";
import { OrganizationsTab } from "./OrganizationsTab";
import { UsersTab } from "./UsersTab";

const tabs: Record<string, () => React.JSX.Element> = {
  organizations: OrganizationsTab,
  users: UsersTab,
  identities: IdentitiesTab,
  emailDomains: EmailDomainsTab
};

export const ResourceOverviewPage = () => {
  const { selectedTab } = useSearch({ from: "/v4/admin/_v4-admin-shell/resources/overview" });
  const Tab = (selectedTab && tabs[selectedTab]) || OrganizationsTab;
  return (
    <Stack gap={24}>
      <PageTitle title="Resource overview" />
      <PageHeader title="Resource overview" />
      <Tab key={selectedTab} />
    </Stack>
  );
};
