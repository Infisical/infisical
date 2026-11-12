import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@infisical/cipher/ui/hover-card";
import { Json, type JsonValue } from "@infisical/cipher/ui/json";
import { SettingsCard } from "@infisical/cipher/ui/settings-card";

import { formatDateTime } from "@app/helpers/datetime";
import { ScimEvent, type ScimEventData } from "@app/hooks/api/scim/types";

import { useOrgId } from "../../../access/permissions";
import { useV4Adapter } from "../../../data/adapters";

import styles from "./provisioning.module.css";

const getEntityDetails = (event: ScimEventData) => {
  if (event.eventType.includes("user")) {
    if (event.eventType === ScimEvent.LIST_USERS)
      return `Number of users: ${event.event?.numberOfUsers}`;
    return event.event?.email ?? event.event?.detail;
  }
  if (event.eventType.includes("group")) {
    if (event.eventType === ScimEvent.LIST_GROUPS)
      return `Number of groups: ${event.event?.numberOfGroups}`;
    return event.event?.groupName ?? event.event?.detail;
  }
  return "";
};

const columns: DataTableColumn<ScimEventData>[] = [
  {
    id: "timestamp",
    header: "Timestamp",
    width: 220,
    render: (row) => formatDateTime({ timestamp: row.createdAt })
  },
  {
    id: "event",
    header: "Event",
    width: 180,
    mono: true,
    text: (row) => row.eventType,
    render: (row) => row.eventType
  },
  {
    id: "entity",
    header: "Entity",
    primary: true,
    grow: true,
    text: (row) => String(getEntityDetails(row) ?? ""),
    render: (row) => getEntityDetails(row)
  },
  {
    id: "actions",
    header: "Actions",
    actions: true,
    render: (row) => (
      <HoverCard openDelay={150}>
        <HoverCardTrigger asChild>
          <Button variant="ghost" size="icon-row" icon="info" iconOnly>
            {`Show raw event for ${row.eventType}`}
          </Button>
        </HoverCardTrigger>
        <HoverCardContent align="end" className={styles.rawEvent}>
          <Json
            label={`Raw ${row.eventType} event`}
            value={JSON.parse(JSON.stringify(row)) as JsonValue}
            maxHeight={384}
            wrap
          />
        </HoverCardContent>
      </HoverCard>
    )
  }
];

export const ScimEvents = () => {
  const orgId = useOrgId();
  const { data: organization } = useV4Adapter("org").useOrganization(orgId);
  const scimEnabled = Boolean(organization?.scimEnabled);
  const {
    data: scimEvents,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage
  } = useV4Adapter("sso").useScimEvents({ since: "30d", disabled: !scimEnabled });

  if (!scimEnabled) return null;

  const rows = scimEvents?.pages.flat() ?? [];

  return (
    <SettingsCard
      flush
      title="SCIM events"
      description="Events provisioned successfully from your SCIM provider in the last 30 days."
    >
      <DataTable
        label="SCIM events"
        rows={rows}
        columns={columns}
        loading={isPending}
        loadingRows={5}
        getRowId={(row) => row.id}
        rowLabel={(row) => `${row.eventType} at ${row.createdAt}`}
        loadMore={
          hasNextPage
            ? { label: "Load more", loading: isFetchingNextPage, onClick: () => fetchNextPage() }
            : undefined
        }
        end={isPending || rows.length === 0 ? undefined : "End of logs"}
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon="history"
            title="No SCIM events"
            description="SCIM events provisioned from your SCIM server will appear here."
          />
        }
      />
    </SettingsCard>
  );
};
