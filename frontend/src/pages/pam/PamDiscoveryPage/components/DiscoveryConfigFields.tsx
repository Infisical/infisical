import { Control, Controller, useWatch } from "react-hook-form";
import { z } from "zod";

import {
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
import { PamAccountType, PamDiscoverySchedule, useListPamAccountsAdmin } from "@app/hooks/api/pam";

export const discoveryConfigFormShape = {
  scanLocalAccounts: z.boolean(),
  winrmPort: z.coerce.number().int().min(1).max(65535),
  useWinrmHttps: z.boolean(),
  winrmRejectUnauthorized: z.boolean(),
  winrmCaCert: z.string()
};

export type TDiscoveryConfigFields = z.infer<z.ZodObject<typeof discoveryConfigFormShape>>;

export const DISCOVERY_CONFIG_DEFAULTS: TDiscoveryConfigFields = {
  scanLocalAccounts: true,
  winrmPort: 5985,
  useWinrmHttps: false,
  winrmRejectUnauthorized: true,
  winrmCaCert: ""
};

export const discoveryConfigFromSource = (
  config: Record<string, unknown>
): TDiscoveryConfigFields => ({
  scanLocalAccounts: config.scanLocalAccounts !== false,
  winrmPort:
    typeof config.winrmPort === "number" ? config.winrmPort : DISCOVERY_CONFIG_DEFAULTS.winrmPort,
  useWinrmHttps: Boolean(config.useWinrmHttps),
  winrmRejectUnauthorized: config.winrmRejectUnauthorized !== false,
  winrmCaCert: typeof config.winrmCaCert === "string" ? config.winrmCaCert : ""
});

export const buildDiscoveryConfiguration = (
  data: TDiscoveryConfigFields
): Record<string, unknown> => {
  if (!data.scanLocalAccounts) return { scanLocalAccounts: false };
  return {
    scanLocalAccounts: true,
    winrmPort: data.winrmPort,
    useWinrmHttps: data.useWinrmHttps,
    winrmRejectUnauthorized: data.winrmRejectUnauthorized,
    ...(data.winrmCaCert.trim() ? { winrmCaCert: data.winrmCaCert.trim() } : {})
  };
};

type ToggleName = "scanLocalAccounts" | "useWinrmHttps" | "winrmRejectUnauthorized";

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
  const useWinrmHttps = useWatch({ control, name: "useWinrmHttps" });

  return (
    <>
      <ToggleField control={control} name="scanLocalAccounts" label="Discover local accounts" />

      {scanLocalAccounts && (
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

// Shared credential-account + schedule fields, used by both the create modal and the edit tab.
export const CredentialAccountField = ({
  control
}: {
  control: Control<{ credentialAccountId: string }>;
}) => {
  const { data: accounts = [] } = useListPamAccountsAdmin();
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
