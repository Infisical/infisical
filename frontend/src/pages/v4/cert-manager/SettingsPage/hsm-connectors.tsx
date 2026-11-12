import { useMemo, useState } from "react";
import { PencilIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline } from "@app/components/v4/ui/layout";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import {
  ProjectPermissionHsmConnectorActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import type { THsmConnector } from "@app/hooks/api/hsmConnectors/types";

import { formatDate } from "../../access/roles";
import { saved, toast } from "../../access/toast";
import { ListToolbar } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import type { HsmPlan } from "../../data/cert-manager-settings/contract-hsm";
import { orgHref, useGo } from "../../links";
import { EditHsmConnectorSheet } from "./hsm-connector-edit-sheet";
import { AddHsmConnectorSheet } from "./hsm-connector-wizard";
import { HSM_DOCS_URL } from "./hsm-shared";
import { RESTRICTED, useCertManagerSettingsScope, useSettingsPermission } from "./shared";

type Sort = { columnId: string; direction: "asc" | "desc" };

const Title = () => (
  <Inline gap={8} align="center">
    HSM connectors
    <DocumentationLinkBadge href={HSM_DOCS_URL} variant="minified" />
  </Inline>
);

const DeleteHsmConnectorDialog = ({
  connector,
  onClose
}: {
  connector?: THsmConnector;
  onClose: () => void;
}) => {
  const remove = useV4Adapter("certManagerSettings").useDeleteHsmConnector();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={Boolean(connector)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete HSM connector</AlertDialogTitle>
          <AlertDialogDescription>
            {`Delete ${connector?.name ?? ""}? Certificates that still use this connector block the deletion. Keys on your HSM are not touched.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={async (event) => {
              event.preventDefault();
              if (!connector) return;
              setPending(true);
              const deleted = await remove.mutateAsync({ connectorId: connector.id }).then(
                () => true,
                () => false
              );
              setPending(false);
              if (!deleted) return;
              saved(`HSM connector ${connector.name} deleted`);
              onClose();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const ConnectorsCard = ({ orgId, plan }: { orgId: string; plan: HsmPlan }) => {
  const adapter = useV4Adapter("certManagerSettings");
  const go = useGo();
  const { permission } = useSettingsPermission();
  const blocked = (action: ProjectPermissionHsmConnectorActions) =>
    permission.can(action, ProjectPermissionSub.HsmConnectors) ? undefined : RESTRICTED;
  const { data: connectors = [], isPending } = adapter.useHsmConnectors();
  const { data: gateways = [] } = adapter.useHsmAllGateways();
  const { data: pools = [] } = adapter.useHsmGatewayPools();
  const test = adapter.useTestHsmConnector();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>({ columnId: "name", direction: "asc" });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<THsmConnector>();
  const [deleting, setDeleting] = useState<THsmConnector>();
  const [testingId, setTestingId] = useState<string>();

  const reachedFrom = (connector: THsmConnector) => {
    if (connector.gatewayId)
      return (
        gateways.find((entry) => entry.id === connector.gatewayId)?.name ?? connector.gatewayId
      );
    if (connector.gatewayPoolId)
      return (
        pools.find((entry) => entry.id === connector.gatewayPoolId)?.name ?? connector.gatewayPoolId
      );
    return "-";
  };

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const key = (connector: THsmConnector) =>
      sort.columnId === "created" ? connector.createdAt : connector.name;
    return connectors
      .filter(
        (connector) =>
          !needle ||
          connector.name.toLowerCase().includes(needle) ||
          connector.slotLabel.toLowerCase().includes(needle) ||
          (connector.description ?? "").toLowerCase().includes(needle)
      )
      .sort((a, b) => key(a).localeCompare(key(b)) * (sort.direction === "asc" ? 1 : -1));
  }, [connectors, search, sort]);

  const verify = async (connector: THsmConnector) => {
    setTestingId(connector.id);
    const result = await test
      .mutateAsync({ connectorId: connector.id })
      .catch(() => undefined)
      .finally(() => setTestingId(undefined));
    if (!result) return;
    if (result.ok) {
      toast({
        tone: "ok",
        title: `HSM connector ${connector.name} verified`,
        description: "The gateway reached the HSM and the slot is online."
      });
      return;
    }
    const firstFailed = result.members.find((member) => !member.ok);
    toast({
      tone: "bad",
      title: `Couldn't verify ${connector.name}`,
      description:
        firstFailed && !firstFailed.ok
          ? `${firstFailed.errorCode}: ${firstFailed.errorMessage}`
          : "The verify against the HSM failed."
    });
  };

  const columns: DataTableColumn<THsmConnector>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      render: (connector) => (
        <RowLink
          link={go.link(orgHref(orgId, `/cert-manager/hsm-connectors/${connector.id}`))}
          title={connector.name}
        >
          {connector.name}
        </RowLink>
      )
    },
    { id: "reached-from", header: "Reached from", width: 220, render: reachedFrom },
    {
      id: "slot",
      header: "Slot",
      mono: true,
      width: 200,
      render: (connector) => connector.slotLabel
    },
    {
      id: "created",
      header: "Created",
      sortable: true,
      width: 140,
      render: (connector) => formatDate(connector.createdAt)
    }
  ];

  const testBlocked = (connector: THsmConnector) =>
    blocked(ProjectPermissionHsmConnectorActions.Test) ??
    (testingId === connector.id ? "Verifying" : undefined);
  const deleteBlocked = blocked(ProjectPermissionHsmConnectorActions.Delete);

  const rowActions: DataTableRowActions<THsmConnector> = {
    inline: [
      {
        label: "Edit details",
        icon: PencilIcon,
        disabledReason: () => blocked(ProjectPermissionHsmConnectorActions.Edit),
        onSelect: setEditing
      }
    ],
    renderMenu: (connector) => (
      <>
        <DropdownMenuItem
          onSelect={() => {
            navigator.clipboard?.writeText(connector.id).catch(() => undefined);
            saved("Connector ID copied");
          }}
        >
          <Icon name="copy" />
          Copy connector ID
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={Boolean(testBlocked(connector))}
          description={testBlocked(connector)}
          onSelect={() => verify(connector)}
        >
          <Icon name="check-c" />
          {testingId === connector.id ? "Verifying..." : "Verify"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={Boolean(deleteBlocked)}
          description={deleteBlocked}
          onSelect={() => setDeleting(connector)}
        >
          <Icon name="trash" />
          Delete connector
        </DropdownMenuItem>
      </>
    )
  };

  return (
    <>
      <Card
        variant="framed"
        flush
        title={<Title />}
        action={
          <Inline gap={8} align="center">
            <ListToolbar
              band
              search={search}
              onSearch={setSearch}
              placeholder="Search HSM connectors..."
            />
            <Button
              variant="outline"
              size="xs"
              icon="plus"
              disabledReason={blocked(ProjectPermissionHsmConnectorActions.Create)}
              onClick={() => setAdding(true)}
            >
              Add HSM connector
            </Button>
          </Inline>
        }
      >
        <DataTable
          label="HSM connectors"
          rows={visible}
          columns={columns}
          rowActions={rowActions}
          getRowId={(connector) => connector.id}
          rowLabel={(connector) => connector.name}
          loading={isPending}
          loadingRows={3}
          sort={sort}
          onSortChange={setSort}
          empty={
            search.trim() ? (
              <EmptyState size="sm" icon="search" title="No HSM connectors match your search" />
            ) : (
              <EmptyState
                size="sm"
                icon="key"
                title="No HSM connectors yet"
                description="Add one to register a slot on your hardware security module."
              />
            )
          }
        />
      </Card>
      <AddHsmConnectorSheet orgId={orgId} plan={plan} open={adding} onOpenChange={setAdding} />
      <EditHsmConnectorSheet
        connector={editing}
        plan={plan}
        onClose={() => setEditing(undefined)}
      />
      <DeleteHsmConnectorDialog connector={deleting} onClose={() => setDeleting(undefined)} />
    </>
  );
};

export const HsmConnectorsTab = () => {
  const { orgId } = useCertManagerSettingsScope();
  const go = useGo();
  const { data: plan, isPending } = useV4Adapter("certManagerSettings").useHsmPlan(orgId);
  if (isPending || !plan)
    return (
      <Card variant="framed" title={<Title />}>
        <Skeleton height={120} />
      </Card>
    );
  if (!plan.hsm)
    return (
      <Card variant="framed" title={<Title />}>
        <EmptyState
          size="sm"
          icon="lock"
          title="HSM connectors are on the Enterprise plan"
          description="Upgrade to use keys from your hardware security module for every cryptographic operation."
          actions={<Button onClick={() => go(orgHref(orgId, "/billing"))}>Upgrade plan</Button>}
        />
      </Card>
    );
  return <ConnectorsCard orgId={orgId} plan={plan} />;
};
