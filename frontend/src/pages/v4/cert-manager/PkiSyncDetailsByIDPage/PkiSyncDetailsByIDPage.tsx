import { useState } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { useParams, useSearch } from "@tanstack/react-router";
import { StethoscopeIcon } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { getPkiSyncFailureMessage } from "@app/helpers/pkiSyncs";
import { eventToNameMap, userAgentTypeToNameMap } from "@app/hooks/api/auditLogs/constants";
import { ActorType, EventType } from "@app/hooks/api/auditLogs/enums";
import type { Actor, AuditLog } from "@app/hooks/api/auditLogs/types";
import { PkiSyncStatus } from "@app/hooks/api/pkiSyncs/enums";
import type { TPkiSync } from "@app/hooks/api/pkiSyncs/types";

import { CopyButton, Dash } from "../../access/org/detail-parts";
import { formatDateTime } from "../../access/roles";
import { toast } from "../../access/toast";
import { RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";
import { orgHref, useGo, v4Path } from "../../links";
import { CertManagerNotSetUp, useCertManagerProjectId } from "../components/certificate";
import { EditPkiSyncSheet, type PkiSyncEditSection } from "../components/pki-syncs/edit-sync-sheet";
import { notifyUnhandledHostCommandError } from "../components/pki-syncs/options/host-command-errors";
import {
  PkiSyncScopeProvider,
  usePkiSyncOption,
  usePkiSyncPermissions
} from "../components/pki-syncs/shared";
import { hasFieldMappings } from "../components/pki-syncs/steps";
import {
  AutoSyncOff,
  copySyncId,
  PkiSyncDialog,
  type PkiSyncDialogKind,
  PkiSyncMenuItems,
  SyncJobs,
  SyncStatus,
  usePkiSyncActions
} from "../components/pki-syncs/sync-parts";
import { PkiSyncCertificatesCard } from "./certificates-card";
import { usePkiSyncDestinationItems } from "./destination-items";
import {
  PkiSyncCommandsCard,
  pkiSyncFieldMappingItems,
  pkiSyncOptionItems,
  SyncErrorMessage
} from "./options-items";

const route = v4Path("/organizations/$orgId/cert-manager/integrations/$syncId");

const LOG_PAGE_SIZE = 50;
const MAX_LOG_DAYS = 60;
const SYNC_EVENTS = [
  EventType.PKI_SYNC_SYNC_CERTIFICATES,
  EventType.PKI_SYNC_IMPORT_CERTIFICATES,
  EventType.PKI_SYNC_REMOVE_CERTIFICATES,
  EventType.PKI_SYNC_HEALTH_CHECK
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

const LogsCard = ({ sync }: { sync: TPkiSync }) => {
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
    <Card variant="framed" title="Sync logs" footer={`Last ${days} days`} footerPlacement="frame">
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
  backHref,
  backLabel
}: {
  sync: TPkiSync;
  backHref: string;
  backLabel: string;
}) => {
  const go = useGo();
  const actions = usePkiSyncActions();
  const permissions = usePkiSyncPermissions(sync);
  const { syncOption } = usePkiSyncOption(sync.destination);
  const runHealthCheck = useV4Adapter("pkiSyncs").useRunHealthCheck();
  const [dialog, setDialog] = useState<PkiSyncDialogKind>();
  const [editing, setEditing] = useState<PkiSyncEditSection>();
  const destinationItems = usePkiSyncDestinationItems(sync);
  const mappingItems = pkiSyncFieldMappingItems(sync);
  const failure = getPkiSyncFailureMessage(sync.syncStatus, sync.lastSyncMessage);
  const editReason = permissions.canEdit ? undefined : RESTRICTED;
  const hasHealthCheck = Boolean(
    syncOption?.canRunHealthCheckCommand &&
    (sync.syncOptions as { healthCheckCommand?: string }).healthCheckCommand
  );

  const editButton = (section: PkiSyncEditSection) => (
    <Button
      variant="ghost"
      size="sm"
      disabledReason={editReason}
      onClick={() => setEditing(section)}
    >
      Edit
    </Button>
  );

  const runCheck = async () => {
    let result;
    try {
      result = await runHealthCheck.mutateAsync({
        syncId: sync.id,
        destination: sync.destination,
        projectId: sync.projectId
      });
    } catch (error) {
      notifyUnhandledHostCommandError(error, "Couldn't run the health check");
      return;
    }
    const passed = result.status === PkiSyncStatus.Succeeded;
    toast({
      tone: passed ? "ok" : "bad",
      title: passed ? "Health check passed" : "Health check failed",
      description:
        result.output || result.failureDetail || result.message || "The host reported no output."
    });
  };

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
    ["Auto-sync", sync.isAutoSyncEnabled ? "Enabled" : "Disabled"],
    [
      "Last synced",
      sync.lastSyncedAt ? formatDateTime(String(sync.lastSyncedAt)) : <Dash key="last" />
    ],
    ...(failure
      ? [["Last sync error", <SyncErrorMessage key="error" message={failure} />] as DataListItem]
      : []),
    ["Created", formatDateTime(String(sync.createdAt))]
  ];

  return (
    <TooltipProvider>
      <PageTitle title={sync.name} />
      <Stack gap={24}>
        <PageHeader
          breadcrumb={[{ label: backLabel, href: backHref }]}
          title={sync.name}
          badges={
            <Inline gap={12} align="center" wrap={false}>
              <SyncStatus sync={sync} />
              {!sync.isAutoSyncEnabled && <AutoSyncOff />}
              <SyncJobs sync={sync} canImport={Boolean(syncOption?.canImportCertificates)} />
            </Inline>
          }
          actions={
            <Inline gap={8} wrap={false}>
              <Button
                variant="outline"
                icon="sync"
                disabledReason={permissions.canTriggerSync ? undefined : RESTRICTED}
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
                  {hasHealthCheck && (
                    <DropdownMenuItem
                      disabledReason={
                        (!permissions.canTriggerSync && RESTRICTED) ||
                        (runHealthCheck.isPending ? "A health check is running" : undefined)
                      }
                      onSelect={runCheck}
                    >
                      <Icon icon={StethoscopeIcon} />
                      Run health check
                    </DropdownMenuItem>
                  )}
                  <PkiSyncMenuItems
                    sync={sync}
                    permissions={permissions}
                    onOpen={setDialog}
                    onToggleAutoSync={() => actions.toggleAutoSync(sync)}
                    onCopyId={() => copySyncId(sync)}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </Inline>
          }
        />
        <DetailLayout
          asideLabel="Sync details"
          aside={
            <Card variant="framed" title="Details" action={editButton("details")}>
              <DataList variant="props" density="compact" items={details} />
            </Card>
          }
        >
          <Card variant="framed" title="Destination" action={editButton("destination")}>
            <DataList variant="props" density="compact" items={destinationItems} />
          </Card>
          {hasFieldMappings(sync.destination) && mappingItems.length > 0 && (
            <Card variant="framed" title="Field mappings" action={editButton("mappings")}>
              <DataList variant="props" density="compact" items={mappingItems} />
            </Card>
          )}
          <Card variant="framed" title="Sync options" action={editButton("options")}>
            <DataList variant="props" density="compact" items={pkiSyncOptionItems(sync)} />
          </Card>
          <PkiSyncCommandsCard pkiSync={sync} action={editButton("hostCommands")} />
          <PkiSyncCertificatesCard
            pkiSync={sync}
            onEditCertificates={() => setEditing("certificates")}
          />
          <LogsCard sync={sync} />
        </DetailLayout>
      </Stack>
      <PkiSyncDialog
        dialog={dialog ? { kind: dialog, sync } : undefined}
        onClose={() => setDialog(undefined)}
        onDeleted={() => go(backHref)}
      />
      {editing && (
        <EditPkiSyncSheet sync={sync} section={editing} onClose={() => setEditing(undefined)} />
      )}
    </TooltipProvider>
  );
};

const SyncLoader = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const { syncId } = useParams({ from: route });
  const { fromApplication } = useSearch({ from: route });
  const go = useGo();
  const { data: sync, isPending, error } = useV4Adapter("pkiSyncs").useSync({ syncId, projectId });
  const backHref = fromApplication
    ? orgHref(
        orgId,
        `/cert-manager/applications/${encodeURIComponent(fromApplication)}?selectedTab=syncs`
      )
    : orgHref(orgId, "/cert-manager/integrations");
  const backLabel = fromApplication ?? "Certificate syncs";

  if (isPending && !error) return <Loader size="page" label="Loading certificate sync" />;
  if (!sync)
    return (
      <EmptyState
        icon="alert-c"
        title="Couldn't load this certificate sync"
        description="It may have been deleted, or you may not have access to it."
        actions={
          <Button variant="outline" onClick={() => go(backHref)}>
            Back to {fromApplication ?? "certificate syncs"}
          </Button>
        }
      />
    );

  return (
    <PkiSyncScopeProvider
      value={{
        orgId,
        projectId,
        applicationId: sync.applicationId ?? undefined,
        returnTo: orgHref(orgId, `/cert-manager/integrations/${sync.id}`)
      }}
    >
      <SyncDetails sync={sync} backHref={backHref} backLabel={backLabel} />
    </PkiSyncScopeProvider>
  );
};

export const PkiSyncDetailsByIDPage = () => {
  const { orgId } = useParams({ from: route });
  const { projectId, isPending } = useCertManagerProjectId(orgId);
  if (isPending) return <Loader size="page" label="Loading certificate sync" />;
  if (!projectId)
    return (
      <>
        <PageTitle title="Certificate sync" />
        <CertManagerNotSetUp orgId={orgId} />
      </>
    );
  return <SyncLoader orgId={orgId} projectId={projectId} />;
};
