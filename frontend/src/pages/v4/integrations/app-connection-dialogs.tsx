import { useEffect, useId, useRef, useState } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  get,
  useForm,
  useWatch
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDistanceToNowStrict } from "date-fns";

import { useDiscardChangesGuard } from "@app/components/v4/hooks/use-discard-changes-guard";
import {
  AppConnectionForm,
  type AppConnectionFieldPreset,
  type AppConnectionFormValues,
  type AppConnectionMethodPreset,
  type AppConnectionPreset
} from "@app/components/v4/patterns/app-connection-form";
import { Alert, AlertDescription } from "@app/components/v4/ui/alert";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Field, FieldSet } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList, List, ListRow } from "@app/components/v4/ui/list";
import { SecretInput } from "@app/components/v4/ui/secret-input";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Switch } from "@app/components/v4/ui/switch";
import { Textarea } from "@app/components/v4/ui/textarea";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";
import { AppConnectionCredentialRotationStatus } from "@app/hooks/api/appConnections/types/root-connection-enums";
import type { ProjectType } from "@app/hooks/api/projects/types";
import { genericAppConnectionFieldsSchema } from "@app/lib/schemas/app-connections";

import { errorMessage, failed, saved } from "../access/toast";
import { useV4Adapter } from "../data/adapters";
import { CONNECTION_PRESETS } from "../data/integrations/connection-presets";
import { connectionRedirect } from "../data/integrations/connection-redirect";
import { AppLogo } from "../organization/IntegrationsPage/AppLogo";

export const NOT_IN_V4 = "Not in v4 yet";

export const appName = (app: AppConnection) => APP_CONNECTION_MAP[app].name;
export const methodName = (row: TAppConnection) => getAppConnectionMethodDetails(row.method).name;

const methodPreset = (row: TAppConnection) =>
  CONNECTION_PRESETS[row.app]?.methods.find((entry) => entry.value === row.method);

/** Why the credentials sheet can't open for this connection in v4, or undefined when it can. */
export const credentialsBlock = (row: TAppConnection) => {
  if (row.isPlatformManagedCredentials) return undefined;
  const method = methodPreset(row);
  return method && !method.redirect ? undefined : NOT_IN_V4;
};

export const RotationBadge = ({ row }: { row: TAppConnection }) => {
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

const AppPicker = ({
  projectType,
  onPick
}: {
  projectType?: ProjectType;
  onPick: (app: AppConnection) => void;
}) => {
  const { data: options = [], isPending } =
    useV4Adapter("integrations").useConnectionOptions(projectType);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const apps = options
    .map((option) => option.app)
    .filter((app) => appName(app).toLowerCase().includes(needle))
    .sort((a, b) => appName(a).localeCompare(appName(b)));
  return (
    <Stack gap={12}>
      <Input
        icon="search"
        aria-label="Search apps"
        placeholder="Search apps..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <List
        label="Apps"
        size="sm"
        loading={isPending}
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon="search"
            title={`No apps match “${query}”`}
            actions={
              <Button variant="link" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        }
      >
        {apps.map((app) => (
          <ListRow
            key={app}
            value={app}
            label={appName(app)}
            title={appName(app)}
            media={<AppLogo app={app} />}
            disabled={!CONNECTION_PRESETS[app]}
            badge={CONNECTION_PRESETS[app] ? undefined : <Badge tone="soft">{NOT_IN_V4}</Badge>}
            onClick={() => onPick(app)}
          />
        ))}
      </List>
    </Stack>
  );
};

/**
 * Picks an app, then creates the connection from its preset. Redirect methods (GitHub App install,
 * OAuth) come back to returnTo through the v4 callback route.
 */
export const AddConnectionSheet = ({
  open,
  onOpenChange,
  returnTo,
  projectId,
  projectType,
  app
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo: string;
  projectId?: string;
  projectType?: ProjectType;
  app?: AppConnection;
}) => {
  const integrations = useV4Adapter("integrations");
  const { data: options = [] } = integrations.useConnectionOptions(projectType);
  const createConnection = integrations.useCreateConnection();
  const formId = useId();
  const [selected, setSelected] = useState(app);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitLabel, setSubmitLabel] = useState("Create connection");
  const discardAction = useRef<() => void>(() => undefined);
  const preset = selected ? CONNECTION_PRESETS[selected] : undefined;
  const option = options.find((entry) => entry.app === selected);

  useEffect(() => {
    if (!open) return;
    setSelected(app);
    setDirty(false);
  }, [open, app]);

  const close = () => {
    setDirty(false);
    setSelected(undefined);
    onOpenChange(false);
  };
  const back = () => {
    setDirty(false);
    setSelected(undefined);
  };
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: () => discardAction.current()
  });
  const request = (action: () => void) => {
    discardAction.current = action;
    requestDiscard();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : request(close))}>
        <SheetContent size="md" pending={pending}>
          <SheetHeader>
            <SheetTitle>{preset ? `Add ${preset.name} connection` : "Add connection"}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {preset ? (
              <Stack gap={16}>
                {!app && (
                  <Inline>
                    <Button
                      variant="outline"
                      size="sm"
                      icon="chev-left"
                      disabled={pending}
                      onClick={() => request(back)}
                    >
                      Choose another app
                    </Button>
                  </Inline>
                )}
                <AppConnectionForm
                  key={preset.app}
                  id={formId}
                  preset={preset}
                  redirect={connectionRedirect({
                    returnTo,
                    projectId,
                    option: option as Record<string, unknown> | undefined
                  })}
                  onDirtyChange={setDirty}
                  onPendingChange={setPending}
                  onSubmitLabelChange={setSubmitLabel}
                  onSubmit={async (values: AppConnectionFormValues) => {
                    await createConnection
                      .mutateAsync({ ...values, projectId } as TCreateAppConnectionDTO)
                      .catch((error: unknown) => {
                        throw new Error(errorMessage(error));
                      });
                    saved(`${preset.name} connection added`);
                    close();
                  }}
                />
              </Stack>
            ) : (
              <AppPicker projectType={projectType} onPick={setSelected} />
            )}
          </SheetBody>
          {preset && (
            <SheetFooter>
              <Button variant="primary" type="submit" form={formId} loading={pending}>
                {submitLabel}
              </Button>
              <Button variant="outline" onClick={() => request(close)} disabled={pending}>
                Cancel
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        title="Discard connection setup?"
        description="Your progress configuring this connection will be lost."
      />
    </>
  );
};

const detailsSchema = genericAppConnectionFieldsSchema.pick({ name: true, description: true });

export const EditConnectionDetailsDialog = ({
  connection,
  onClose
}: {
  connection: TAppConnection;
  onClose: () => void;
}) => {
  const updateConnection = useV4Adapter("integrations").useUpdateConnection();
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
            noValidate
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
                  description: parsed.data.description || null
                });
                saved(`${appName(connection.app)} connection updated`);
                onClose();
              } catch (error) {
                failed("Couldn't update this connection", error);
                setPending(false);
              }
            }}
          >
            <Stack gap={16}>
              <Field
                label="Name"
                description="Lowercase letters, numbers and dashes."
                error={issues?.name?.[0]}
              >
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

const CredentialField = ({
  control,
  spec
}: {
  control: Control<FieldValues>;
  spec: AppConnectionFieldPreset;
}) => (
  <Controller
    control={control}
    name={spec.name}
    render={({ field, formState }) => {
      const error: string | undefined = get(formState.errors, spec.name)?.message;
      if (spec.kind === "switch")
        return (
          <Switch
            ref={field.ref}
            label={spec.label}
            description={spec.description}
            checked={Boolean(field.value)}
            onCheckedChange={field.onChange}
          />
        );
      const text = field.value === undefined || field.value === null ? "" : String(field.value);
      let input: React.ReactNode;
      if (spec.kind === "secret")
        input = (
          <SecretInput
            ref={field.ref}
            value={text}
            onChange={field.onChange}
            onBlur={field.onBlur}
            invalid={Boolean(error)}
            placeholder={spec.placeholder}
            autoComplete="new-password"
          />
        );
      else if (spec.kind === "textarea")
        input = (
          <Textarea
            ref={field.ref}
            value={text}
            onChange={field.onChange}
            onBlur={field.onBlur}
            placeholder={spec.placeholder}
          />
        );
      else if (spec.kind === "select")
        input = (
          <Select
            label={spec.label}
            options={spec.options ?? []}
            value={text}
            onValueChange={field.onChange}
            invalid={Boolean(error)}
          />
        );
      else
        input = (
          <Input
            ref={field.ref}
            type={spec.kind === "number" ? "number" : "text"}
            mono={spec.mono}
            value={text}
            onChange={field.onChange}
            onBlur={field.onBlur}
            invalid={Boolean(error)}
            placeholder={spec.placeholder}
          />
        );
      return (
        <Field
          label={spec.label}
          description={spec.description}
          optional={spec.optional}
          error={error}
        >
          {input}
        </Field>
      );
    }}
  />
);

const storedCredentials = (row: TAppConnection, keys: readonly string[]) => {
  const stored = (row.credentials ?? {}) as Record<string, unknown>;
  return Object.fromEntries(
    keys
      .filter((key) => stored[key] !== undefined && stored[key] !== null)
      .map((key) => [key, stored[key]])
  );
};

const CredentialsForm = ({
  connection,
  preset,
  method,
  onClose
}: {
  connection: TAppConnection;
  preset: AppConnectionPreset;
  method: AppConnectionMethodPreset;
  onClose: () => void;
}) => {
  const updateConnection = useV4Adapter("integrations").useUpdateConnection();
  const formId = useId();
  const [failure, setFailure] = useState("");
  const form = useForm<FieldValues>({
    resolver: zodResolver(preset.schema),
    defaultValues: {
      ...preset.values,
      app: preset.app,
      name: connection.name,
      description: connection.description ?? "",
      method: method.value,
      credentials: {
        ...method.credentials,
        ...storedCredentials(connection, Object.keys(method.credentials))
      }
    }
  });
  const values = useWatch({ control: form.control });
  const pending = form.formState.isSubmitting;
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: form.formState.isDirty,
    onDiscard: onClose
  });
  const submit = form.handleSubmit(async (submitted) => {
    setFailure("");
    try {
      await updateConnection.mutateAsync({
        connectionId: connection.id,
        app: connection.app,
        credentials: submitted.credentials
      });
      saved(`${connection.name} credentials updated`);
      onClose();
    } catch (error) {
      setFailure(errorMessage(error) ?? "Couldn't update these credentials. Try again.");
    }
  });
  return (
    <>
      <Sheet open onOpenChange={(next) => !next && requestDiscard()}>
        <SheetContent size="md" pending={pending}>
          <SheetHeader>
            <SheetTitle>Edit {connection.name} credentials</SheetTitle>
            <SheetDescription>{method.label}</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <form id={formId} noValidate onSubmit={submit}>
              <FieldSet disabled={pending}>
                {method.fields
                  .filter((spec) => spec.visible?.(values) ?? true)
                  .map((spec) => (
                    <CredentialField key={spec.name} control={form.control} spec={spec} />
                  ))}
                {failure && (
                  <Alert variant="destructive">
                    <AlertDescription>{failure}</AlertDescription>
                  </Alert>
                )}
              </FieldSet>
            </form>
          </SheetBody>
          <SheetFooter>
            <Button variant="primary" type="submit" form={formId} loading={pending}>
              Update credentials
            </Button>
            <Button variant="outline" onClick={requestDiscard} disabled={pending}>
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your changes to these credentials will be lost."
      />
    </>
  );
};

const credentialValue = (value: unknown) => {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
};

const ViewCredentialsSheet = ({
  connection,
  onClose
}: {
  connection: TAppConnection;
  onClose: () => void;
}) => {
  const labels = new Map(
    (methodPreset(connection)?.fields ?? []).map((spec) => [
      spec.name.replace(/^credentials\./, ""),
      spec.label
    ])
  );
  const entries = Object.entries((connection.credentials ?? {}) as Record<string, unknown>).filter(
    ([, value]) => value !== undefined && value !== null && value !== ""
  );
  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent size="md">
        <SheetHeader>
          <SheetTitle>{connection.name} credentials</SheetTitle>
          <SheetDescription>{methodName(connection)}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <Stack gap={16}>
            <Alert tone="info" title="Platform managed credentials">
              Infisical manages these credentials, so they can&apos;t be edited or shown in full.
            </Alert>
            {entries.length > 0 && (
              <DataList
                variant="props"
                items={entries.map(([key, value]) => [
                  labels.get(key) ?? key,
                  <code key={key}>{credentialValue(value)}</code>
                ])}
              />
            )}
          </Stack>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

/** Edit credentials for a preset method, or view them when Infisical manages them. */
export const ConnectionCredentialsSheet = ({
  connection,
  onClose
}: {
  connection: TAppConnection;
  onClose: () => void;
}) => {
  if (connection.isPlatformManagedCredentials)
    return <ViewCredentialsSheet connection={connection} onClose={onClose} />;
  const preset = CONNECTION_PRESETS[connection.app];
  const method = methodPreset(connection);
  if (!preset || !method || method.redirect) return null;
  return (
    <CredentialsForm connection={connection} preset={preset} method={method} onClose={onClose} />
  );
};

export const DeleteConnectionDialog = ({
  connection,
  onClose
}: {
  connection: TAppConnection;
  onClose: () => void;
}) => {
  const deleteConnection = useV4Adapter("integrations").useDeleteConnection();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent tone="danger" confirmText={connection.name} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {connection.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Anything that uses this connection stops working. You can&apos;t undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {connection.isPlatformManagedCredentials && (
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
              setPending(true);
              try {
                await deleteConnection.mutateAsync({
                  connectionId: connection.id,
                  app: connection.app
                });
                saved(`${connection.name} deleted`);
                onClose();
              } catch (error) {
                failed("Couldn't delete this connection", error);
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
