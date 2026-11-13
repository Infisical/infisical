import { DocumentationLinkBadge } from "@infisical/cipher/ui/documentation-link-badge";
import { Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { Navigate, useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { useV4Session } from "../../data/session/contract";
import { v4Path } from "../../links";
import { ProvisioningTab } from "./provisioning/ProvisioningTab";
import { SsoTab } from "./sso/SsoTab";

const tabs = [
  { value: "sso", label: "SSO" },
  { value: "provisioning", label: "Provisioning" }
];

export const SsoPage = () => {
  const { selectedTab } = useSearch({ from: "/v4/organizations/$orgId/sso" });
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/sso" });
  const navigate = useNavigate();
  const { organization } = useV4Session();
  const activeTab = tabs.some((tab) => tab.value === selectedTab) ? selectedTab : "sso";
  if (organization.isSubOrganization) {
    return <Navigate to={v4Path("/organizations/$orgId/settings")} params={{ orgId }} replace />;
  }
  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="SSO & provisioning"
          description="Configure how members sign in and how their accounts are provisioned."
          badges={
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/user-authentication" />
          }
          tabs={
            <Tabs
              label="SSO and provisioning sections"
              value={activeTab}
              onValueChange={(next) =>
                navigate({
                  to: v4Path("/organizations/$orgId/sso"),
                  params: { orgId },
                  search: { selectedTab: next }
                })
              }
              tabs={tabs.map((tab) => ({ ...tab, content: null }))}
            />
          }
        />
        {activeTab === "sso" ? <SsoTab /> : <ProvisioningTab />}
      </Stack>
    </TooltipProvider>
  );
};
