import { Button } from "@infisical/cipher/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningDataSource,
  SecretScanningFindingOrderBy,
  SecretScanningFindingStatus
} from "@app/hooks/api/secretScanningV2/enums";
import type { TSecretScanningDataSource } from "@app/hooks/api/secretScanningV2/types";

import { useProjectPermission } from "../../access/permissions";
import { failed, toast } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { DataSourceStatus } from "../components/data-source-status";
import { FindingsTable } from "../components/findings";
import { ResourcesTab } from "./resources";
import { ScanHistoryTab } from "./scans";
import { SettingsTab } from "./settings";

const route = v4Path("/organizations/$orgId/secret-scanning/data-sources/$type/$dataSourceId");

type Tab = "findings" | "resources" | "scan-history" | "settings";

const DataSource = ({ dataSource }: { dataSource: TSecretScanningDataSource }) => {
  const navigate = useNavigate({ from: route });
  const go = useGo();
  const { orgId } = useParams({ from: route });
  const search = useSearch({ from: route });
  const tab: Tab = search.selectedTab ?? "findings";
  const scanning = useV4Adapter("secretScanning");
  const { permission } = useProjectPermission(dataSource.projectId);
  const canReadFindings = permission.can(
    ProjectPermissionSecretScanningFindingActions.Read,
    ProjectPermissionSub.SecretScanningFindings
  );
  const canScan = permission.can(
    ProjectPermissionSecretScanningDataSourceActions.TriggerScans,
    ProjectPermissionSub.SecretScanningDataSources
  );
  const { data: unresolved } = scanning.useFindings(
    {
      projectId: dataSource.projectId,
      dataSourceId: dataSource.id,
      status: SecretScanningFindingStatus.Unresolved,
      orderBy: SecretScanningFindingOrderBy.CreatedAt,
      orderDirection: OrderByDirection.DESC,
      offset: 0,
      limit: 1
    },
    { enabled: canReadFindings, refetchInterval: 30000 }
  );
  const triggerScan = scanning.useTriggerScan();
  const platform = SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type];
  const resource = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  const unresolvedCount = unresolved?.totalCount ?? 0;

  let scanReason: string | undefined;
  if (!canScan) scanReason = RESTRICTED;
  else if (dataSource.isDisconnected) scanReason = "This data source is disconnected";

  const panel = () => {
    if (tab === "resources") return <ResourcesTab dataSource={dataSource} />;
    if (tab === "scan-history") return <ScanHistoryTab dataSource={dataSource} />;
    if (tab === "settings")
      return (
        <SettingsTab
          dataSource={dataSource}
          onDeleted={() => go(orgHref(orgId, "/secret-scanning/data-sources"))}
        />
      );
    if (!canReadFindings) return <AccessRestricted requirement="Read findings" />;
    return (
      <FindingsTable
        projectId={dataSource.projectId}
        scope={dataSource}
        filters={{
          status: search.status ?? SecretScanningFindingStatus.Unresolved,
          resourceId: search.resourceId
        }}
        onFiltersChange={(change) =>
          navigate({ search: (prev) => ({ ...prev, ...change }), replace: true })
        }
      />
    );
  };

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          breadcrumb={[
            { label: "Data sources", href: orgHref(orgId, "/secret-scanning/data-sources") }
          ]}
          title={dataSource.name}
          badges={<DataSourceStatus dataSource={dataSource} />}
          description={
            dataSource.connection
              ? `Connected via the ${dataSource.connection.name} app connection`
              : `${platform.name} data source`
          }
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button layout="trigger" variant="outline" icon="more">
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard.writeText(dataSource.id);
                    toast({ tone: "ok", title: "Data source ID copied to clipboard" });
                  }}
                >
                  <Icon name="copy" />
                  Copy data source ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabledReason={scanReason}
                  onSelect={async () => {
                    try {
                      await triggerScan.mutateAsync({
                        dataSourceId: dataSource.id,
                        type: dataSource.type,
                        projectId: dataSource.projectId
                      });
                    } catch (error) {
                      failed("Failed to trigger scan", error);
                      return;
                    }
                    toast({ tone: "ok", title: `Scan triggered for ${dataSource.name}` });
                  }}
                >
                  <Icon name="sync" />
                  Scan all {resource.pluralNoun}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
          tabs={
            <Tabs
              label="Data source sections"
              value={tab}
              onChange={(next) =>
                navigate({
                  search: { selectedTab: next === "findings" ? undefined : (next as Tab) }
                })
              }
              tabs={[
                {
                  value: "findings",
                  label: "Findings",
                  count: unresolvedCount > 0 ? unresolvedCount : undefined,
                  content: null
                },
                { value: "resources", label: resource.pluralTitle, content: null },
                { value: "scan-history", label: "Scan history", content: null },
                { value: "settings", label: "Settings", content: null }
              ]}
            />
          }
        />
        {panel()}
      </Stack>
    </TooltipProvider>
  );
};

const Guarded = ({ dataSource }: { dataSource: TSecretScanningDataSource }) => {
  const { permission, isPending } = useProjectPermission(dataSource.projectId);
  if (isPending) return <Loader size="page" label="Loading data source" />;
  if (
    !permission.can(
      ProjectPermissionSecretScanningDataSourceActions.Read,
      ProjectPermissionSub.SecretScanningDataSources
    )
  )
    return <AccessRestricted requirement="Read data sources" />;
  return <DataSource dataSource={dataSource} />;
};

export const SecretScanningDataSourceByIdPage = () => {
  const { type, dataSourceId } = useParams({ from: route });
  const { data: dataSource, isPending } = useV4Adapter("secretScanning").useDataSource({
    type: type as SecretScanningDataSource,
    dataSourceId
  });
  if (isPending) return <Loader size="page" label="Loading data source" />;
  if (!dataSource)
    return (
      <EmptyState
        icon="git"
        title="Data source not found"
        description={`No ${SECRET_SCANNING_DATA_SOURCE_MAP[type as SecretScanningDataSource]?.name ?? "Secret Scanning"} data source has the ID ${dataSourceId}.`}
      />
    );
  return <Guarded dataSource={dataSource} />;
};
