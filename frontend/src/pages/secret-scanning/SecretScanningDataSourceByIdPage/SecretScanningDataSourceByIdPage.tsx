import { useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  CopyIcon,
  DatabaseIcon,
  EllipsisIcon,
  ScanSearchIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  PageHeader,
  PageLoader,
  ProviderIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSecretScanningFindingActions
} from "@app/context/ProjectPermissionContext/types";
import {
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  SecretScanningDataSource,
  SecretScanningFindingOrderBy,
  SecretScanningFindingStatus,
  useGetSecretScanningDataSource,
  useListSecretScanningFindings,
  useTriggerSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import { DataSourceStatusBadge } from "../components/DataSourceStatusBadge";
import { SecretScanningFindingsTable } from "../components/findings";
import {
  SecretScanningDataSourceSettings,
  SecretScanningResourcesTable,
  SecretScanningScanTable
} from "./components";
import { DataSourceTab } from "./data-source-tabs";

const PageContent = () => {
  const navigate = useNavigate();
  const { permission } = useProjectPermission();
  const { type, dataSourceId, orgId } = useParams({
    from: ROUTE_PATHS.SecretScanning.DataSourceByIdPage.id,
    select: (params) => ({
      ...params,
      type: params.type as SecretScanningDataSource
    })
  });
  const { selectedTab = DataSourceTab.Findings } = useSearch({
    from: ROUTE_PATHS.SecretScanning.DataSourceByIdPage.id
  });

  const [findingsResourceId, setFindingsResourceId] = useState<string | null>(null);

  const canReadFindings = permission.can(
    ProjectPermissionSecretScanningFindingActions.Read,
    ProjectPermissionSub.SecretScanningFindings
  );

  const { data: dataSource, isPending } = useGetSecretScanningDataSource({ type, dataSourceId });

  const { data: unresolvedFindings } = useListSecretScanningFindings(
    {
      projectId: dataSource?.projectId ?? "",
      dataSourceId,
      status: SecretScanningFindingStatus.Unresolved,
      orderBy: SecretScanningFindingOrderBy.CreatedAt,
      orderDirection: OrderByDirection.DESC,
      offset: 0,
      limit: 1
    },
    { enabled: Boolean(dataSource) && canReadFindings, refetchInterval: 30000 }
  );

  const triggerDataSourceScan = useTriggerSecretScanningDataSource();

  const details = SECRET_SCANNING_DATA_SOURCE_MAP[type];

  if (isPending) return <PageLoader />;

  if (!dataSource) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <Empty className="max-w-2xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DatabaseIcon />
            </EmptyMedia>
            <EmptyTitle>Data source not found</EmptyTitle>
            <EmptyDescription>
              Could not find a {details.name ?? "Secret Scanning"} data source with ID{" "}
              {dataSourceId}.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  const unresolvedCount = unresolvedFindings?.totalCount ?? 0;

  const handleTabChange = (tab: DataSourceTab) =>
    navigate({
      to: ROUTE_PATHS.SecretScanning.DataSourceByIdPage.path,
      params: { orgId, type, dataSourceId },
      search: { selectedTab: tab }
    });

  const handleViewResourceFindings = (resourceId: string) => {
    setFindingsResourceId(resourceId);
    handleTabChange(DataSourceTab.Findings);
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(dataSource.id);
    createNotification({ text: "Data source ID copied to clipboard", type: "info" });
  };

  const handleTriggerScan = async () => {
    await triggerDataSourceScan.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      projectId: dataSource.projectId
    });

    createNotification({
      text: `Scan triggered for "${dataSource.name}"`,
      type: "success"
    });
  };

  return (
    <div className="h-full bg-page">
      <div className="mx-auto flex flex-col justify-between bg-page text-foreground-inverse">
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <PageHeader
            scope={ProjectType.SecretScanning}
            backLink={
              <Link to="/organizations/$orgId/secret-scanning/data-sources" params={{ orgId }}>
                <ChevronLeftIcon size={16} />
                Data Sources
              </Link>
            }
            title={
              <span className="inline-flex max-w-full items-center gap-x-3">
                <span className="truncate" title={dataSource.name}>
                  {dataSource.name}
                </span>
                <Badge variant="neutral">
                  <ProviderIcon
                    alt={`${details.name} data source`}
                    icon={details.image}
                    className="size-3"
                  />
                  {details.name}
                </Badge>
                <DataSourceStatusBadge dataSource={dataSource} />
              </span>
            }
            description={
              dataSource.connection
                ? `Connected via App Connection ${dataSource.connection.name}`
                : `${details.name} Data Source`
            }
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Options
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleCopyId}>
                  <CopyIcon />
                  Copy Data Source ID
                </DropdownMenuItem>
                <ProjectPermissionCan
                  I={ProjectPermissionSecretScanningDataSourceActions.TriggerScans}
                  a={ProjectPermissionSub.SecretScanningDataSources}
                >
                  {(isAllowed: boolean) => (
                    <DropdownMenuItem
                      isDisabled={
                        !isAllowed || dataSource.isDisconnected || triggerDataSourceScan.isPending
                      }
                      onClick={handleTriggerScan}
                    >
                      <ScanSearchIcon />
                      Scan All {resourceDetails.pluralTitle}
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </PageHeader>
          <Tabs
            value={selectedTab}
            onValueChange={(tab) => {
              setFindingsResourceId(null);
              handleTabChange(tab as DataSourceTab);
            }}
          >
            <TabsList variant="ss" aria-label="Data source sections">
              <TabsTrigger value={DataSourceTab.Findings}>
                Findings
                {unresolvedCount > 0 && <Badge variant="danger">{unresolvedCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value={DataSourceTab.Resources}>
                {resourceDetails.pluralTitle}
              </TabsTrigger>
              <TabsTrigger value={DataSourceTab.ScanHistory}>Scan History</TabsTrigger>
              <TabsTrigger value={DataSourceTab.Settings}>Settings</TabsTrigger>
            </TabsList>
            <TabsContent value={DataSourceTab.Findings}>
              <ProjectPermissionCan
                renderGuardBanner
                passThrough={false}
                I={ProjectPermissionSecretScanningFindingActions.Read}
                a={ProjectPermissionSub.SecretScanningFindings}
              >
                <SecretScanningFindingsTable
                  key={`${dataSource.id}-${findingsResourceId ?? "all"}`}
                  dataSource={dataSource}
                  initialResourceId={findingsResourceId ?? undefined}
                  description="Secrets detected in this data source."
                />
              </ProjectPermissionCan>
            </TabsContent>
            <TabsContent value={DataSourceTab.Resources}>
              <SecretScanningResourcesTable
                dataSource={dataSource}
                onViewFindings={handleViewResourceFindings}
              />
            </TabsContent>
            <TabsContent value={DataSourceTab.ScanHistory}>
              <SecretScanningScanTable dataSource={dataSource} />
            </TabsContent>
            <TabsContent value={DataSourceTab.Settings}>
              <SecretScanningDataSourceSettings
                dataSource={dataSource}
                onDeleted={() =>
                  navigate({
                    to: "/organizations/$orgId/secret-scanning/data-sources",
                    params: { orgId }
                  })
                }
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export const SecretScanningDataSourceByIdPage = () => {
  return (
    <>
      <PageTitle title="Secret Scanning Data Source" />
      <link rel="icon" href="/infisical.ico" />
      <ProjectPermissionCan
        renderGuardBanner
        passThrough={false}
        I={ProjectPermissionSecretScanningDataSourceActions.Read}
        a={ProjectPermissionSub.SecretScanningDataSources}
      >
        <PageContent />
      </ProjectPermissionCan>
    </>
  );
};
