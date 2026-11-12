import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { formatRelative } from "date-fns";

import { FilterBar } from "@app/components/v4/patterns/filter-bar";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { DropdownMenuItem } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import type { TRelay } from "@app/hooks/api/relays/types";
import { slugSchema } from "@app/lib/schemas";

import { useOrgPermission } from "../../access/permissions";
import { toast } from "../../access/toast";
import { AccessRestricted, RESTRICTED, usePagedList } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { ConfirmDialog } from "../../networking/confirm-dialog";
import { RelayHealth } from "../../networking/health";

const relayNameSchema = slugSchema({ min: 1, max: 32, field: "Name" });

const matches = (relay: TRelay, needle: string) => relay.name.toLowerCase().includes(needle);
const compare = (a: TRelay, b: TRelay, columnId: string) => {
  if (columnId === "host") return a.host.localeCompare(b.host) || a.name.localeCompare(b.name);
  if (columnId === "created")
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  return a.name.localeCompare(b.name);
};

const CreateRelayDialog = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { orgId } = useParams({ from: v4Path("/organizations/$orgId") });
  const navigate = useNavigate();
  const createRelay = useV4Adapter("networking").useCreateRelay();
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [errors, setErrors] = useState<{ name?: string; host?: string }>({});
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setName("");
          setHost("");
          setErrors({});
        }
        onOpenChange(next);
      }}
    >
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Create relay</DialogTitle>
          <DialogDescription>
            Generate an enrollment token for the relay on its detail page.
          </DialogDescription>
        </DialogHeader>
        <form
          id="networking-relay"
          onSubmit={async (event) => {
            event.preventDefault();
            const parsed = relayNameSchema.safeParse(name);
            const next = {
              name: parsed.success ? undefined : parsed.error.issues[0]?.message,
              host: host.trim() ? undefined : "Host is required"
            };
            setErrors(next);
            if (next.name || next.host) return;
            setPending(true);
            try {
              const relay = await createRelay.mutateAsync({
                name: name.trim(),
                host: host.trim(),
                authMethod: { method: "token" }
              });
              onOpenChange(false);
              navigate({
                to: v4Path("/organizations/$orgId/networking/relays/$relayId"),
                params: { orgId, relayId: relay.id }
              });
            } catch {
              // The global mutation handler reports the API error.
            } finally {
              setPending(false);
            }
          }}
        >
          <Stack gap={16}>
            <Field label="Name" error={errors.name}>
              <Input
                autoFocus
                autoComplete="off"
                placeholder="my-relay"
                value={name}
                invalid={Boolean(errors.name)}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field label="Host" error={errors.host}>
              <Input
                mono
                autoComplete="off"
                placeholder="10.0.0.5 or relay.example.com"
                value={host}
                invalid={Boolean(errors.host)}
                onChange={(event) => setHost(event.target.value)}
              />
            </Field>
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="networking-relay"
            loading={pending}
            disabled={!name.trim() || !host.trim()}
          >
            Create relay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const RelaysPanel = ({
  creating,
  onCloseCreate
}: {
  creating: boolean;
  onCloseCreate: () => void;
}) => {
  const { orgId } = useParams({ from: v4Path("/organizations/$orgId") });
  const go = useGo();
  const networking = useV4Adapter("networking");
  const { permission, isPending: permissionPending } = useOrgPermission();
  const { data: relays = [], isPending } = networking.useRelays();
  const deleteRelay = networking.useDeleteRelay();
  const [deleting, setDeleting] = useState<TRelay>();
  const list = usePagedList({
    rows: relays,
    matches,
    compare,
    initialSort: { columnId: "name", direction: "asc" }
  });
  const can = (action: OrgRelayPermissionActions) =>
    permission.can(action, OrgPermissionSubjects.Relay);

  const dialogs = (
    <>
      <CreateRelayDialog open={creating} onOpenChange={(open) => !open && onCloseCreate()} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete ${deleting?.name ?? "relay"}?`}
        description="This permanently removes the relay from your organization and cannot be undone."
        confirmText={deleting?.name ?? ""}
        action="Delete relay"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteRelay.mutateAsync(deleting.id);
          toast({ tone: "ok", title: "Successfully deleted relay" });
        }}
      />
    </>
  );

  if (!permissionPending && !can(OrgRelayPermissionActions.ListRelays))
    return (
      <>
        <AccessRestricted requirement="list Relays" />
        {dialogs}
      </>
    );

  const canDelete = can(OrgRelayPermissionActions.DeleteRelays);
  const columns: DataTableColumn<TRelay>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      text: (relay) => relay.name,
      render: (relay) =>
        relay.orgId ? (
          <RowLink
            link={go.link(orgHref(orgId, `/networking/relays/${relay.id}`))}
            title={relay.name}
          >
            {relay.name}
          </RowLink>
        ) : (
          <Inline gap={8} align="center" wrap={false}>
            {relay.name}
            <Tooltip content="This relay is managed by Infisical.">
              <Badge tone="soft" tabIndex={0}>
                Managed
              </Badge>
            </Tooltip>
          </Inline>
        )
    },
    {
      id: "host",
      header: "Host",
      mono: true,
      sortable: true,
      width: 240,
      render: (relay) => relay.host
    },
    {
      id: "created",
      header: "Created",
      sortable: true,
      width: 200,
      render: (relay) => formatRelative(new Date(relay.createdAt), new Date())
    },
    {
      id: "health",
      header: "Health check",
      width: 160,
      render: (relay) => <RelayHealth heartbeat={relay.heartbeat} />
    }
  ];

  return (
    <Stack gap={24}>
      <FilterBar
        label="Relay filters"
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label="Search relays"
            placeholder="Search relays"
            kbd="/"
            value={list.search}
            onChange={(event) => list.setSearch(event.target.value)}
          />
        }
      />
      <DataTable
        label="Relays"
        rows={list.pageRows}
        loading={isPending}
        columns={columns}
        getRowId={(relay) => relay.id}
        rowLabel={(relay) => relay.name}
        sort={list.sort}
        onSortChange={list.setSort}
        pagination={list.pagination}
        rowActions={{
          inline: [
            {
              label: "Copy relay ID",
              icon: "copy",
              onSelect: (relay) => {
                navigator.clipboard?.writeText(relay.id);
                toast({ tone: "neutral", title: "Relay ID copied to clipboard" });
              }
            }
          ],
          renderMenu: (relay) => {
            let reason: string | undefined;
            if (!canDelete) reason = RESTRICTED;
            else if (!relay.orgId) reason = "Managed by Infisical";
            return (
              <DropdownMenuItem
                variant="destructive"
                disabled={Boolean(reason)}
                description={reason}
                onSelect={() => setDeleting(relay)}
              >
                <Icon name="trash" />
                Delete relay
              </DropdownMenuItem>
            );
          }
        }}
        empty={
          relays.length ? (
            <EmptyState
              size="sm"
              icon="search"
              title="No relays match your search"
              actions={
                <Button variant="link" onClick={() => list.setSearch("")}>
                  Clear search
                </Button>
              }
            />
          ) : (
            <EmptyState size="sm" icon="globe" title="No relays yet" />
          )
        }
      />
      {dialogs}
    </Stack>
  );
};
