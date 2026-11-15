import { useId, useRef, useState } from "react";
import {
  type Control,
  Controller,
  type FieldValues,
  get,
  useForm,
  useWatch
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert, AlertDescription } from "@infisical/cipher/ui/alert";
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
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field, FieldSet } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList, List, ListRow } from "@infisical/cipher/ui/list";
import { Loader } from "@infisical/cipher/ui/loader";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { Select } from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Switch } from "@infisical/cipher/ui/switch";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { formatDistanceToNowStrict } from "date-fns";

import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection, TCreateAppConnectionDTO } from "@app/hooks/api/appConnections/types";
import { AppConnectionCredentialRotationStatus } from "@app/hooks/api/appConnections/types/root-connection-enums";
import type { ProjectType } from "@app/hooks/api/projects/types";
import { genericAppConnectionFieldsSchema } from "@app/lib/schemas/app-connections";
import {
  AppConnectionForm,
  type AppConnectionFieldPreset,
  type AppConnectionFormHandle,
  type AppConnectionFormValues,
  type AppConnectionMethodPreset,
  type AppConnectionPreset
} from "@app/pages/v4/components/app-connection-form";

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
  useConnectionPreset,
  useRotationConfirmation
} from "./app-connection-extras";
import {
  appName,
  credentialsBlock,
  federatedCredentialOf,
  isManagedIdentity,
  methodName,
  methodPreset,
  NOT_IN_V4,
  storedScopes
} from "./app-connection-model";
import {
  clearDeletedGitHubApp,
  gitHubInstanceOf,
  hasResumedGitHubForm,
  useGitHubAppCreation,
  useResumedGitHubForm
} from "./github-app-model";
import { GitHubAppsField } from "./github-apps";

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

/** The Azure managed identity step after creating the connection: verify it, or close and verify later. */
const VerifyConnectionStep = ({
  connection,
  pending,
  onPendingChange,
  onClose
}: {
  connection: TAppConnection;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onClose: () => void;
}) => {
  const updateConnection = useV4Adapter("integrations").useUpdateConnection();
  const [failure, setFailure] = useState("");
  const verify = async () => {
    const { tenantId, clientId } = connection.credentials as { tenantId: string; clientId: string };
    setFailure("");
    onPendingChange(true);
    try {
      await updateConnection.mutateAsync({
        connectionId: connection.id,
        app: connection.app,
        credentials: { tenantId, clientId } as TAppConnection["credentials"]
      });
      saved(`${connection.name} verified`);
      onClose();
    } catch (error) {
      setFailure(errorMessage(error) ?? "Couldn't verify this connection. Try again.");
    } finally {
      onPendingChange(false);
    }
  };
  return (
    <>
      <SheetBody>
        <Stack gap={16}>
          <FederatedCredentialDetails credential={federatedCredentialOf(connection)} />
          {failure && (
            <Alert variant="destructive">
              <AlertDescription>{failure}</AlertDescription>
            </Alert>
          )}
        </Stack>
      </SheetBody>
      <SheetFooter>
        <Button variant="primary" loading={pending} onClick={verify}>
          {failure ? "Retry verification" : "Verify connection"}
        </Button>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Close
        </Button>
      </SheetFooter>
    </>
  );
};

type GatewayState = {
  support: NonNullable<ReturnType<typeof useGatewaySupport>>;
  value: GatewayPickerValue;
  error?: string;
  onChange: (next: GatewayPickerValue) => void;
};

/** The fields a few apps add under the method's own: Databricks scopes, GitHub Apps and a gateway. */
const ConnectionExtras = ({
  app,
  scopes,
  onScopesChange,
  gateway,
  gitHubApps,
  pending
}: {
  app: AppConnection;
  scopes: string[];
  onScopesChange: (scopes: string[]) => void;
  gateway?: GatewayState;
  gitHubApps?: Pick<
    React.ComponentProps<typeof GitHubAppsField>,
    "projectId" | "readInstance" | "onCreate" | "onDeleted"
  >;
  pending: boolean;
}) => (
  <>
    {app === AppConnection.Databricks && (
      <DatabricksScopesField value={scopes} onChange={onScopesChange} disabled={pending} />
    )}
    {app === AppConnection.GitHub && gitHubApps && (
      <GitHubAppsField
        {...gitHubApps}
        throughGateway={Boolean(gateway?.value.gatewayId || gateway?.value.gatewayPoolId)}
        disabled={pending}
      />
    )}
    {gateway && (
      <GatewayField
        support={gateway.support}
        value={gateway.value}
        disabled={pending}
        error={gateway.error}
        onChange={gateway.onChange}
      />
    )}
  </>
);

/** Creates a connection from a preset's form values, or undefined when the person backs out. */
const usePresetCreation = (projectId?: string) => {
  const createConnection = useV4Adapter("integrations").useCreateConnection();
  const rotation = useRotationConfirmation();
  const create = async ({
    name,
    values,
    gateway,
    scopes,
    onGatewayMissing
  }: {
    name: string;
    values: AppConnectionFormValues;
    gateway: { support: ReturnType<typeof useGatewaySupport>; value: GatewayPickerValue };
    scopes: string[];
    onGatewayMissing: () => void;
  }) => {
    if (gatewayMissing(gateway.support, gateway.value)) {
      onGatewayMissing();
      throw new Error(`${name} is only reachable through a gateway.`);
    }
    if (values.isAutoRotationEnabled && !(await rotation.confirm())) return undefined;
    return createConnection
      .mutateAsync({
        ...values,
        credentials: { ...values.credentials, ...scopesPayload(scopes) },
        ...(gateway.support ? gateway.value : {}),
        projectId
      } as TCreateAppConnectionDTO)
      .catch((error: unknown) => {
        throw new Error(errorMessage(error));
      });
  };
  return { create, dialog: rotation.dialog };
};

const addSheetTitle = (created?: TAppConnection, preset?: AppConnectionPreset) => {
  if (created) return `Set up ${created.name}`;
  return preset ? `Add ${preset.name} connection` : "Add connection";
};

/** The chosen app's form, with the fields some apps add and their own gateway and scope state. */
const PresetStep = ({
  preset,
  formId,
  returnTo,
  projectId,
  option,
  resumeApp,
  pending,
  onDirtyChange,
  onExtrasChange,
  onPendingChange,
  onSubmitLabelChange,
  onCreated,
  onDone
}: {
  preset: AppConnectionPreset;
  formId: string;
  returnTo: string;
  projectId?: string;
  option?: Record<string, unknown>;
  resumeApp?: AppConnection;
  pending: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onExtrasChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
  onSubmitLabelChange: (label: string) => void;
  onCreated: (connection: TAppConnection) => void;
  onDone: () => void;
}) => {
  const app = preset.app as AppConnection;
  const formHandle = useRef<AppConnectionFormHandle>(null);
  const resumed = useResumedGitHubForm(resumeApp);
  const [initialGateway] = useState<GatewayPickerValue>(() => resumed?.gateway ?? NO_GATEWAY);
  const [gateway, setGateway] = useState(initialGateway);
  const isGatewayChanged = (next: GatewayPickerValue) =>
    next.gatewayId !== initialGateway.gatewayId ||
    next.gatewayPoolId !== initialGateway.gatewayPoolId;
  const [gatewayError, setGatewayError] = useState<string>();
  const [scopes, setScopes] = useState<string[]>([]);
  const creation = usePresetCreation(projectId);
  const gatewaySupport = useGatewaySupport(app);
  const createGitHubApp = useGitHubAppCreation({
    formHandle,
    gateway: gatewaySupport ? gateway : undefined,
    projectId,
    returnTo
  });
  return (
    <>
      <AppConnectionForm
        id={formId}
        preset={preset}
        handleRef={formHandle}
        initialValues={resumed?.values}
        redirect={connectionRedirect({
          returnTo,
          projectId,
          option,
          extras: gatewaySupport ? gateway : {}
        })}
        onDirtyChange={onDirtyChange}
        onPendingChange={onPendingChange}
        onSubmitLabelChange={onSubmitLabelChange}
        onSubmit={async (values: AppConnectionFormValues) => {
          const connection = await creation.create({
            name: preset.name,
            values,
            gateway: { support: gatewaySupport, value: gateway },
            scopes,
            onGatewayMissing: () => setGatewayError(GATEWAY_REQUIRED)
          });
          if (!connection) return;
          if (isManagedIdentity(connection)) {
            onCreated(connection);
            return;
          }
          saved(`${preset.name} connection added`);
          onDone();
        }}
      />
      <ConnectionExtras
        app={app}
        scopes={scopes}
        onScopesChange={(next) => {
          setScopes(next);
          onExtrasChange(next.length > 0 || isGatewayChanged(gateway));
        }}
        gateway={
          gatewaySupport && {
            support: gatewaySupport,
            value: gateway,
            error: gatewayError,
            onChange: (next) => {
              setGateway(next);
              setGatewayError(undefined);
              onExtrasChange(scopes.length > 0 || isGatewayChanged(next));
            }
          }
        }
        gitHubApps={{
          projectId,
          onCreate: createGitHubApp,
          readInstance: () => gitHubInstanceOf(formHandle.current),
          onDeleted: (appId) => clearDeletedGitHubApp(formHandle.current, preset, appId)
        }}
        pending={pending}
      />
      {creation.dialog}
    </>
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
  const { data: options = [] } = useV4Adapter("integrations").useConnectionOptions(projectType);
  const formId = useId();
  const [selected, setSelected] = useState(app);
  const [dirty, setDirty] = useState(false);
  const [extrasDirty, setExtrasDirty] = useState(() => hasResumedGitHubForm(app));
  const [pending, setPending] = useState(false);
  const [submitLabel, setSubmitLabel] = useState("Create connection");
  const discardAction = useRef<() => void>(() => undefined);
  const [created, setCreated] = useState<TAppConnection>();
  const { preset, loading } = useConnectionPreset(selected, projectId);
  const option = options.find((entry) => entry.app === selected);

  const pick = (next: AppConnection | undefined) => {
    setDirty(false);
    setExtrasDirty(false);
    setSelected(next);
  };
  const close = () => {
    pick(undefined);
    setCreated(undefined);
    onOpenChange(false);
  };
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: !created && (dirty || extrasDirty),
    onDiscard: () => discardAction.current()
  });
  const request = (action: () => void) => {
    discardAction.current = action;
    requestDiscard();
  };
  const showForm = !created && preset && !loading;

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : request(close))}>
        <SheetContent size="md" pending={pending}>
          <SheetHeader>
            <SheetTitle>{addSheetTitle(created, preset)}</SheetTitle>
          </SheetHeader>
          {created && (
            <VerifyConnectionStep
              connection={created}
              pending={pending}
              onPendingChange={setPending}
              onClose={close}
            />
          )}
          {!created && !preset && (
            <SheetBody>
              {selected && loading ? (
                <Loader label="Loading" />
              ) : (
                <AppPicker projectType={projectType} onPick={pick} />
              )}
            </SheetBody>
          )}
          {showForm && (
            <>
              <SheetBody>
                <Stack gap={16}>
                  {!app && (
                    <Inline>
                      <Button
                        variant="outline"
                        size="sm"
                        icon="chev-left"
                        disabled={pending}
                        onClick={() => request(() => pick(undefined))}
                      >
                        Choose another app
                      </Button>
                    </Inline>
                  )}
                  <PresetStep
                    key={preset.app}
                    preset={preset}
                    formId={formId}
                    returnTo={returnTo}
                    projectId={projectId}
                    option={option as Record<string, unknown> | undefined}
                    resumeApp={app}
                    pending={pending}
                    onDirtyChange={setDirty}
                    onExtrasChange={setExtrasDirty}
                    onPendingChange={setPending}
                    onSubmitLabelChange={setSubmitLabel}
                    onCreated={(connection) => {
                      setDirty(false);
                      setPending(false);
                      setCreated(connection);
                    }}
                    onDone={close}
                  />
                </Stack>
              </SheetBody>
              <SheetFooter>
                <Button variant="primary" type="submit" form={formId} loading={pending}>
                  {submitLabel}
                </Button>
                <Button variant="outline" onClick={() => request(close)} disabled={pending}>
                  Cancel
                </Button>
              </SheetFooter>
            </>
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
              } finally {
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

const credentialsDefaults = ({
  preset,
  method,
  connection,
  hasRotation,
  schedule,
  initialRotateAt
}: {
  preset: AppConnectionPreset;
  method: AppConnectionMethodPreset;
  connection: TAppConnection;
  hasRotation: boolean;
  schedule: unknown;
  initialRotateAt: unknown;
}): FieldValues => ({
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
});

const isGitHubAppGone = (connection: TAppConnection, method: AppConnectionMethodPreset) => {
  const stored = (connection.credentials as { gitHubAppId?: string | null } | undefined)
    ?.gitHubAppId;
  if (!stored) return false;
  return !method.fields
    .find((spec) => spec.name === "credentials.gitHubAppId")
    ?.options?.some((entry) => entry.value === stored);
};

/** Sends the person to the provider to reconnect, or returns why it can't. */
const startReconnect = ({
  connection,
  method,
  href,
  credentials,
  reconnect,
  gateway
}: {
  connection: TAppConnection;
  method: AppConnectionMethodPreset;
  href?: string;
  credentials: Record<string, unknown>;
  reconnect: ReconnectTarget;
  gateway: GatewayPickerValue | Record<string, never>;
}) => {
  if (isGitHubAppGone(connection, method))
    return "The GitHub App this connection was created with is no longer available, so it can't be reconnected.";
  if (!href) return method.redirect?.unconfigured;
  startConnectionRedirect(href, {
    app: connection.app,
    method: method.value,
    name: connection.name,
    description: connection.description,
    credentials,
    projectId: reconnect.projectId,
    returnTo: reconnect.returnTo,
    connectionId: connection.id,
    ...gateway
  });
  return undefined;
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
    defaultValues: credentialsDefaults({
      preset,
      method,
      connection,
      hasRotation,
      schedule,
      initialRotateAt
    })
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
      const reconnectFailure = startReconnect({
        connection,
        method,
        href: redirect.href({ values: submitted, option }),
        credentials: submitted.credentials ?? {},
        reconnect,
        gateway: gatewayValues
      });
      if (reconnectFailure) setFailure(reconnectFailure);
      else setRedirecting(true);
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
                {managedIdentity && (
                  <FederatedCredentialDetails credential={federatedCredentialOf(connection)} />
                )}
                <ConnectionExtras
                  app={connection.app}
                  scopes={scopes}
                  onScopesChange={setScopes}
                  gateway={
                    gatewaySupport && {
                      support: gatewaySupport,
                      value: gateway,
                      error: gatewayError,
                      onChange: (next) => {
                        setGateway(next);
                        setGatewayError(undefined);
                      }
                    }
                  }
                  pending={pending}
                />
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
