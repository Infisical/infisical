import { useId, useMemo, useState } from "react";
import { subject } from "@casl/ability";
import { formatDistanceToNowStrict } from "date-fns";
import { PencilIcon } from "lucide-react";

import { useDiscardChangesGuard } from "@app/components/v4/hooks/use-discard-changes-guard";
import {
  AppConnectionForm,
  type AppConnectionFormValues
} from "@app/components/v4/patterns/app-connection-form";
import { Alert } from "@app/components/v4/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Media } from "@app/components/v4/ui/item";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { Pagination } from "@app/components/v4/ui/pagination";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";
import { Select } from "@app/components/v4/ui/select";
import { Textarea } from "@app/components/v4/ui/textarea";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";
import { AppConnectionCredentialRotationStatus } from "@app/hooks/api/appConnections/types/root-connection-enums";
import { ProjectType } from "@app/hooks/api/projects/types";
import { genericAppConnectionFieldsSchema } from "@app/lib/schemas/app-connections";

import { saved } from "../../access/toast";
import { ListToolbar } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { CONNECTION_PRESETS } from "../../data/integrations/connection-presets";
import { RESTRICTED, useCertManagerSettingsScope, useSettingsPermission } from "./shared";

const DOCS_URL = "https://infisical.com/docs/integrations/app-connections/overview";
const NOT_IN_V4 = "Not in v4 yet";

const appName = (app: AppConnection) => APP_CONNECTION_MAP[app].name;
const methodName = (row: TAppConnection) => getAppConnectionMethodDetails(row.method).name;

const AppLogo = ({ app }: { app: AppConnection }) => (
  <Media size="sm">
    <ProviderIcon icon={APP_CONNECTION_MAP[app].image} alt={`${appName(app)} logo`} size="md" />
  </Media>
);

const RotationBadge = ({ row }: { row: TAppConnection }) => {
  const { rotation } = row;
  if (!rotation) return null;
  if (!row.isAutoRotationEnabled) return <Badge tone="soft">Auto-rotation off</Badge>;
  if (rotation.rotationStatus === AppConnectionCredentialRotationStatus.Failed)
    return (
      <Tooltip content={rotation.lastRotationMessage ?? "The last rotation failed."}>
        <Badge tone="bad" dot>
          Rotation failed
        </Badge>
      </Tooltip>
    );
  const next = new Date(rotation.nextRotationAt);
  const daysLeft = (next.getTime() - Date.now()) / 86_400_000;
  if (daysLeft < 0) return <Badge tone="info">Rotating</Badge>;
  return (
    <Badge tone={daysLeft >= 7 ? "info" : "warn"}>
      Rotates in {formatDistanceToNowStrict(next)}
    </Badge>
  );
};

const AddConnectionDialog = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { projectId } = useCertManagerSettingsScope();
  const { data: options = [] } = useV4Adapter("integrations").useConnectionOptions(
    ProjectType.CertificateManager
  );
  const createConnection = useV4Adapter("certManagerSettings").useCreateConnection();
  const formId = useId();
  const [app, setApp] = useState<AppConnection>();
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const preset = app ? CONNECTION_PRESETS[app] : undefined;
  const close = () => {
    setApp(undefined);
    setDirty(false);
    onOpenChange(false);
  };
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: Boolean(app) || dirty,
    onDiscard: close
  });
  const appOptions = [...options]
    .sort((a, b) => appName(a.app).localeCompare(appName(b.app)))
    .map((option) => ({
      value: option.app,
      label: appName(option.app),
      disabled: !CONNECTION_PRESETS[option.app],
      description: CONNECTION_PRESETS[option.app] ? undefined : NOT_IN_V4
    }));
  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestDiscard())}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>{preset ? `Add ${preset.name} connection` : "Add connection"}</DialogTitle>
            <DialogDescription>
              Only this project can use connections created here.
            </DialogDescription>
          </DialogHeader>
          <Stack gap={16}>
            <Field label="App">
              <Select
                label="App"
                placeholder="Choose an app"
                options={appOptions}
                value={app}
                disabled={pending}
                onChange={(value) => {
                  setApp(value as AppConnection);
                  setDirty(false);
                }}
              />
            </Field>
            {preset && (
              <AppConnectionForm
                key={preset.app}
                id={formId}
                preset={preset}
                onDirtyChange={setDirty}
                onPendingChange={setPending}
                onSubmit={async (values: AppConnectionFormValues) => {
                  await createConnection.mutateAsync({
                    ...values,
                    projectId
                  } as TCreateAppConnectionDTO);
                  saved(`${preset.name} connection added`);
                  close();
                }}
              />
            )}
          </Stack>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="submit"
              form={formId}
              loading={pending}
              disabledReason={preset ? undefined : "Choose an app first."}
            >
              Add connection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your progress configuring this connection will be lost."
      />
    </>
  );
};

const detailsSchema = genericAppConnectionFieldsSchema.pick({ name: true, description: true });

const EditDetailsDialog = ({
  connection,
  onClose
}: {
  connection: TAppConnection;
  onClose: () => void;
}) => {
  const updateConnection = useV4Adapter("certManagerSettings").useUpdateConnection();
  const formId = useId();
  const [name, setName] = useState(connection.name);
  const [description, setDescription] = useState(connection.description ?? "");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const dirty = name !== connection.name || description !== (connection.description ?? "");
  const parsed = detailsSchema.safeParse({ name, description });
  const issues = submitted ? parsed.error?.flatten().fieldErrors : undefined;
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: onClose
  });
  return (
    <>
      <Dialog open onOpenChange={(next) => !next && requestDiscard()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>Edit {appName(connection.app)} connection</DialogTitle>
          </DialogHeader>
          <form
            id={formId}
            onSubmit={async (event) => {
              event.preventDefault();
              setSubmitted(true);
              if (!parsed.success) return;
              setPending(true);
              try {
                await updateConnection.mutateAsync({
                  connectionId: connection.id,
                  app: connection.app,
                  name: parsed.data.name,
                  description: parsed.data.description
                });
                saved(`${appName(connection.app)} connection updated`);
                onClose();
              } finally {
                setPending(false);
              }
            }}
          >
            <Stack gap={16}>
              <Field label="Name" error={issues?.name?.[0]}>
                <Input
                  value={name}
                  invalid={Boolean(issues?.name)}
                  autoComplete="off"
                  disabled={pending}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field label="Description" optional error={issues?.description?.[0]}>
                <Textarea
                  rows={3}
                  value={description}
                  disabled={pending}
                  aria-invalid={Boolean(issues?.description) || undefined}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
            </Stack>
          </form>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              type="submit"
              form={formId}
              loading={pending}
              disabledReason={dirty ? undefined : "No changes to save."}
            >
              Save details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your changes to this connection will be lost."
      />
    </>
  );
};

const DeleteConnectionDialog = ({
  connection,
  onClose
}: {
  connection?: TAppConnection;
  onClose: () => void;
}) => {
  const deleteConnection = useV4Adapter("certManagerSettings").useDeleteConnection();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={Boolean(connection)} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent tone="danger" confirmText={connection?.name} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {connection?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Anything that uses this connection stops working. You can&apos;t undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {connection?.isPlatformManagedCredentials && (
          <Alert tone="warn" title="Platform managed credentials">
            Infisical manages this connection&apos;s credentials, so deleting it may remove your
            only access to the connected resource.
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              if (!connection) return;
              setPending(true);
              try {
                await deleteConnection.mutateAsync({
                  connectionId: connection.id,
                  app: connection.app
                });
                saved(`${appName(connection.app)} connection deleted`);
                onClose();
              } finally {
                setPending(false);
              }
            }}
          >
            Delete connection
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

type Sort = { columnId: string; direction: "asc" | "desc" };

const sortKey = (row: TAppConnection, columnId: string) => {
  if (columnId === "name") return row.name;
  if (columnId === "method") return methodName(row);
  return appName(row.app);
};

export const AppConnectionsTab = () => {
  const { projectId } = useCertManagerSettingsScope();
  const { permission } = useSettingsPermission();
  const adapter = useV4Adapter("certManagerSettings");
  const { data: connections = [], isPending } = adapter.useConnections(projectId);
  const rotateCredentials = adapter.useRotateConnectionCredentials();
  const updateConnection = adapter.useUpdateConnection();
  const [search, setSearch] = useState("");
  const [apps, setApps] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>({ columnId: "app", direction: "asc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TAppConnection>();
  const [deleting, setDeleting] = useState<TAppConnection>();

  const canCreate = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );
  const can = (action: ProjectPermissionAppConnectionActions, row: TAppConnection) =>
    permission.can(action, subject(ProjectPermissionSub.AppConnections, { connectionId: row.id }));
  const editBlock = (row: TAppConnection) =>
    can(ProjectPermissionAppConnectionActions.Edit, row) ? undefined : RESTRICTED;

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return connections
      .filter((row) => !apps.length || apps.includes(row.app))
      .filter((row) =>
        [appName(row.app), methodName(row), row.name].some((value) =>
          value.toLowerCase().includes(needle)
        )
      )
      .sort(
        (a, b) =>
          sortKey(a, sort.columnId).localeCompare(sortKey(b, sort.columnId)) *
          (sort.direction === "asc" ? 1 : -1)
      );
  }, [connections, search, apps, sort]);
  const current = Math.min(page, Math.max(1, Math.ceil(visible.length / pageSize)));
  const filtered = Boolean(search.trim() || apps.length);

  const columns: DataTableColumn<TAppConnection>[] = [
    {
      id: "app",
      header: "App",
      sortable: true,
      width: 260,
      text: (row) => appName(row.app),
      render: (row) => (
        <Inline gap={8} align="center" wrap={false}>
          <AppLogo app={row.app} />
          <span className="truncate">{appName(row.app)}</span>
        </Inline>
      )
    },
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      grow: true,
      text: (row) => (row.description ? `${row.name}: ${row.description}` : row.name),
      render: (row) => row.name
    },
    { id: "method", header: "Method", sortable: true, width: 200, render: methodName },
    {
      id: "status",
      header: "Status",
      width: 260,
      render: (row) => (
        <Inline gap={4} align="center" wrap={false}>
          {row.isPlatformManagedCredentials && (
            <Tooltip content="Infisical manages this connection's credentials.">
              <Badge tone="info">Platform managed</Badge>
            </Tooltip>
          )}
          <RotationBadge row={row} />
        </Inline>
      )
    }
  ];

  const appFilterOptions = [...new Set(connections.map((row) => row.app))]
    .sort((a, b) => appName(a).localeCompare(appName(b)))
    .map((value) => ({ value, label: appName(value) }));

  return (
    <>
      <Card
        variant="framed"
        flush={visible.length > 0 || isPending}
        title={
          <Inline gap={8} align="center">
            App connections
            <DocumentationLinkBadge href={DOCS_URL} variant="minified" />
          </Inline>
        }
        action={
          <Inline gap={8} align="center">
            <ListToolbar
              band
              search={search}
              onSearch={(value) => {
                setSearch(value);
                setPage(1);
              }}
              placeholder="Search connections..."
              filter={{
                label: "Filter by app",
                options: appFilterOptions,
                selected: apps,
                disabledReason: appFilterOptions.length ? undefined : "No connections yet",
                onToggle: (value) => {
                  setApps((selected) =>
                    selected.includes(value)
                      ? selected.filter((entry) => entry !== value)
                      : [...selected, value]
                  );
                  setPage(1);
                }
              }}
            />
            <Button
              variant="outline"
              size="xs"
              icon="plus"
              disabledReason={canCreate ? undefined : RESTRICTED}
              onClick={() => setAdding(true)}
            >
              Add connection
            </Button>
          </Inline>
        }
      >
        <DataTable
          label="App connections"
          rows={visible.slice((current - 1) * pageSize, current * pageSize)}
          loading={isPending}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          sort={sort}
          onSortChange={setSort}
          pagination={
            visible.length > 0 ? (
              <Pagination
                label="App connection pages"
                variant="compact"
                page={current}
                onPageChange={setPage}
                total={visible.length}
                pageSize={pageSize}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            ) : undefined
          }
          rowActions={{
            inline: [
              {
                label: "Edit details",
                icon: PencilIcon,
                disabledReason: editBlock,
                onSelect: setEditing
              }
            ],
            renderMenu: (row) => {
              const blocked = editBlock(row);
              return (
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      navigator.clipboard?.writeText(row.id).catch(() => undefined);
                      saved("Connection ID copied");
                    }}
                  >
                    Copy connection ID
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled description={blocked ?? NOT_IN_V4}>
                    {row.isPlatformManagedCredentials ? "View credentials" : "Edit credentials"}
                  </DropdownMenuItem>
                  {row.rotation && (
                    <>
                      <DropdownMenuItem
                        disabled={Boolean(blocked)}
                        description={blocked}
                        onSelect={async () => {
                          await rotateCredentials.mutateAsync({
                            connectionId: row.id,
                            app: row.app,
                            projectId
                          });
                          saved("Credential rotation started");
                        }}
                      >
                        Rotate credentials
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={Boolean(blocked)}
                        description={blocked}
                        onSelect={async () => {
                          const enabling = !row.isAutoRotationEnabled;
                          await updateConnection.mutateAsync({
                            connectionId: row.id,
                            app: row.app,
                            isAutoRotationEnabled: enabling
                          });
                          saved(`Auto-rotation ${enabling ? "enabled" : "disabled"}`);
                        }}
                      >
                        {row.isAutoRotationEnabled
                          ? "Disable auto-rotation"
                          : "Enable auto-rotation"}
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={!can(ProjectPermissionAppConnectionActions.Delete, row)}
                    description={
                      can(ProjectPermissionAppConnectionActions.Delete, row)
                        ? undefined
                        : RESTRICTED
                    }
                    onSelect={() => setDeleting(row)}
                  >
                    Delete connection
                  </DropdownMenuItem>
                </>
              );
            }
          }}
          empty={
            filtered ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No connections match your filters"
                actions={
                  <Button
                    variant="link"
                    onClick={() => {
                      setSearch("");
                      setApps([]);
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                size="sm"
                icon="apps"
                title="No app connections yet"
                description="Connect a third-party service to issue or distribute certificates."
              />
            )
          }
        />
      </Card>
      <AddConnectionDialog open={adding} onOpenChange={setAdding} />
      {editing && (
        <EditDetailsDialog
          key={editing.id}
          connection={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      <DeleteConnectionDialog connection={deleting} onClose={() => setDeleting(undefined)} />
    </>
  );
};
