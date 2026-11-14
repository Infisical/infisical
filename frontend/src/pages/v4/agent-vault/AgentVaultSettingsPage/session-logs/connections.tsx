import { useId, useState } from "react";
import { subject } from "@casl/ability";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { SmallText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import type { AxiosError } from "axios";

import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";
import { genericAppConnectionFieldsSchema } from "@app/lib/schemas/app-connections";
import { AppConnectionForm } from "@app/pages/v4/components/app-connection-form";

import { useProjectPermission } from "../../../access/permissions";
import { useProjectScope } from "../../../access/project/scope";
import { saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { CONNECTION_PRESETS } from "../../../data/integrations/connection-presets";

const AWS_PRESET = CONNECTION_PRESETS[AppConnection.AWS];
const RESTRICTED = "Your role doesn't allow this";

const detailsSchema = genericAppConnectionFieldsSchema.pick({ name: true, description: true });

const apiMessage = (error: unknown) => {
  const axiosError = error as AxiosError<{ message?: string }>;
  return axiosError.response?.data?.message ?? (error instanceof Error ? error.message : "");
};

export const useConnectionPermissions = () => {
  const { projectId } = useProjectScope();
  const { permission, isPending } = useProjectPermission(projectId);
  const canFor = (action: ProjectPermissionAppConnectionActions, connectionId: string) =>
    !isPending &&
    permission.can(action, subject(ProjectPermissionSub.AppConnections, { connectionId }));
  return {
    canCreate:
      !isPending &&
      permission.can(
        ProjectPermissionAppConnectionActions.Create,
        ProjectPermissionSub.AppConnections
      ),
    canEdit: (connectionId: string) =>
      canFor(ProjectPermissionAppConnectionActions.Edit, connectionId),
    canDelete: (connectionId: string) =>
      canFor(ProjectPermissionAppConnectionActions.Delete, connectionId)
  };
};

export const useCreateAwsConnection = () => {
  const { projectId } = useProjectScope();
  const createConnection = useV4Adapter("agentVaultSettings").useCreateConnection();
  return async ({
    method,
    name,
    description,
    credentials
  }: {
    method: string;
    name: string;
    description?: unknown;
    credentials?: unknown;
  }) => {
    try {
      return await createConnection.mutateAsync({
        app: AppConnection.AWS,
        name,
        method: method as TAppConnection["method"],
        credentials: credentials as TAppConnection["credentials"],
        description: (description as string | undefined)?.trim() || null,
        projectId
      } as TCreateAppConnectionDTO);
    } catch (error) {
      throw new Error(apiMessage(error) || "The connection was not created. Try again.");
    }
  };
};

const CreateConnectionDialog = ({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const formId = useId();
  const create = useCreateAwsConnection();
  const [pending, setPending] = useState(false);
  if (!AWS_PRESET) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Add AWS connection</DialogTitle>
        </DialogHeader>
        {open && (
          <AppConnectionForm
            id={formId}
            preset={AWS_PRESET}
            onPendingChange={setPending}
            onSubmit={async (values) => {
              const created = await create(values);
              saved(`${created.name} added`);
              onOpenChange(false);
            }}
          />
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="submit" form={formId} loading={pending}>
            Add connection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const EditDetailsDialog = ({
  connection,
  onClose
}: {
  connection: TAppConnection;
  onClose: () => void;
}) => {
  const updateConnection = useV4Adapter("agentVaultSettings").useUpdateConnection();
  const formId = useId();
  const [draft, setDraft] = useState({
    name: connection.name,
    description: connection.description ?? ""
  });
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const issues = detailsSchema.safeParse(draft).error?.flatten().fieldErrors;
  const shown = submitted ? issues : undefined;
  const dirty =
    draft.name !== connection.name || draft.description !== (connection.description ?? "");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Edit connection details</DialogTitle>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitted(true);
            if (issues) return;
            setPending(true);
            try {
              const updated = await updateConnection.mutateAsync({
                app: connection.app,
                connectionId: connection.id,
                name: draft.name,
                description: draft.description.trim() || null
              });
              saved(`${updated.name} updated`);
              onClose();
            } catch {
              setPending(false);
            }
          }}
        >
          <Stack gap={16}>
            <Field label="Name" error={shown?.name?.[0]}>
              <Input
                value={draft.name}
                invalid={Boolean(shown?.name)}
                autoComplete="off"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
            <Field label="Description" optional error={shown?.description?.[0]}>
              <Textarea
                rows={3}
                value={draft.description}
                aria-invalid={Boolean(shown?.description) || undefined}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </Field>
          </Stack>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="submit" form={formId} loading={pending} disabled={!dirty}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const EditCredentialsDialog = ({
  connection,
  onClose
}: {
  connection: TAppConnection;
  onClose: () => void;
}) => {
  const updateConnection = useV4Adapter("agentVaultSettings").useUpdateConnection();
  const formId = useId();
  const method = AWS_PRESET?.methods.find((entry) => entry.value === connection.method);
  const current = (connection.credentials ?? {}) as Record<string, unknown>;
  const [credentials, setCredentials] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.keys(method?.credentials ?? {}).map((key) => {
        const field = method?.fields.find((entry) => entry.name === `credentials.${key}`);
        const value = field?.kind === "secret" ? "" : current[key];
        return [key, typeof value === "string" ? value : ""];
      })
    )
  );
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  if (!AWS_PRESET || !method) return null;
  const result = AWS_PRESET.schema.safeParse({
    app: AppConnection.AWS,
    name: connection.name,
    method: connection.method,
    credentials
  });
  const fieldErrors = Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [issue.path.join("."), issue.message])
  );
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Edit credentials for {connection.name}</DialogTitle>
          <DialogDescription>Method: {method.label}</DialogDescription>
        </DialogHeader>
        <form
          id={formId}
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitted(true);
            if (!result.success) return;
            setPending(true);
            try {
              const credentialsUpdate = {
                method: connection.method,
                credentials: credentials as TAppConnection["credentials"]
              };
              await updateConnection.mutateAsync({
                app: connection.app,
                connectionId: connection.id,
                ...credentialsUpdate
              });
              saved(`${connection.name} credentials updated`);
              onClose();
            } catch {
              setPending(false);
            }
          }}
        >
          <Stack gap={16}>
            {method.fields.map((field) => {
              const key = field.name.replace(/^credentials\./, "");
              const message = submitted ? fieldErrors[field.name] : undefined;
              const update = (value: string) => setCredentials({ ...credentials, [key]: value });
              return (
                <Field
                  key={field.name}
                  label={field.label}
                  optional={field.optional}
                  description={field.description}
                  error={message}
                >
                  {field.kind === "secret" ? (
                    <SecretInput
                      value={credentials[key] ?? ""}
                      invalid={Boolean(message)}
                      onChange={update}
                    />
                  ) : (
                    <Input
                      mono={field.mono}
                      value={credentials[key] ?? ""}
                      placeholder={field.placeholder}
                      invalid={Boolean(message)}
                      autoComplete="off"
                      onChange={(event) => update(event.target.value)}
                    />
                  )}
                </Field>
              );
            })}
          </Stack>
        </form>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="submit" form={formId} loading={pending}>
            Update credentials
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const DeleteConnectionDialog = ({
  connection,
  onClose
}: {
  connection: TAppConnection;
  onClose: () => void;
}) => {
  const deleteConnection = useV4Adapter("agentVaultSettings").useDeleteConnection();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" confirmText={connection.name} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {connection.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Anything that uses this connection stops working. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              try {
                await deleteConnection.mutateAsync({
                  app: connection.app,
                  connectionId: connection.id
                });
                saved(`${connection.name} deleted`);
                onClose();
              } catch {
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

type Editing = { kind: "details" | "credentials" | "delete"; connection: TAppConnection };

export const SessionLogConnections = ({ inUseId }: { inUseId: string | null }) => {
  const { projectId } = useProjectScope();
  const settings = useV4Adapter("agentVaultSettings");
  const { data: connections = [], isPending } = settings.useProjectConnections(projectId);
  // Organization connections aren't listed here, so the one session logs use is named when the list is empty.
  const { data: available } = settings.useAvailableConnections(AppConnection.AWS, projectId);
  const orgConnectionInUse = available?.find(
    (connection) => connection.id === inUseId && !connection.projectId
  );
  const { canCreate, canEdit, canDelete } = useConnectionPermissions();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Editing>();
  const close = () => setEditing(undefined);

  const columns: DataTableColumn<TAppConnection>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (row) => row.name,
      render: (row) => (
        <Stack gap={0}>
          <Inline gap={8} align="center" wrap={false}>
            <span>{row.name}</span>
            {row.id === inUseId && <Badge tone="info">In use</Badge>}
          </Inline>
          {row.description && <SmallText muted>{row.description}</SmallText>}
        </Stack>
      )
    },
    {
      id: "method",
      header: "Method",
      width: 200,
      text: (row) => getAppConnectionMethodDetails(row.method).name,
      render: (row) => getAppConnectionMethodDetails(row.method).name
    }
  ];

  return (
    <>
      <Card
        variant="framed"
        flush
        title="AWS connections"
        hint="Only this project can use these. Organization connections live in Integrations."
        action={
          <Button
            variant="accent"
            size="xs"
            icon="plus"
            disabledReason={canCreate ? undefined : RESTRICTED}
            onClick={() => setAdding(true)}
          >
            Add connection
          </Button>
        }
      >
        <DataTable
          label="AWS connections"
          rows={connections}
          columns={columns}
          loading={isPending}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          rowActions={{
            inline: [
              {
                label: "Edit credentials",
                icon: "key",
                disabledReason: (row) => (canEdit(row.id) ? undefined : RESTRICTED),
                onSelect: (row) => setEditing({ kind: "credentials", connection: row })
              }
            ],
            renderMenu: (row) => {
              const isInUse = row.id === inUseId;
              let deleteReason: string | undefined;
              if (!canDelete(row.id)) deleteReason = RESTRICTED;
              else if (isInUse)
                deleteReason =
                  "Session logs use this connection. Turn session logs off, or choose another storage, before deleting it.";
              return (
                <>
                  <DropdownMenuItem
                    onSelect={() => {
                      navigator.clipboard?.writeText(row.id).catch(() => undefined);
                      saved("Connection ID copied");
                    }}
                  >
                    <Icon name="copy" />
                    Copy connection ID
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!canEdit(row.id)}
                    description={canEdit(row.id) ? undefined : RESTRICTED}
                    onSelect={() => setEditing({ kind: "details", connection: row })}
                  >
                    <Icon name="settings" />
                    Edit details
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={Boolean(deleteReason)}
                    description={deleteReason}
                    onSelect={() => setEditing({ kind: "delete", connection: row })}
                  >
                    <Icon name="trash" />
                    Delete connection
                  </DropdownMenuItem>
                </>
              );
            }
          }}
          empty={
            <EmptyState
              size="sm"
              icon="link"
              title="No connections yet"
              description={
                orgConnectionInUse
                  ? `Session logs use ${orgConnectionInUse.name}, an organization connection. Edit it in Integrations.`
                  : "Add an AWS connection, then choose it for session logs."
              }
            />
          }
        />
      </Card>
      <CreateConnectionDialog open={adding} onOpenChange={setAdding} />
      {editing?.kind === "details" && (
        <EditDetailsDialog
          key={editing.connection.id}
          connection={editing.connection}
          onClose={close}
        />
      )}
      {editing?.kind === "credentials" && (
        <EditCredentialsDialog
          key={editing.connection.id}
          connection={editing.connection}
          onClose={close}
        />
      )}
      {editing?.kind === "delete" && (
        <DeleteConnectionDialog
          key={editing.connection.id}
          connection={editing.connection}
          onClose={close}
        />
      )}
    </>
  );
};
