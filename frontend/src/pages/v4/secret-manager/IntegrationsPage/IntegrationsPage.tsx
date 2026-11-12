import { useEffect, useRef } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { Icon } from "@app/components/v4/ui/icon";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Tabs } from "@app/components/v4/ui/tabs";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";
import { NATIVE_INTEGRATION_DEPRECATION_DATE } from "@app/const/nativeIntegrationDeprecation";

import { useProjectScope } from "../../access/project/scope";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { AppConnectionsTab } from "./app-connections";
import { DocsIntegrationsTab } from "./docs-integrations";
import { NativeIntegrationsTab } from "./native-integrations";
import { NATIVE_INTEGRATIONS_TAB, SECRET_SYNCS_TAB } from "./native-model";
import { SecretSyncsTab } from "./secret-syncs/secret-syncs-tab";

const route = v4Path("/organizations/$orgId/projects/secret-management/$projectId/integrations/");
const path = v4Path("/organizations/$orgId/projects/secret-management/$projectId/integrations");

const APP_CONNECTIONS_TAB = "app-connections";

export const IntegrationsPage = () => {
  const { orgId, projectId } = useProjectScope();
  const { selectedTab } = useSearch({ from: route });
  const navigate = useNavigate();
  const { data: project } = useV4Adapter("projectSettings").useProject(projectId);
  const native = useV4Adapter("projectIntegrations").useNativeIntegrations(projectId);
  const syncs = useV4Adapter("secrets").useSecretSyncs(projectId);
  const entryChecked = useRef(false);

  const select = (tab: string, replace = false) =>
    navigate({
      to: path,
      params: { orgId, projectId },
      search: { selectedTab: tab },
      replace
    });

  const integrationCount = native.data?.length ?? 0;
  const entryReady = !native.isPending && (selectedTab !== undefined || !syncs.isPending);

  useEffect(() => {
    if (entryChecked.current || !entryReady) return;
    entryChecked.current = true;
    if (!selectedTab) {
      if (syncs.data?.length) select(SECRET_SYNCS_TAB, true);
      else select(integrationCount ? NATIVE_INTEGRATIONS_TAB : APP_CONNECTIONS_TAB, true);
      return;
    }
    if (selectedTab === NATIVE_INTEGRATIONS_TAB && !integrationCount)
      select(APP_CONNECTIONS_TAB, true);
  }, [entryReady]);

  if (!entryChecked.current && !entryReady)
    return <Loader size="page" label="Loading integrations" />;

  const showNative = integrationCount > 0 || selectedTab === NATIVE_INTEGRATIONS_TAB;
  const tabs = [
    { value: APP_CONNECTIONS_TAB, label: "App connections" },
    { value: SECRET_SYNCS_TAB, label: "Secret syncs" },
    { value: "framework-integrations", label: "Framework integrations" },
    { value: "infrastructure-integrations", label: "Infrastructure integrations" },
    ...(showNative
      ? [
          {
            value: NATIVE_INTEGRATIONS_TAB,
            label: (
              <Tooltip
                content={`Retiring on ${NATIVE_INTEGRATION_DEPRECATION_DATE}. Migrate to secret syncs.`}
              >
                <Inline gap={4} align="center" wrap={false}>
                  Native integrations
                  <Icon name="alert" size={14} aria-label="Retiring" />
                </Inline>
              </Tooltip>
            )
          }
        ]
      : [])
  ];
  const activeTab = tabs.some((tab) => tab.value === selectedTab)
    ? selectedTab
    : APP_CONNECTIONS_TAB;

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Integrations"
          tabs={
            <Tabs
              label="Integration sections"
              value={activeTab}
              onValueChange={(next) => select(next)}
              tabs={tabs.map((tab) => ({ ...tab, content: null }))}
            />
          }
        />
        {activeTab === NATIVE_INTEGRATIONS_TAB && (
          <NativeIntegrationsTab
            orgId={orgId}
            projectId={projectId}
            environments={project?.environments ?? []}
          />
        )}
        {activeTab === APP_CONNECTIONS_TAB && (
          <AppConnectionsTab orgId={orgId} projectId={projectId} />
        )}
        {activeTab === "framework-integrations" && <DocsIntegrationsTab kind="frameworks" />}
        {activeTab === "infrastructure-integrations" && (
          <DocsIntegrationsTab kind="infrastructure" />
        )}
        {activeTab === SECRET_SYNCS_TAB && (
          <SecretSyncsTab
            orgId={orgId}
            projectId={projectId}
            environments={project?.environments ?? []}
          />
        )}
      </Stack>
    </TooltipProvider>
  );
};
