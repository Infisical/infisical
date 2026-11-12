import { type ReactNode, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { DetailLayout, Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList, type DataListItem } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Meta, StatusText } from "@infisical/cipher/ui/text";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";

import {
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { eventToNameMap, userAgentTypeToNameMap } from "@app/hooks/api/auditLogs/constants";
import { ActorType, EventType } from "@app/hooks/api/auditLogs/enums";
import type { Actor, AuditLog } from "@app/hooks/api/auditLogs/types";
import { SecretSync, SecretSyncStatus } from "@app/hooks/api/secretSyncs/enums";
import type { TSecretSync } from "@app/hooks/api/secretSyncs/types";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { CopyButton, Dash } from "../../access/org/detail-parts";
import { useProjectPermission } from "../../access/permissions";
import { useProjectScope } from "../../access/project/scope";
import { formatDateTime } from "../../access/roles";
import { AccessRestricted } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref, useGo, v4Path } from "../../links";
import { type EditSection, EditSyncSheet } from "../IntegrationsPage/secret-syncs/edit-sync-sheet";
import {
  destinationNameOf,
  INITIAL_SYNC_LABEL,
  messageOf,
  plainValueOf,
  sourcePathOf,
  syncsHref
} from "../IntegrationsPage/secret-syncs/model";
import {
  AutoSyncOff,
  SyncDialog,
  type SyncDialogKind,
  SyncJobs,
  SyncMenuItems,
  SyncStatus,
  useSyncActions
} from "../IntegrationsPage/secret-syncs/parts";
import { SYNC_VIEWS } from "../OverviewPage/secrets/secret-sync/sync-views";

const route = v4Path(
  "/organizations/$orgId/projects/secret-management/$projectId/integrations/secret-syncs/$destination/$syncId"
);

const enabledText = (value: unknown) => (value ? "Enabled" : "Disabled");

const present = (value: ReactNode) => value !== undefined && value !== null && value !== "";

const reviewItems = (items: (readonly [string, ReactNode])[]): DataListItem[] =>
  items.filter(([, value]) => present(value)).map(([label, value]) => [label, value]);

const LOG_PAGE_SIZE = 50;
const MAX_LOG_DAYS = 60;
const SYNC_EVENTS = [
  EventType.SECRET_SYNC_SYNC_SECRETS,
  EventType.SECRET_SYNC_REMOVE_SECRETS,
  EventType.SECRET_SYNC_IMPORT_SECRETS
];

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

const LogsCard = ({ sync }: { sync: TSecretSync }) => {
  const { organization } = useV4Session();
  const { data: plan } = useV4Adapter("auditLogs").usePlan(organization.id);
  const days = Math.min(plan?.auditLogsRetentionDays ?? (plan ? Infinity : 30), MAX_LOG_DAYS);
  const [range] = useState(() => {
    const endDate = new Date();
    return { endDate, startDate: new Date(endDate.getTime() - days * 24 * 3600 * 1000) };
  });
  const logs = useV4Adapter("org").useAuditLogs(
    {
      ...range,
      limit: LOG_PAGE_SIZE,
      eventType: SYNC_EVENTS,
      eventMetadata: { syncId: sync.id },
      projectId: sync.projectId
    },
    sync.projectId
  );
  if (plan && !plan.auditLogs)
    return (
      <Card variant="framed" title="Sync logs">
        <EmptyState
          size="sm"
          icon="lock"
          title="Upgrade your plan to view sync logs"
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
    <Card variant="framed" title="Sync logs" description={`Events from the last ${days} days`}>
      <DataTable
        label="Sync logs"
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
              title="Couldn't load sync logs"
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

const SyncDetails = ({
  sync,
  orgId,
  projectId,
  environments
}: {
  sync: TSecretSync;
  orgId: string;
  projectId: string;
  environments: readonly { id: string; name: string; slug: string }[];
}) => {
  const go = useGo();
  const actions = useSyncActions(projectId);
  const [dialog, setDialog] = useState<SyncDialogKind>();
  const [editing, setEditing] = useState<EditSection>();
  const name = destinationNameOf(sync.destination);
  const listHref = syncsHref(orgId, projectId);
  const editBlock = actions.blockFor(sync, ProjectPermissionSecretSyncActions.Edit);
  const syncBlock = actions.blockFor(sync, ProjectPermissionSecretSyncActions.SyncSecrets);
  const view = SYNC_VIEWS[sync.destination];
  const reviewForm = useForm({
    values: { connection: sync.connection, destinationConfig: sync.destinationConfig }
  });
  const failure = messageOf(sync.syncStatus, sync.lastSyncMessage);
  const note = sync.syncStatus === SecretSyncStatus.Succeeded ? sync.lastSyncMessage : null;
  const options = sync.syncOptions as Record<string, unknown>;
  const sourceDeleted = !sync.folder || !sync.environment;

  const editButton = (section: EditSection, reason = editBlock) => (
    <Button variant="ghost" size="sm" disabledReason={reason} onClick={() => setEditing(section)}>
      Edit
    </Button>
  );

  const details: DataListItem[] = [
    ["Name", sync.name],
    ["Description", sync.description || <Dash key="description" />],
    [
      "ID",
      <Inline key="id" gap={4} align="center" wrap={false}>
        <MiddleTruncate mono keepEnd={6} text={sync.id} />
        <CopyButton value={sync.id} label="Copy sync ID" />
      </Inline>
    ],
    ["Status", <SyncStatus key="status" sync={sync} />],
    ["Auto-sync", enabledText(sync.isAutoSyncEnabled)],
    [
      "Last synced",
      sync.lastSyncedAt ? formatDateTime(String(sync.lastSyncedAt)) : <Dash key="last" />
    ],
    ...(failure
      ? [
          [
            "Last sync error",
            <code key="error" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {failure}
            </code>
          ] as DataListItem
        ]
      : []),
    ...(note ? [["Last sync note", note] as DataListItem] : []),
    ["Created", formatDateTime(sync.createdAt)]
  ];

  const source: DataListItem[] = [
    ["Environment", sync.environment?.name ?? <Dash key="environment" />],
    ["Path", sync.folder ? <code key="path">{sourcePathOf(sync)}</code> : <Dash key="path" />],
    ...(sync.destination === SecretSync.AzureEntraIdScim
      ? [["Secret ID", plainValueOf(options.secretId) ?? <Dash key="secret" />] as DataListItem]
      : [["Include all subfolders", enabledText(sync.includeAllSubFolders)] as DataListItem])
  ];

  const destination: DataListItem[] = [
    [
      "Platform",
      <Inline key="platform" gap={8} align="center" wrap={false}>
        <ProviderIcon icon={SECRET_SYNC_MAP[sync.destination].image} alt="" size="sm" />
        {name}
      </Inline>
    ],
    ["Connection", sync.connection.name],
    ...reviewItems(view.destinationReview(sync.destinationConfig as Record<string, unknown>))
  ];

  const initialBehavior = sync.syncOptions.initialSyncBehavior;
  const syncOptions: DataListItem[] = [
    [
      "Initial sync behavior",
      initialBehavior ? INITIAL_SYNC_LABEL[initialBehavior](name) : <Dash key="initial" />
    ],
    [
      "Key schema",
      sync.syncOptions.keySchema ? (
        <code key="schema">{sync.syncOptions.keySchema}</code>
      ) : (
        <Dash key="schema" />
      )
    ],
    ...reviewItems(view.optionsReview?.(options) ?? []),
    ["Secret deletion protection", enabledText(sync.syncOptions.disableSecretDeletion)]
  ];

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          breadcrumb={[{ label: "Secret syncs", href: listHref }]}
          title={sync.name}
          badges={
            <Inline gap={12} align="center" wrap={false}>
              <SyncStatus sync={sync} />
              {!sync.isAutoSyncEnabled && <AutoSyncOff />}
              <SyncJobs sync={sync} />
            </Inline>
          }
          actions={
            <Inline gap={8} wrap={false}>
              <Button
                variant="outline"
                icon="sync"
                disabledReason={syncBlock}
                onClick={() => actions.triggerSync(sync)}
              >
                Trigger sync
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button layout="trigger" variant="outline" icon="more">
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <SyncMenuItems sync={sync} actions={actions} onOpen={setDialog} />
                </DropdownMenuContent>
              </DropdownMenu>
            </Inline>
          }
        />
        <DetailLayout
          asideLabel="Sync details"
          aside={
            <Stack gap={24}>
              <Card variant="framed" title="Details" action={editButton("details")}>
                <DataList variant="props" density="compact" items={details} />
              </Card>
              <Card
                variant="framed"
                title="Source"
                action={
                  <Inline gap={8} align="center" wrap={false}>
                    {sourceDeleted && (
                      <StatusText tone="bad" icon="alert">
                        Folder deleted
                      </StatusText>
                    )}
                    {editButton("source")}
                  </Inline>
                }
              >
                <DataList variant="props" density="compact" items={source} />
              </Card>
            </Stack>
          }
        >
          <Card variant="framed" title="Destination" action={editButton("destination")}>
            <FormProvider {...reviewForm}>
              <DataList variant="props" density="compact" items={destination} />
            </FormProvider>
          </Card>
          <Card variant="framed" title="Sync options" action={editButton("options")}>
            <DataList variant="props" density="compact" items={syncOptions} />
          </Card>
          <LogsCard sync={sync} />
        </DetailLayout>
      </Stack>
      <SyncDialog
        dialog={dialog ? { kind: dialog, sync } : undefined}
        projectId={projectId}
        actions={actions}
        onClose={() => setDialog(undefined)}
        onDeleted={() => go(listHref)}
      />
      {editing && (
        <EditSyncSheet
          sync={sync}
          section={editing}
          environments={environments}
          onClose={() => setEditing(undefined)}
        />
      )}
    </TooltipProvider>
  );
};

export const SecretSyncDetailsByIDPage = () => {
  const { destination, syncId } = useParams({ from: route });
  const { orgId, projectId } = useProjectScope();
  const go = useGo();
  const { permission, isPending: permissionPending } = useProjectPermission(projectId);
  const { data: project } = useV4Adapter("projectSettings").useProject(projectId);
  const {
    data: sync,
    isPending,
    error
  } = useV4Adapter("secrets").useSecretSync(destination as SecretSync, syncId);

  if (permissionPending || (isPending && !error))
    return <Loader size="page" label="Loading secret sync" />;
  if (!permission.can(ProjectPermissionSecretSyncActions.Read, ProjectPermissionSub.SecretSyncs))
    return <AccessRestricted requirement="read secret syncs" />;
  if (!sync)
    return (
      <EmptyState
        icon="alert-c"
        title="Couldn't load this secret sync"
        description="It may have been deleted."
        actions={
          <Button variant="outline" onClick={() => go(syncsHref(orgId, projectId))}>
            Back to secret syncs
          </Button>
        }
      />
    );
  return (
    <SyncDetails
      sync={sync}
      orgId={orgId}
      projectId={projectId}
      environments={project?.environments ?? []}
    />
  );
};
