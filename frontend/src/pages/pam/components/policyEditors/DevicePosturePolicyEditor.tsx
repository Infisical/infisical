import { useId } from "react";
import { InfoIcon, PlusIcon, XIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  Combobox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  IconButton,
  Input
} from "@app/components/v3";
import { useProject } from "@app/context";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  PamDevicePostureCheck,
  PamDevicePostureProvider,
  TPamDevicePosturePolicy,
  TPamDevicePostureProviderConfig,
  TPamRipplingPostureProvider
} from "@app/hooks/api/pam";
import { useOrgConnectionCreation } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/useOrgConnectionCreation";

import { DisabledReason } from "../auto-approval/AutoApprovalLabels";
import { PolicyEditorProps } from "./types";

const DEFAULT_CHECK_IN_HOURS = 24;
const MAX_CHECK_IN_HOURS = 720;

enum ProviderKind {
  Mdm = "MDM"
}

const PROVIDERS: Record<
  PamDevicePostureProvider,
  {
    app: AppConnection.Rippling;
    kind: ProviderKind;
    requirement: string;
    create: () => TPamDevicePostureProviderConfig;
  }
> = {
  [PamDevicePostureProvider.Rippling]: {
    app: AppConnection.Rippling,
    kind: ProviderKind.Mdm,
    requirement:
      "The device must be managed by Rippling, assigned to the requesting user, and not locked, lost, or wiped.",
    create: () => ({
      provider: PamDevicePostureProvider.Rippling,
      connectionId: "",
      checks: {
        [PamDevicePostureCheck.DiskEncrypted]: true,
        [PamDevicePostureCheck.NoPendingOsUpdate]: false,
        [PamDevicePostureCheck.MinimumOsVersion]: null,
        [PamDevicePostureCheck.RecentCheckIn]: { maxHours: DEFAULT_CHECK_IN_HOURS }
      }
    })
  }
};

const parseValue = (value: unknown): TPamDevicePosturePolicy | null => {
  if (!value || typeof value !== "object") return null;
  const policy = value as Partial<TPamDevicePosturePolicy>;
  return { providers: Array.isArray(policy.providers) ? policy.providers : [] };
};

const CheckRow = ({
  id,
  title,
  description,
  isChecked,
  onCheckedChange,
  children
}: {
  id: string;
  title: string;
  description: string;
  isChecked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  children?: React.ReactNode;
}) => (
  <div className="flex gap-3">
    <Checkbox
      id={id}
      variant="project"
      isChecked={isChecked}
      onCheckedChange={(checked) => onCheckedChange?.(checked === true)}
      className="mt-0.5"
    />
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <label htmlFor={id} className="flex flex-col gap-0.5">
        <span className="text-sm text-foreground">{title}</span>
        <span className="text-xs text-muted">{description}</span>
      </label>
      {isChecked && children}
    </div>
  </div>
);

const RecentCheckInRow = ({
  id,
  description,
  value,
  onChange
}: {
  id: string;
  description: string;
  value: { maxHours: number } | null;
  onChange: (next: { maxHours: number } | null) => void;
}) => (
  <CheckRow
    id={id}
    title="Recent Check-In"
    description={description}
    isChecked={value !== null}
    onCheckedChange={(checked) => onChange(checked ? { maxHours: DEFAULT_CHECK_IN_HOURS } : null)}
  >
    <Field orientation="horizontal" className="items-center! gap-2">
      <FieldLabel htmlFor={`${id}-hours`} className="shrink-0">
        Within
      </FieldLabel>
      <Input
        id={`${id}-hours`}
        type="number"
        min={1}
        max={MAX_CHECK_IN_HOURS}
        className="w-24"
        value={value?.maxHours ?? DEFAULT_CHECK_IN_HOURS}
        onChange={(e) =>
          onChange({
            maxHours: Math.min(MAX_CHECK_IN_HOURS, Number(e.target.value) || DEFAULT_CHECK_IN_HOURS)
          })
        }
      />
      <span className="text-sm text-muted">hours</span>
    </Field>
  </CheckRow>
);

const RipplingChecks = ({
  idPrefix,
  config,
  onChange
}: {
  idPrefix: string;
  config: TPamRipplingPostureProvider;
  onChange: (next: TPamRipplingPostureProvider) => void;
}) => {
  const updateChecks = (next: Partial<TPamRipplingPostureProvider["checks"]>) =>
    onChange({ ...config, checks: { ...config.checks, ...next } });
  const minOs = config.checks[PamDevicePostureCheck.MinimumOsVersion];

  return (
    <>
      <CheckRow
        id={`${idPrefix}-rippling-disk-encrypted`}
        title="Disk Encrypted"
        description="FileVault or BitLocker is on."
        isChecked={config.checks[PamDevicePostureCheck.DiskEncrypted]}
        onCheckedChange={(checked) =>
          updateChecks({ [PamDevicePostureCheck.DiskEncrypted]: checked })
        }
      />
      <CheckRow
        id={`${idPrefix}-rippling-min-os`}
        title="Minimum OS Version"
        description="Devices below these versions are denied. Leave a platform empty to allow any version."
        isChecked={minOs !== null}
        onCheckedChange={(checked) =>
          updateChecks({
            [PamDevicePostureCheck.MinimumOsVersion]: checked ? { macos: "15.0" } : null
          })
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-rippling-min-macos`}>macOS</FieldLabel>
            <Input
              id={`${idPrefix}-rippling-min-macos`}
              placeholder="15.0"
              value={minOs?.macos ?? ""}
              onChange={(e) =>
                updateChecks({
                  [PamDevicePostureCheck.MinimumOsVersion]: { ...minOs, macos: e.target.value }
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-rippling-min-windows`}>Windows</FieldLabel>
            <Input
              id={`${idPrefix}-rippling-min-windows`}
              placeholder="10.0.22631"
              value={minOs?.windows ?? ""}
              onChange={(e) =>
                updateChecks({
                  [PamDevicePostureCheck.MinimumOsVersion]: { ...minOs, windows: e.target.value }
                })
              }
            />
          </Field>
        </div>
      </CheckRow>
      <CheckRow
        id={`${idPrefix}-rippling-no-pending-update`}
        title="No Pending OS Update"
        description="Rippling has no queued OS update for the device."
        isChecked={config.checks[PamDevicePostureCheck.NoPendingOsUpdate]}
        onCheckedChange={(checked) =>
          updateChecks({ [PamDevicePostureCheck.NoPendingOsUpdate]: checked })
        }
      />
      <RecentCheckInRow
        id={`${idPrefix}-rippling-check-in`}
        description="The device reported to Rippling recently, so its status is current."
        value={config.checks[PamDevicePostureCheck.RecentCheckIn]}
        onChange={(next) => updateChecks({ [PamDevicePostureCheck.RecentCheckIn]: next })}
      />
    </>
  );
};

const ProviderCard = ({
  config,
  onChange,
  onRemove
}: {
  config: TPamDevicePostureProviderConfig;
  onChange: (next: TPamDevicePostureProviderConfig) => void;
  onRemove: () => void;
}) => {
  const idPrefix = useId();
  const { currentProject } = useProject();
  const { app, kind, requirement } = PROVIDERS[config.provider];
  const { name, image } = APP_CONNECTION_MAP[app];
  const { data: connections = [], isPending } = useListAvailableAppConnections(
    app,
    currentProject.id
  );
  const connectionCreation = useOrgConnectionCreation<TAvailableAppConnection>(app, (connection) =>
    onChange({ ...config, connectionId: connection.id })
  );

  return (
    <div className="flex flex-col gap-5 rounded-md border border-border p-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <img src={`/images/integrations/${image}`} alt="" className="size-5 rounded-sm" />
          <span className="text-sm font-medium text-foreground">{name}</span>
          <Badge variant="outline">{kind}</Badge>
          <IconButton
            variant="ghost"
            size="xs"
            aria-label={`Remove ${name}`}
            className="ml-auto text-muted hover:text-danger"
            onClick={onRemove}
          >
            <XIcon className="size-4" />
          </IconButton>
        </div>
        <p className="text-xs text-muted">{requirement}</p>
      </div>

      <Field>
        <FieldLabel>Connection</FieldLabel>
        <Combobox
          modal
          isClearable={false}
          aria-label={`${name} connection`}
          isLoading={isPending}
          isError={!config.connectionId}
          value={connections.find((connection) => connection.id === config.connectionId) ?? null}
          onValueChange={(connection) => onChange({ ...config, connectionId: connection.id })}
          options={connections}
          placeholder="Select a connection..."
          getOptionLabel={(connection) => connection.name}
          getOptionValue={(connection) => connection.id}
          creation={connectionCreation}
        />
        <FieldDescription>
          Infisical uses this connection to look up the device in {name}.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Checks</FieldLabel>
        <div className="flex flex-col gap-4">
          <RipplingChecks idPrefix={idPrefix} config={config} onChange={onChange} />
        </div>
      </Field>
    </div>
  );
};

export const AddDevicePostureProviderMenu = ({
  providers,
  onAdd,
  align = "end",
  variant = "outline"
}: {
  providers: TPamDevicePostureProviderConfig[];
  onAdd: (config: TPamDevicePostureProviderConfig) => void;
  align?: "start" | "end";
  variant?: "outline" | "ghost";
}) => {
  const available = Object.values(PamDevicePostureProvider).filter(
    (provider) => !providers.some((p) => p.provider === provider)
  );

  return (
    <DisabledReason
      reason={available.length === 0 ? "Every provider is already added." : undefined}
    >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild disabled={available.length === 0}>
          <Button type="button" variant={variant} size="sm">
            <PlusIcon />
            Add Provider
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align}>
          {available.map((provider) => {
            const { app, kind } = PROVIDERS[provider];
            const { name, image } = APP_CONNECTION_MAP[app];
            return (
              <DropdownMenuItem key={provider} onClick={() => onAdd(PROVIDERS[provider].create())}>
                <img src={`/images/integrations/${image}`} alt="" className="size-4 rounded-sm" />
                {name}
                <span className="ml-auto text-xs text-muted">{kind}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </DisabledReason>
  );
};

export const DevicePostureProviderList = ({
  providers,
  onChange
}: {
  providers: TPamDevicePostureProviderConfig[];
  onChange: (next: TPamDevicePostureProviderConfig[]) => void;
}) => {
  return (
    <div className="flex flex-col gap-3">
      {providers.map((config, index) => (
        <ProviderCard
          key={config.provider}
          config={config}
          onChange={(next) => onChange(providers.map((p, i) => (i === index ? next : p)))}
          onRemove={() => onChange(providers.filter((_, i) => i !== index))}
        />
      ))}
    </div>
  );
};

export const getDevicePosturePolicyError = (policy?: TPamDevicePosturePolicy | null) => {
  if (!policy?.providers.length) return "Add a device posture provider";
  if (policy.providers.some((p) => !p.connectionId)) return "Choose a connection for each provider";
  return null;
};

export const DevicePosturePolicyEditor = ({
  label,
  description,
  value,
  onChange
}: PolicyEditorProps) => {
  const providers = parseValue(value)?.providers ?? [];

  const setProviders = (next: TPamDevicePostureProviderConfig[]) =>
    onChange(next.length > 0 ? { providers: next } : null);

  return (
    <Field>
      <div className="flex items-start justify-between gap-4">
        <FieldContent>
          <FieldTitle>{label}</FieldTitle>
          <FieldDescription>{description}</FieldDescription>
        </FieldContent>
        <AddDevicePostureProviderMenu
          providers={providers}
          onAdd={(config) => setProviders([...providers, config])}
        />
      </div>

      {providers.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted">
          No device posture providers added. Devices aren&apos;t checked.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <DevicePostureProviderList providers={providers} onChange={setProviders} />
          <Alert variant="info">
            <InfoIcon />
            <AlertDescription>
              The device must pass the checks of every provider above. Checked when an access
              request is submitted, a session starts, or credentials are revealed. Browser sessions
              verify the device through the Infisical CLI. Machine identities can&apos;t use
              accounts with this policy.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </Field>
  );
};
