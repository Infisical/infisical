import { type ReactNode, useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { DetailLayout, Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList, type DataListItem } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Meta } from "@infisical/cipher/ui/text";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";

import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { eventToNameMap, userAgentTypeToNameMap } from "@app/hooks/api/auditLogs/constants";
import { ActorType, EventType } from "@app/hooks/api/auditLogs/enums";
import type { Actor, AuditLog } from "@app/hooks/api/auditLogs/types";
import type { TOctopusDeployVariableSetScopeValues } from "@app/hooks/api/integrationAuth/types";
import { OctopusDeployScope } from "@app/hooks/api/integrationAuth/types";
import type { TIntegrationWithEnv } from "@app/hooks/api/integrations/types";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { CopyButton, Dash } from "../../access/org/detail-parts";
import { useProjectPermission } from "../../access/permissions";
import { useProjectScope } from "../../access/project/scope";
import { formatDateTime } from "../../access/roles";
import { toast } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref, useGo, v4Path } from "../../links";
import {
  destinationFacts,
  failureMessageOf,
  integrationName,
  integrationsHref,
  NATIVE_INTEGRATIONS_TAB
} from "../IntegrationsPage/native-model";
import {
  DeleteNativeIntegrationDialog,
  SyncStatus,
  useSyncNow
} from "../IntegrationsPage/native-parts";

const route = v4Path(
  "/organizations/$orgId/projects/secret-management/$projectId/integrations/$integrationId"
);

type Metadata = NonNullable<TIntegrationWithEnv["metadata"]>;

const METADATA_LABELS: Record<keyof Metadata, string> = {
  githubVisibility: "GitHub visibility",
  githubVisibilityRepoIds: "GitHub visibility repo IDs",
  shouldAutoRedeploy: "Auto redeploy target application when secrets change",
  secretAWSTag: "Tags for secrets stored in AWS",
  azureLabel: "Azure label",
  kmsKeyId: "AWS KMS key ID",
  secretSuffix: "Secret suffix",
  secretPrefix: "Secret prefix",
  syncBehavior: "Secrets sync behavior",
  initialSyncBehavior: "Initial sync behavior",
  mappingBehavior: "Secrets mapping behavior",
  scope: "Scope",
  org: "Organization",
  project: "Project",
  environment: "Environment",
  shouldDisableDelete: "AWS secret deletion disabled",
  shouldMaskSecrets: "GitLab secrets masking enabled",
  shouldProtectSecrets: "GitLab secret protection enabled",
  shouldEnableDelete: "GitHub secret deletion enabled",
  octopusDeployScopeValues: "Octopus Deploy scope values",
  awsIamRole: "AWS IAM role",
  region: "Region",
  metadataSyncMode: "Metadata sync mode"
};

const OCTOPUS_SCOPE_LABELS: Record<string, string> = {
  Role: "Target tags",
  Machine: "Targets",
  ProcessOwner: "Processes",
  Action: "Steps"
};

const octopusKey = (key: keyof TOctopusDeployVariableSetScopeValues) =>
  key === "Processes" ? "ProcessOwner" : key.substring(0, key.length - 1);

const OctopusScopeValues = ({ integration }: { integration: TIntegrationWithEnv }) => {
  const configured = integration.metadata?.octopusDeployScopeValues ?? {};
  const { data = {}, isPending } = useV4Adapter("projectIntegrations").useOctopusDeployScopeValues(
    {
      scope: OctopusDeployScope.Project,
      spaceId: integration.targetEnvironmentId!,
      resourceId: integration.appId!,
      integrationAuthId: integration.integrationAuthId
    },
    { enabled: Object.values(configured).some((values) => values.length > 0) }
  );
  if (isPending) return <Loader label="Loading scope values" />;
  const names = new Map(
    Object.entries(data).map(([key, values]) => [
      octopusKey(key as keyof TOctopusDeployVariableSetScopeValues),
      new Map((values as { Id: string; Name: string }[]).map((value) => [value.Id, value.Name]))
    ])
  );
  const items: DataListItem[] = Object.entries(configured)
    .filter(([, values]) => values.length > 0)
    .map(([key, values]) => [
      OCTOPUS_SCOPE_LABELS[key] ?? `${key}s`,
      values.map((value) => names.get(key)?.get(value) ?? value).join(", ")
    ]);
  if (!items.length) return <Meta mono={false}>Not configured</Meta>;
  return <DataList variant="props" density="compact" items={items} />;
};

const metadataValue = (
  integration: TIntegrationWithEnv,
  key: keyof Metadata,
  value: Metadata[keyof Metadata]
): ReactNode => {
  if (key === "octopusDeployScopeValues") return <OctopusScopeValues integration={integration} />;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "secretAWSTag")
    return (
      <Inline gap={4} wrap>
        {(value as Metadata["secretAWSTag"])!.map((tag) => (
          <Badge key={tag.key} tone="outline" mono>
            {tag.key}={tag.value}
          </Badge>
        ))}
      </Inline>
    );
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value || "N/A";
  if (typeof value === "number") return value;
  return null;
};

const SettingsCard = ({ integration }: { integration: TIntegrationWithEnv }) => {
  const items = Object.entries(integration.metadata ?? {})
    .filter(([, value]) => Boolean(value))
    .map(([key, value]): DataListItem => [
      METADATA_LABELS[key as keyof Metadata] ?? key,
      metadataValue(integration, key as keyof Metadata, value as Metadata[keyof Metadata])
    ]);
  if (!items.length) return null;
  return (
    <Card variant="framed" title="Integration settings">
      <DataList variant="props" density="compact" items={items} />
    </Card>
  );
};

const LOG_PAGE_SIZE = 50;
const MAX_LOG_DAYS = 60;

const actorName = (actor: Actor) => {
  if (actor.type === ActorType.USER) return actor.metadata.email;
  if (actor.type === ActorType.IDENTITY || actor.type === ActorType.SERVICE)
    return actor.metadata.name;
  return actor.type === ActorType.PLATFORM ? "Platform" : actor.type;
};

const logColumns: DataTableColumn<AuditLog>[] = [
  {
    id: "time",
    header: "Time",
    width: 200,
    render: (log) => <Meta>{formatDateTime(log.createdAt)}</Meta>
  },
  {
    id: "event",
    header: "Event",
    primary: true,
    grow: true,
    text: (log) => eventToNameMap[log.event.type] ?? log.event.type,
    render: (log) => eventToNameMap[log.event.type] ?? log.event.type
  },
  {
    id: "actor",
    header: "Actor",
    width: 220,
    text: (log) => actorName(log.actor),
    render: (log) => <MiddleTruncate text={actorName(log.actor)} />
  },
  {
    id: "source",
    header: "Source",
    width: 160,
    render: (log) => userAgentTypeToNameMap[log.userAgentType] ?? log.userAgentType
  }
];

const LogsCard = ({
  integration,
  projectId
}: {
  integration: TIntegrationWithEnv;
  projectId: string;
}) => {
  const { organization } = useV4Session();
  const { data: plan } = useV4Adapter("auditLogs").usePlan(organization.id);
  const days = Math.min(plan?.auditLogsRetentionDays ?? (plan ? Infinity : 30), MAX_LOG_DAYS);
  const [range] = useState(() => {
    const endDate = new Date();
    return { endDate, startDate: new Date(endDate.getTime() - days * 24 * 3600 * 1000) };
  });
  const enabled = Boolean(plan?.auditLogs);
  const logs = useV4Adapter("org").useAuditLogs(
    {
      ...range,
      limit: LOG_PAGE_SIZE,
      eventType: [EventType.INTEGRATION_SYNCED],
      eventMetadata: { integrationId: integration.id },
      projectId
    },
    projectId
  );
  if (plan && !enabled)
    return (
      <Card variant="framed" title="Integration logs">
        <EmptyState
          size="sm"
          icon="lock"
          title="Upgrade your plan to view integration logs"
          actions={
            <Button variant="outline" asChild>
              <a href={orgHref(organization.id, "/billing")}>View plans</a>
            </Button>
          }
        />
      </Card>
    );
  const rows = logs.error ? [] : (logs.data?.pages ?? []).flat();
  const lastPage = logs.data?.pages.at(-1);
  return (
    <Card
      variant="framed"
      title="Integration logs"
      footer={`Last ${days} days`}
      footerPlacement="frame"
    >
      <DataTable
        label="Integration logs"
        rows={rows}
        columns={logColumns}
        loading={logs.isPending && !logs.error}
        loadingRows={3}
        getRowId={(log) => log.id}
        rowLabel={(log) => `${log.event.type} at ${formatDateTime(log.createdAt)}`}
        loadMore={
          logs.hasNextPage && lastPage?.length === LOG_PAGE_SIZE
            ? {
                label: `Load ${LOG_PAGE_SIZE} more`,
                loading: logs.isFetchingNextPage,
                onClick: () => logs.fetchNextPage()
              }
            : undefined
        }
        empty={
          logs.error ? (
            <EmptyState
              size="sm"
              media="bare"
              icon="alert-c"
              title="Couldn't load integration logs"
              actions={
                <Button variant="outline" onClick={() => logs.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : (
            <EmptyState size="sm" media="bare" icon="history" title="No sync events yet" />
          )
        }
      />
    </Card>
  );
};

const IntegrationDetails = ({
  integration,
  orgId,
  projectId
}: {
  integration: TIntegrationWithEnv;
  orgId: string;
  projectId: string;
}) => {
  const go = useGo();
  const adapter = useV4Adapter("projectIntegrations");
  const { data: options } = adapter.useNativeIntegrationOptions();
  const { permission } = useProjectPermission(projectId);
  const [deleting, setDeleting] = useState(false);
  const name = integrationName(integration.integration, options);
  const syncNow = useSyncNow(projectId, () => name);
  const option = options?.find((entry) => entry.slug === integration.integration);
  const canDelete = permission.can(
    ProjectPermissionActions.Delete,
    ProjectPermissionSub.Integrations
  );
  const listHref = integrationsHref(orgId, projectId, NATIVE_INTEGRATIONS_TAB);
  const failure = failureMessageOf(integration);

  const details: DataListItem[] = [
    [
      "ID",
      <Inline key="id" gap={4} align="center" wrap={false}>
        <MiddleTruncate mono keepEnd={6} text={integration.id} />
        <CopyButton value={integration.id} label="Copy integration ID" />
      </Inline>
    ],
    [
      "Platform",
      <Inline key="platform" gap={8} align="center" wrap={false}>
        {option && <ProviderIcon icon={option.image} alt="" size="sm" />}
        {name}
      </Inline>
    ],
    ["Status", <SyncStatus key="status" integration={integration} />],
    [
      "Latest successful sync",
      integration.lastUsed ? formatDateTime(integration.lastUsed) : <Dash key="last" />
    ],
    ...(failure
      ? [
          [
            "Latest sync error",
            <code key="error" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {failure}
            </code>
          ] as DataListItem
        ]
      : []),
    ["Created", formatDateTime(integration.createdAt)]
  ];

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          breadcrumb={[{ label: "Native integrations", href: listHref }]}
          title={`${name} integration`}
          badges={<SyncStatus integration={integration} />}
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button layout="trigger" variant="outline" icon="more">
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => syncNow(integration)}>
                  <Icon name="sync" />
                  Sync now
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard?.writeText(integration.id);
                    toast({ tone: "ok", title: "Integration ID copied to clipboard" });
                  }}
                >
                  <Icon name="copy" />
                  Copy integration ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canDelete}
                  description={canDelete ? undefined : RESTRICTED}
                  onSelect={() => setDeleting(true)}
                >
                  <Icon name="trash" />
                  Delete integration
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
        <DetailLayout
          asideLabel="Integration details"
          aside={
            <Stack gap={24}>
              <Card variant="framed" title="Details">
                <DataList variant="props" density="compact" items={details} />
              </Card>
              <Card variant="framed" title="Connection">
                <DataList
                  variant="props"
                  density="compact"
                  items={[
                    ["Source environment", integration.environment.name],
                    ["Source path", <code key="path">{integration.secretPath}</code>],
                    ["Destination platform", name],
                    ...destinationFacts(integration)
                  ]}
                />
              </Card>
            </Stack>
          }
        >
          <SettingsCard integration={integration} />
          <LogsCard integration={integration} projectId={projectId} />
        </DetailLayout>
      </Stack>
      {deleting && (
        <DeleteNativeIntegrationDialog
          integration={integration}
          name={name}
          projectId={projectId}
          onClose={() => setDeleting(false)}
          onDeleted={() => go(listHref)}
        />
      )}
    </TooltipProvider>
  );
};

export const IntegrationDetailsByIDPage = () => {
  const { integrationId } = useParams({ from: route });
  const { orgId, projectId } = useProjectScope();
  const go = useGo();
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const {
    data: integration,
    isPending,
    error
  } = useV4Adapter("projectIntegrations").useNativeIntegration(integrationId);

  if (permissionPending || (isPending && !error))
    return <Loader size="page" label="Loading integration" />;
  if (!permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations))
    return <AccessRestricted requirement="read integrations" />;
  if (!integration)
    return (
      <EmptyState
        icon="alert-c"
        title="Couldn't load this integration"
        description="It may have been deleted. Return to the list to pick another integration."
        actions={
          <Button
            variant="outline"
            onClick={() => go(integrationsHref(orgId, projectId, NATIVE_INTEGRATIONS_TAB))}
          >
            Back to native integrations
          </Button>
        }
      />
    );
  return <IntegrationDetails integration={integration} orgId={orgId} projectId={projectId} />;
};
