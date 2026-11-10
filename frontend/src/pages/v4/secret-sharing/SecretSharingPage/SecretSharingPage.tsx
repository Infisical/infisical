import { useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { Button } from "@app/components/v4/ui/button";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Tabs } from "@app/components/v4/ui/tabs";
import { TooltipProvider } from "@app/components/v4/ui/tooltip";
import {
  OrgPermissionActions,
  OrgPermissionSecretShareAction,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";

import { useOrgPermission } from "../../access/permissions";
import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { SecretRequestsTable, SharedSecretsTable } from "../lists";
import { RequestSecretDialog, ShareSecretSheet } from "../overlays";
import { SecretSharingSettings } from "../settings";

export enum SecretSharingTab {
  ShareSecret = "share-secret",
  RequestSecret = "request-secret",
  Settings = "settings"
}

export const SecretSharingPage = () => {
  const navigate = useNavigate({
    from: "/v4/organizations/$orgId/projects/secret-management/secret-sharing"
  });
  const { selectedTab, subOrganization } = useSearch({
    from: "/v4/organizations/$orgId/projects/secret-management/secret-sharing"
  });
  const { organization: current } = useV4Session();
  const { data: organization } = useV4Adapter("org").useOrganization(current.id);
  const { permission, isPending } = useOrgPermission();
  const [sharing, setSharing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  if (isPending) return <Loader size="page" label="Loading secret sharing" />;
  const canManageSettings = permission.can(
    OrgPermissionSecretShareAction.ManageSettings,
    OrgPermissionSubjects.SecretShare
  );
  const canEditSettings = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);
  const tabs = [
    { value: SecretSharingTab.ShareSecret, label: "Shared secrets" },
    { value: SecretSharingTab.RequestSecret, label: "Secret requests" },
    ...(current.isSubOrganization ? [] : [{ value: SecretSharingTab.Settings, label: "Settings" }])
  ];
  const active =
    tabs.find((tab) => tab.value === selectedTab)?.value ?? SecretSharingTab.ShareSecret;
  let body = <SharedSecretsTable subOrganization={subOrganization} />;
  let action = (
    <Button variant="accent" icon="link" onClick={() => setSharing(true)}>
      Share secret
    </Button>
  );
  if (active === SecretSharingTab.RequestSecret) {
    body = <SecretRequestsTable subOrganization={subOrganization} />;
    action = (
      <Button variant="accent" icon="inbox" onClick={() => setRequesting(true)}>
        Request secret
      </Button>
    );
  }
  if (active === SecretSharingTab.Settings) {
    body = <AccessRestricted requirement="manage settings on Secret Share" />;
    if (canManageSettings)
      body = organization ? (
        <SecretSharingSettings organization={organization} canEdit={canEditSettings} />
      ) : (
        <Loader size="page" label="Loading settings" />
      );
  }
  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Secret sharing"
          badges={
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-sharing" />
          }
          actions={active === SecretSharingTab.Settings ? undefined : action}
          tabs={
            <Tabs
              label="Secret sharing sections"
              value={active}
              onChange={(value) =>
                navigate({ search: (prev) => ({ ...prev, selectedTab: value }) })
              }
              tabs={tabs}
            />
          }
        />
        {body}
      </Stack>
      <ShareSecretSheet
        open={sharing}
        onOpenChange={setSharing}
        organization={organization}
        subOrganization={subOrganization}
      />
      <RequestSecretDialog
        open={requesting}
        onOpenChange={setRequesting}
        subOrganization={subOrganization}
      />
    </TooltipProvider>
  );
};
