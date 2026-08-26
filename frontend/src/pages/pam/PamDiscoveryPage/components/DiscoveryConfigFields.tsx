import { Control, Controller, useWatch } from "react-hook-form";
import { AlertTriangle } from "lucide-react";
import { z } from "zod";

import {
  Alert,
  AlertDescription,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  TextArea
} from "@app/components/v3";
import {
  PamAccountType,
  PamDiscoverySchedule,
  PamDiscoveryType,
  useListPamAccounts
} from "@app/hooks/api/pam";

export const discoveryConfigFormShape = {
  scanLocalAccounts: z.boolean(),
  discoverDependencies: z.boolean(),
  winrmPort: z.coerce.number().int().min(1).max(65535),
  useWinrmHttps: z.boolean(),
  winrmRejectUnauthorized: z.boolean(),
  winrmCaCert: z.string()
};

export type TDiscoveryConfigFields = z.infer<z.ZodObject<typeof discoveryConfigFormShape>>;

export const DISCOVERY_CONFIG_DEFAULTS: TDiscoveryConfigFields = {
  scanLocalAccounts: true,
  discoverDependencies: false,
  winrmPort: 5985,
  useWinrmHttps: false,
  winrmRejectUnauthorized: true,
  winrmCaCert: ""
};

export const discoveryConfigFromSource = (
  config: Record<string, unknown>
): TDiscoveryConfigFields => ({
  scanLocalAccounts: config.scanLocalAccounts !== false,
  discoverDependencies: Boolean(config.discoverDependencies),
  winrmPort:
    typeof config.winrmPort === "number" ? config.winrmPort : DISCOVERY_CONFIG_DEFAULTS.winrmPort,
  useWinrmHttps: Boolean(config.useWinrmHttps),
  winrmRejectUnauthorized: config.winrmRejectUnauthorized !== false,
  winrmCaCert: typeof config.winrmCaCert === "string" ? config.winrmCaCert : ""
});

export const buildDiscoveryConfiguration = (
  data: TDiscoveryConfigFields
): Record<string, unknown> => ({
  scanLocalAccounts: data.scanLocalAccounts,
  discoverDependencies: data.discoverDependencies,
  winrmPort: data.winrmPort,
  useWinrmHttps: data.useWinrmHttps,
  winrmRejectUnauthorized: data.winrmRejectUnauthorized,
  ...(data.winrmCaCert.trim() ? { winrmCaCert: data.winrmCaCert.trim() } : {})
});

type ToggleName =
  | "scanLocalAccounts"
  | "discoverDependencies"
  | "useWinrmHttps"
  | "winrmRejectUnauthorized";

const ToggleField = ({
  control,
  name,
  label
}: {
  control: Control<TDiscoveryConfigFields>;
  name: ToggleName;
  label: string;
}) => (
  <Controller
    control={control}
    name={name}
    render={({ field }) => (
      <Field>
        <div className="flex items-center justify-between gap-4">
          <FieldLabel htmlFor={name} className="mb-0">
            {label}
          </FieldLabel>
          <Switch id={name} variant="pam" checked={field.value} onCheckedChange={field.onChange} />
        </div>
      </Field>
    )}
  />
);

export const DiscoveryConfigFields = ({
  control
}: {
  control: Control<TDiscoveryConfigFields>;
}) => {
  const scanLocalAccounts = useWatch({ control, name: "scanLocalAccounts" });
  const discoverDependencies = useWatch({ control, name: "discoverDependencies" });
  const useWinrmHttps = useWatch({ control, name: "useWinrmHttps" });

  return (
    <>
      <ToggleField control={control} name="scanLocalAccounts" label="Discover local accounts" />
      <ToggleField
        control={control}
        name="discoverDependencies"
        label="Discover account dependencies"
      />

      {(scanLocalAccounts || discoverDependencies) && (
        <>
          <Controller
            control={control}
            name="winrmPort"
            render={({ field, fieldState }) => (
              <Field>
                <FieldLabel>WinRM Port</FieldLabel>
                <FieldContent>
                  <Input type="number" {...field} isError={!!fieldState.error} />
                  <FieldError>{fieldState.error?.message}</FieldError>
                </FieldContent>
              </Field>
            )}
          />

          <ToggleField control={control} name="useWinrmHttps" label="Use HTTPS" />

          {useWinrmHttps && (
            <>
              <ToggleField
                control={control}
                name="winrmRejectUnauthorized"
                label="Reject Unauthorized"
              />

              <Controller
                control={control}
                name="winrmCaCert"
                render={({ field }) => (
                  <Field>
                    <FieldLabel>CA Certificate</FieldLabel>
                    <FieldContent>
                      <TextArea {...field} rows={4} placeholder="Optional PEM certificate" />
                      <FieldDescription>Only needed with a private CA.</FieldDescription>
                    </FieldContent>
                  </Field>
                )}
              />
            </>
          )}
        </>
      )}
    </>
  );
};

export const HOST_RANGE_SOURCES = {
  [PamDiscoveryType.Unix]: {
    accountType: PamAccountType.SSH,
    placeholder: "Select SSH accounts",
    description:
      "A target is matched to an account by host, otherwise each account is tried until one connects.",
    warning:
      "Password accounts send their password to every host scanned in the range, including hosts you don't control. We recommend a key or certificate account for scanning.",
    configKey: "cidrRanges",
    allowCidr: true,
    targetsPlaceholder: "10.0.0.0/24, 192.168.1.10, host.internal",
    targetsDescription:
      "IP addresses, IPv4 CIDR ranges, or hostnames, one per line or comma-separated."
  },
  [PamDiscoveryType.Postgres]: {
    accountType: PamAccountType.Postgres,
    placeholder: "Select PostgreSQL accounts",
    description:
      "The username and password authenticate to each instance scanned. The account's database and TLS settings are reused for the connection.",
    warning:
      "The account password is sent to every instance scanned, including any you don't control. Only list hosts you trust.",
    configKey: "hosts",
    allowCidr: false,
    targetsPlaceholder: "192.168.1.10, db-primary.internal",
    targetsDescription:
      "IP addresses or hostnames of the instances to scan, one per line or comma-separated. CIDR ranges are not supported."
  }
} as const;

export type THostRangeDiscoveryType = keyof typeof HOST_RANGE_SOURCES;

export const isHostRangeDiscoveryType = (
  type: PamDiscoveryType | null | undefined
): type is THostRangeDiscoveryType => Boolean(type && type in HOST_RANGE_SOURCES);

export const hostRangeDiscoveryConfigFormShape = {
  targets: z.string().min(1, "At least one target is required"),
  credentialAccountIds: z.array(z.string()).min(1, "Select at least one account")
};

export type THostRangeDiscoveryConfigFields = z.infer<
  z.ZodObject<typeof hostRangeDiscoveryConfigFormShape>
>;

export const HOST_RANGE_DISCOVERY_CONFIG_DEFAULTS: THostRangeDiscoveryConfigFields = {
  targets: "",
  credentialAccountIds: []
};

const parseTargets = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);

export const hostRangeDiscoveryConfigFromSource = (
  discoveryType: THostRangeDiscoveryType,
  config: Record<string, unknown>
): THostRangeDiscoveryConfigFields => {
  const stored = config[HOST_RANGE_SOURCES[discoveryType].configKey];
  return {
    targets: Array.isArray(stored) ? (stored as string[]).join("\n") : "",
    credentialAccountIds: Array.isArray(config.credentialAccountIds)
      ? (config.credentialAccountIds as string[])
      : []
  };
};

export const buildHostRangeDiscoveryConfiguration = (
  discoveryType: THostRangeDiscoveryType,
  data: THostRangeDiscoveryConfigFields
): Record<string, unknown> => ({
  [HOST_RANGE_SOURCES[discoveryType].configKey]: parseTargets(data.targets),
  credentialAccountIds: data.credentialAccountIds
});

export const CredentialAccountsField = ({
  control,
  accountType,
  placeholder,
  description,
  warning
}: {
  control: Control<{ credentialAccountIds: string[] }>;
  accountType: PamAccountType;
  placeholder: string;
  description: string;
  warning: string;
}) => {
  const { data: accounts = [] } = useListPamAccounts();
  const matchingAccounts = accounts.filter((a) => a.accountType === accountType);

  return (
    <Controller
      control={control}
      name="credentialAccountIds"
      render={({ field, fieldState }) => (
        <Field>
          <FieldLabel>Credential Accounts</FieldLabel>
          <FieldContent>
            <FilterableSelect
              isMulti
              value={matchingAccounts.filter((a) => field.value?.includes(a.id))}
              onChange={(val) =>
                field.onChange(((val as typeof matchingAccounts | null) ?? []).map((a) => a.id))
              }
              options={matchingAccounts}
              getOptionValue={(a) => a.id}
              getOptionLabel={(a) => (a.folderName ? `${a.folderName} / ${a.name}` : a.name)}
              placeholder={placeholder}
            />
            <FieldDescription>{description}</FieldDescription>
            <FieldError>{fieldState.error?.message}</FieldError>
            <Alert variant="warning" className="mt-1">
              <AlertTriangle />
              <AlertDescription>{warning}</AlertDescription>
            </Alert>
          </FieldContent>
        </Field>
      )}
    />
  );
};

export const HostRangeDiscoveryConfigFields = ({
  control,
  discoveryType
}: {
  control: Control<THostRangeDiscoveryConfigFields>;
  discoveryType: THostRangeDiscoveryType;
}) => {
  const { allowCidr, targetsPlaceholder, targetsDescription } = HOST_RANGE_SOURCES[discoveryType];

  return (
    <Controller
      control={control}
      name="targets"
      rules={{
        validate: (value: string) =>
          allowCidr || !parseTargets(value).some((t) => t.includes("/"))
            ? true
            : "CIDR ranges are not supported. List each instance by IP address or hostname."
      }}
      render={({ field, fieldState }) => (
        <Field>
          <FieldLabel>Targets</FieldLabel>
          <FieldContent>
            <TextArea {...field} rows={3} placeholder={targetsPlaceholder} />
            <FieldDescription>{targetsDescription}</FieldDescription>
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
};

// Shared credential-account + schedule fields, used by both the create modal and the edit tab.
export const CredentialAccountField = ({
  control
}: {
  control: Control<{ credentialAccountId: string }>;
}) => {
  const { data: accounts = [] } = useListPamAccounts();
  const credentialAccounts = accounts.filter((a) => a.accountType === PamAccountType.WindowsAd);

  return (
    <Controller
      control={control}
      name="credentialAccountId"
      render={({ field, fieldState }) => (
        <Field>
          <FieldLabel>Credential Account</FieldLabel>
          <FieldContent>
            <FilterableSelect
              value={credentialAccounts.find((a) => a.id === field.value) ?? null}
              onChange={(val) =>
                field.onChange((val as (typeof credentialAccounts)[number] | null)?.id ?? "")
              }
              options={credentialAccounts}
              getOptionValue={(a) => a.id}
              getOptionLabel={(a) => (a.folderName ? `${a.folderName} / ${a.name}` : a.name)}
              placeholder="Select a Windows AD account"
            />
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
};

export const ScheduleField = ({
  control
}: {
  control: Control<{ schedule: PamDiscoverySchedule }>;
}) => (
  <Controller
    control={control}
    name="schedule"
    render={({ field }) => (
      <Field>
        <FieldLabel>Scan Schedule</FieldLabel>
        <FieldContent>
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={PamDiscoverySchedule.Manual}>Manual</SelectItem>
              <SelectItem value={PamDiscoverySchedule.Daily}>Daily</SelectItem>
              <SelectItem value={PamDiscoverySchedule.Weekly}>Weekly</SelectItem>
            </SelectContent>
          </Select>
        </FieldContent>
      </Field>
    )}
  />
);
