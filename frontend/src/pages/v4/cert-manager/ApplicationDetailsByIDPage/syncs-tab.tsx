import { Badge, type BadgeTone } from "@infisical/cipher/ui/badge";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Text } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { formatDistanceToNow } from "date-fns";

import {
  ProjectPermissionPkiSyncActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import {
  PkiApplicationResourceActions,
  PkiApplicationResourceSub,
  type TPkiApplication
} from "@app/hooks/api/pkiApplications/types";
import { PkiSyncStatus } from "@app/hooks/api/pkiSyncs/enums";
import type { TPkiSync } from "@app/hooks/api/pkiSyncs/types";

import { useProjectPermission } from "../../access/permissions";
import { failed, saved } from "../../access/toast";
import { RESTRICTED } from "../../access/ui";
import { ProviderIcon } from "../../components/provider-icon";
import { useV4Adapter } from "../../data/adapters";
import type { PkiApplicationPermission } from "../../data/pki-applications/contract";
import { orgHref, useGo } from "../../links";
import { appCan, copyId, plural } from "./shared";

const statusMeta: Record<PkiSyncStatus, { label: string; tone: BadgeTone }> = {
  [PkiSyncStatus.Succeeded]: { label: "Synced", tone: "ok" },
  [PkiSyncStatus.Failed]: { label: "Failed", tone: "bad" },
  [PkiSyncStatus.Running]: { label: "Syncing", tone: "info" },
  [PkiSyncStatus.Pending]: { label: "Queued", tone: "soft" }
};

const SyncStatus = ({ sync }: { sync: TPkiSync }) => {
  if (!sync.syncStatus) return <Text muted>Never synced</Text>;
  const meta = statusMeta[sync.syncStatus];
  const badge = (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
  return sync.lastSyncMessage ? (
    <Tooltip content={sync.lastSyncMessage}>
      <span>{badge}</span>
    </Tooltip>
  ) : (
    badge
  );
};

export const SyncsTab = ({
  orgId,
  projectId,
  application,
  access
}: {
  orgId: string;
  projectId: string;
  application: TPkiApplication;
  access: PkiApplicationPermission;
}) => {
  const go = useGo();
  const adapter = useV4Adapter("pkiApplications");
  const trigger = adapter.useTriggerSync();
  const { permission } = useProjectPermission(projectId);
  const { data, isPending } = adapter.useApplicationSyncs(projectId, application.id);
  const syncs = data ?? [];
  const canTrigger =
    permission.can(
      ProjectPermissionPkiSyncActions.SyncCertificates,
      ProjectPermissionSub.PkiSyncs
    ) ||
    appCan(
      access,
      PkiApplicationResourceActions.SyncCertificates,
      PkiApplicationResourceSub.PkiSyncs
    );
  const syncHref = (sync: TPkiSync) =>
    orgHref(
      orgId,
      `/cert-manager/integrations/${sync.id}?fromApplication=${encodeURIComponent(application.name)}`
    );

  const runSync = async (sync: TPkiSync) => {
    try {
      await trigger.mutateAsync({ syncId: sync.id, destination: sync.destination, projectId });
    } catch (error) {
      failed(`Failed to sync ${sync.name}`, error);
      return;
    }
    saved(`Sync started for ${sync.name}`);
  };

  const columns: DataTableColumn<TPkiSync>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (sync) => sync.name,
      secondary: (sync) => sync.description || undefined,
      render: (sync) => (
        <RowLink link={go.link(syncHref(sync))} title={sync.name}>
          {sync.name}
        </RowLink>
      )
    },
    {
      id: "destination",
      header: "Destination",
      width: 240,
      text: (sync) => PKI_SYNC_MAP[sync.destination]?.name ?? sync.destination,
      render: (sync) => {
        const destination = PKI_SYNC_MAP[sync.destination];
        return (
          <Inline gap={8} align="center" wrap={false}>
            {destination && <ProviderIcon icon={destination.image} alt="" size="sm" />}
            <span>{destination?.name ?? sync.destination}</span>
          </Inline>
        );
      }
    },
    {
      id: "status",
      header: "Status",
      width: 136,
      render: (sync) => <SyncStatus sync={sync} />
    },
    {
      id: "synced",
      header: "Last synced",
      width: 152,
      render: (sync) =>
        sync.lastSyncedAt
          ? formatDistanceToNow(new Date(sync.lastSyncedAt), { addSuffix: true })
          : "Never"
    }
  ];

  return (
    <Stack gap={16}>
      <DataTable
        label={`Certificate syncs in ${application.name}`}
        rows={syncs}
        loading={isPending}
        columns={columns}
        getRowId={(sync) => sync.id}
        rowLabel={(sync) => sync.name}
        rowActions={{
          inline: [
            {
              label: "Sync now",
              icon: "sync",
              disabledReason: (sync) => {
                if (!canTrigger) return RESTRICTED;
                if (sync.syncStatus === PkiSyncStatus.Running) return "A sync is already running";
                return undefined;
              },
              onSelect: runSync
            }
          ],
          renderMenu: (sync) => (
            <DropdownMenuItem
              onSelect={() => {
                copyId(sync.id);
                saved("Sync ID copied");
              }}
            >
              <Icon name="copy" />
              Copy sync ID
            </DropdownMenuItem>
          )
        }}
        empty={<EmptyState size="sm" icon="sync" title="No certificate syncs yet" />}
        persistentStatus={syncs.length ? plural(syncs.length, "sync", "syncs") : undefined}
      />
    </Stack>
  );
};
