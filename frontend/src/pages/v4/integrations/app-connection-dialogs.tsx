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
import { Loader } from "@app/components/v4/ui/loader";
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
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";
import { AppConnectionCredentialRotationStatus } from "@app/hooks/api/appConnections/types/root-connection-enums";
import type { ProjectType } from "@app/hooks/api/projects/types";
import { genericAppConnectionFieldsSchema } from "@app/lib/schemas/app-connections";

import { useOrgId, useOrgPermission } from "../access/permissions";
import { errorMessage, failed, saved } from "../access/toast";
import { useV4Adapter } from "../data/adapters";
import { CONNECTION_GATEWAYS, CONNECTION_PRESETS } from "../data/integrations/connection-presets";
import {
  connectionRedirect,
  startConnectionRedirect
} from "../data/integrations/connection-redirect";
import { rotateAtLocal, rotateAtOptions } from "../data/integrations/presets/shared";
import { GatewayPicker, type GatewayPickerValue } from "../networking/gateway-picker";
import { AppLogo } from "../organization/IntegrationsPage/AppLogo";
import {
  DatabricksScopesField,
  FederatedCredentialDetails,
  federatedCredentialOf,
  isManagedIdentity,
  storedScopes,
  useConnectionPreset,
  useRotationConfirmation
} from "./app-connection-extras";

export const NOT_IN_V4 = "Not in v4 yet";

export const appName = (app: AppConnection) => APP_CONNECTION_MAP[app].name;
export const methodName = (row: TAppConnection) => getAppConnectionMethodDetails(row.method).name;

const methodPreset = (row: TAppConnection) =>
  CONNECTION_PRESETS[row.app]?.methods.find((entry) => entry.value === row.method);

/** Why the credentials sheet can't open for this connection in v4, or undefined when it can. */
export const credentialsBlock = (row: TAppConnection) =>
  row.isPlatformManagedCredentials || methodPreset(row) ? undefined : NOT_IN_V4;

const scopesPayload = (scopes: string[]) => (scopes.length ? { scopes } : {});

const NO_GATEWAY: GatewayPickerValue = { gatewayId: null, gatewayPoolId: null };
const GATEWAY_REQUIRED = "Select a gateway";

/** The gateway field for an app whose v3 form offers one, while the plan includes gateways. */
const useGatewaySupport = (app?: AppConnection) => {
  const orgId = useOrgId();
  const { data: subscription } = useV4Adapter("networking").useSubscription(orgId);
  const { permission } = useOrgPermission();
  const mode = app ? CONNECTION_GATEWAYS[app] : undefined;
  if (!mode || !subscription?.gateway) return undefined;
  return {
    required: mode === "required",
    disabledReason: permission.can(
      OrgGatewayPermissionActions.AttachGateways,
      OrgPermissionSubjects.Gateway
    )
      ? undefined
      : "You don't have permission to attach gateways."
  };
};

type GatewaySupport = NonNullable<ReturnType<typeof useGatewaySupport>>;

const GatewayField = ({
  support,
  value,
  onChange,
  disabled,
  error
}: {
  support: GatewaySupport;
  value: GatewayPickerValue;
  onChange: (value: GatewayPickerValue) => void;
  disabled?: boolean;
  error?: string;
}) => (
  <Field label="Gateway" description={support.disabledReason} error={error}>
    <GatewayPicker
      label="Gateway"
      value={value}
      onChange={onChange}
      required={support.required}
      invalid={Boolean(error)}
      disabled={disabled || Boolean(support.disabledReason)}
    />
  </Field>
);

const gatewayMissing = (support: GatewaySupport | undefined, value: GatewayPickerValue) =>
  Boolean(support?.required && !value.gatewayId && !value.gatewayPoolId);

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
  const updateConnection = integrations.useUpdateConnection();
  const formId = useId();
  const [selected, setSelected] = useState(app);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitLabel, setSubmitLabel] = useState("Create connection");
  const discardAction = useRef<() => void>(() => undefined);
  const [gateway, setGateway] = useState(NO_GATEWAY);
  const [gatewayError, setGatewayError] = useState<string>();
  const [scopes, setScopes] = useState<string[]>([]);
  const [created, setCreated] = useState<TAppConnection>();
  const [verifyFailure, setVerifyFailure] = useState("");
  const { preset, loading } = useConnectionPreset(selected, projectId);
  const rotation = useRotationConfirmation();
  const option = options.find((entry) => entry.app === selected);
  const gatewaySupport = useGatewaySupport(selected);
  const gatewayValues = gatewaySupport ? gateway : {};

  useEffect(() => {
    if (!open) return;
    setSelected(app);
    setDirty(false);
    setCreated(undefined);
  }, [open, app]);

  useEffect(() => {
    setGateway(NO_GATEWAY);
    setGatewayError(undefined);
    setScopes([]);
  }, [selected]);

  const close = () => {
    setDirty(false);
    setSelected(undefined);
    setCreated(undefined);
    setVerifyFailure("");
    onOpenChange(false);
  };
  const back = () => {
    setDirty(false);
    setSelected(undefined);
  };
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: !created && (dirty || gateway !== NO_GATEWAY || scopes.length > 0),
    onDiscard: () => discardAction.current()
  });
  const request = (action: () => void) => {
    discardAction.current = action;
    requestDiscard();
  };
  const verify = async () => {
    if (!created) return;
    const { tenantId, clientId } = created.credentials as { tenantId: string; clientId: string };
    setVerifyFailure("");
    setPending(true);
    try {
      await updateConnection.mutateAsync({
        connectionId: created.id,
        app: created.app,
        credentials: { tenantId, clientId } as TAppConnection["credentials"]
      });
      saved(`${created.name} verified`);
      close();
    } catch (error) {
      setVerifyFailure(errorMessage(error) ?? "Couldn't verify this connection. Try again.");
    } finally {
      setPending(false);
    }
  };

  let body: React.ReactNode = <AppPicker projectType={projectType} onPick={setSelected} />;
  if (created)
    body = (
      <Stack gap={16}>
        <FederatedCredentialDetails credential={federatedCredentialOf(created)} />
        {verifyFailure && (
          <Alert variant="destructive">
            <AlertDescription>{verifyFailure}</AlertDescription>
          </Alert>
        )}
      </Stack>
    );
  else if (selected && loading) body = <Loader label="Loading" />;
  else if (preset)
    body = (
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
            option: option as Record<string, unknown> | undefined,
            extras: gatewayValues
          })}
          onDirtyChange={setDirty}
          onPendingChange={setPending}
          onSubmitLabelChange={setSubmitLabel}
          onSubmit={async (values: AppConnectionFormValues) => {
            if (gatewayMissing(gatewaySupport, gateway)) {
              setGatewayError(GATEWAY_REQUIRED);
              throw new Error(`${preset.name} is only reachable through a gateway.`);
            }
            if (values.isAutoRotationEnabled && !(await rotation.confirm())) return;
            const connection = await createConnection
              .mutateAsync({
                ...values,
                credentials: { ...values.credentials, ...scopesPayload(scopes) },
                ...gatewayValues,
                projectId
              } as TCreateAppConnectionDTO)
              .catch((error: unknown) => {
                throw new Error(errorMessage(error));
              });
            if (isManagedIdentity(connection)) {
              setDirty(false);
              setPending(false);
              setCreated(connection);
              return;
            }
            saved(`${preset.name} connection added`);
            close();
          }}
        />
        {selected === AppConnection.Databricks && (
          <DatabricksScopesField value={scopes} onChange={setScopes} disabled={pending} />
        )}
        {gatewaySupport && (
          <GatewayField
            support={gatewaySupport}
            value={gateway}
            disabled={pending}
            error={gatewayError}
            onChange={(next) => {
              setGateway(next);
              setGatewayError(undefined);
            }}
          />
        )}
      </Stack>
    );

  let title = "Add connection";
  if (created) title = `Set up ${created.name}`;
  else if (preset) title = `Add ${preset.name} connection`;

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : request(close))}>
        <SheetContent size="md" pending={pending}>
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <SheetBody>{body}</SheetBody>
          {created && (
            <SheetFooter>
              <Button variant="primary" loading={pending} onClick={verify}>
                {verifyFailure ? "Retry verification" : "Verify connection"}
              </Button>
              <Button variant="outline" onClick={close} disabled={pending}>
                Close
              </Button>
            </SheetFooter>
          )}
          {!created && preset && !loading && (
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
      {rotation.dialog}
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

const submitLabel = (redirect: AppConnectionMethodPreset["redirect"], managedIdentity: boolean) => {
  if (redirect) return redirect.submitLabel.replace(/^Connect/, "Reconnect");
  return managedIdentity ? "Verify connection" : "Update credentials";
};

type ReconnectTarget = { returnTo: string; projectId?: string; projectType?: ProjectType };

const CredentialsForm = ({
  connection,
  preset,
  method,
  reconnect,
  onClose
}: {
  connection: TAppConnection;
  preset: AppConnectionPreset;
  method: AppConnectionMethodPreset;
  reconnect: ReconnectTarget;
  onClose: () => void;
}) => {
  const integrations = useV4Adapter("integrations");
  const updateConnection = integrations.useUpdateConnection();
  const { data: options = [] } = integrations.useConnectionOptions(reconnect.projectType);
  const option = options.find((entry) => entry.app === connection.app) as
    | Record<string, unknown>
    | undefined;
  const formId = useId();
  const [failure, setFailure] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const initialGateway: GatewayPickerValue = {
    gatewayId: connection.gatewayId ?? null,
    gatewayPoolId: connection.gatewayPoolId ?? null
  };
  const [gateway, setGateway] = useState(initialGateway);
  const [gatewayError, setGatewayError] = useState<string>();
  const gatewaySupport = useGatewaySupport(connection.app);
  const gatewayDirty =
    gateway.gatewayId !== initialGateway.gatewayId ||
    gateway.gatewayPoolId !== initialGateway.gatewayPoolId;
  const initialScopes = storedScopes(connection);
  const [scopes, setScopes] = useState(initialScopes);
  const scopesDirty = scopes.join() !== initialScopes.join();
  const rotation = useRotationConfirmation();
  const hasRotation = method.fields.some((spec) => spec.name === "isAutoRotationEnabled");
  const schedule = {
    rotationInterval: connection.rotation?.rotationInterval ?? 30,
    rotateAtUtc: connection.rotation?.rotateAtUtc ?? { hours: 0, minutes: 0 }
  };
  const initialRotateAt = rotateAtLocal(schedule.rotateAtUtc);
  const managedIdentity = isManagedIdentity(connection);
  const storedGitHubAppId = (connection.credentials as { gitHubAppId?: string | null } | undefined)
    ?.gitHubAppId;
  const gitHubAppGone =
    Boolean(storedGitHubAppId) &&
    !method.fields
      .find((spec) => spec.name === "credentials.gitHubAppId")
      ?.options?.some((entry) => entry.value === storedGitHubAppId);
  const fields = method.fields
    .filter(
      (spec) =>
        spec.name !== "isPlatformManagedCredentials" && spec.name !== "credentials.gitHubAppId"
    )
    .map((spec) =>
      spec.name === "rotateAt" ? { ...spec, options: rotateAtOptions(initialRotateAt) } : spec
    );
  const form = useForm<FieldValues>({
    resolver: zodResolver(preset.schema),
    defaultValues: {
      ...preset.values,
      app: preset.app,
      name: connection.name,
      description: connection.description ?? "",
      method: method.value,
      ...storedCredentials(
        connection,
        method.fields.map((spec) => spec.name).filter((name) => !name.includes("."))
      ),
      credentials: {
        ...method.credentials,
        ...storedCredentials(connection, [
          ...Object.keys(method.credentials),
          ...method.fields
            .filter((spec) => spec.name.startsWith("credentials."))
            .map((spec) => spec.name.slice("credentials.".length))
        ])
      },
      ...(hasRotation && {
        isAutoRotationEnabled: connection.isAutoRotationEnabled ?? false,
        rotation: schedule,
        rotateAt: initialRotateAt
      })
    }
  });
  const values = useWatch({ control: form.control });
  const { redirect } = method;
  const redirectHref = redirect?.href({ values, option });
  const pending = form.formState.isSubmitting || redirecting;
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: form.formState.isDirty || gatewayDirty || scopesDirty,
    onDiscard: onClose
  });
  const submit = form.handleSubmit(async (submitted) => {
    setFailure("");
    if (gatewayMissing(gatewaySupport, gateway)) {
      setGatewayError(GATEWAY_REQUIRED);
      return;
    }
    const gatewayValues = gatewaySupport ? gateway : {};
    if (redirect) {
      if (gitHubAppGone) {
        setFailure(
          "The GitHub App this connection was created with is no longer available, so it can't be reconnected."
        );
        return;
      }
      const href = redirect.href({ values: submitted, option });
      if (!href) {
        setFailure(redirect.unconfigured);
        return;
      }
      setRedirecting(true);
      startConnectionRedirect(href, {
        app: connection.app,
        method: method.value,
        name: connection.name,
        description: connection.description,
        credentials: submitted.credentials ?? {},
        projectId: reconnect.projectId,
        returnTo: reconnect.returnTo,
        connectionId: connection.id,
        ...gatewayValues
      });
      return;
    }
    if (
      hasRotation &&
      submitted.isAutoRotationEnabled &&
      !connection.isAutoRotationEnabled &&
      !(await rotation.confirm())
    )
      return;
    try {
      await updateConnection.mutateAsync({
        connectionId: connection.id,
        app: connection.app,
        credentials: { ...submitted.credentials, ...scopesPayload(scopes) },
        ...gatewayValues,
        ...(hasRotation && {
          isAutoRotationEnabled: submitted.isAutoRotationEnabled,
          rotation: submitted.rotation
        })
      });
      saved(
        managedIdentity ? `${connection.name} verified` : `${connection.name} credentials updated`
      );
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
                {fields
                  .filter((spec) => spec.visible?.(values) ?? true)
                  .map((spec) => (
                    <CredentialField key={spec.name} control={form.control} spec={spec} />
                  ))}
                {connection.app === AppConnection.Databricks && (
                  <DatabricksScopesField value={scopes} onChange={setScopes} disabled={pending} />
                )}
                {managedIdentity && (
                  <FederatedCredentialDetails credential={federatedCredentialOf(connection)} />
                )}
                {gatewaySupport && (
                  <GatewayField
                    support={gatewaySupport}
                    value={gateway}
                    disabled={pending}
                    error={gatewayError}
                    onChange={(next) => {
                      setGateway(next);
                      setGatewayError(undefined);
                    }}
                  />
                )}
                {redirect && !redirectHref && !failure && (
                  <Alert>
                    <AlertDescription>{redirect.unconfigured}</AlertDescription>
                  </Alert>
                )}
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
              {submitLabel(redirect, managedIdentity)}
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
      {rotation.dialog}
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

/**
 * Edit credentials for a preset method, reconnect through the provider for a redirect method, or
 * view them when Infisical manages them. A reconnect returns to returnTo through the v4 callback.
 */
export const ConnectionCredentialsSheet = ({
  connection,
  onClose,
  ...reconnect
}: ReconnectTarget & {
  connection: TAppConnection;
  onClose: () => void;
}) => {
  const { preset, loading } = useConnectionPreset(
    connection.isPlatformManagedCredentials ? undefined : connection.app,
    connection.projectId
  );
  if (connection.isPlatformManagedCredentials)
    return <ViewCredentialsSheet connection={connection} onClose={onClose} />;
  const method = preset?.methods.find((entry) => entry.value === connection.method);
  if (loading || !preset || !method || credentialsBlock(connection)) return null;
  return (
    <CredentialsForm
      connection={connection}
      preset={preset}
      method={method}
      reconnect={reconnect}
      onClose={onClose}
    />
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
