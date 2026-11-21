import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { PamResourcePermissionActions } from "@app/hooks/api/pam";

import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { AccountList, useAccountFilters } from "../PamAccountsPage/account-list";
import { useAccountOverlays } from "../PamAccountsPage/account-rows";
import { PAM_ACCOUNTS_DOCS } from "../PamAccountsPage/PamAccountsPage";

const route = v4Path("/organizations/$orgId/pam/accounts/my-accounts");

export const PamMyAccountsPage = () => {
  const { orgId } = useParams({ from: route });
  const go = useGo();
  const pam = useV4Adapter("pam");
  const filters = useAccountFilters();
  const overlays = useAccountOverlays();
  const { data: accounts = [], isPending } = pam.useAccounts({
    filterByAction: PamResourcePermissionActions.LaunchSessions,
    search: filters.search,
    accountType: filters.accountType
  });

  return (
    <TooltipProvider>
      <PageTitle title="My accounts" />
      <Stack gap={24}>
        <PageHeader
          breadcrumb={[{ label: "Accounts", link: go.link(orgHref(orgId, "/pam/accounts")) }]}
          title="My accounts"
          badges={<DocumentationLink href={PAM_ACCOUNTS_DOCS} subject="accounts" />}
        />
        <AccountList
          orgId={orgId}
          label="My accounts"
          accounts={accounts}
          loading={isPending}
          filters={filters}
          showFolder
          overlays={overlays}
          emptyTitle="No accounts available"
          emptyDescription="Ask your PAM admin to grant you access to a folder or account."
        />
      </Stack>
      {overlays.overlays}
    </TooltipProvider>
  );
};
