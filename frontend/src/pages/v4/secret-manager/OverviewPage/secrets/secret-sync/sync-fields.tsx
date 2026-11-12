import { type ComponentProps, createContext, type ReactNode, use } from "react";
import { Controller, type FieldValues, useWatch } from "react-hook-form";

import type { AppConnectionRedirect } from "@app/components/v4/patterns/app-connection-form";
import { Badge } from "@app/components/v4/ui/badge";
import { Combobox, type ComboboxOption } from "@app/components/v4/ui/combobox";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SECRET_SYNC_CONNECTION_MAP } from "@app/helpers/secretSyncs";
import type { SecretSync } from "@app/hooks/api/secretSyncs/enums";

import { useConnectionCreation } from "../flows/connection-creation";
import {
  RotationField as SyncField,
  SelectField,
  SwitchField,
  TextField,
  useConnectionId,
  useConnectionOptions,
  useRotationForm as useSyncForm
} from "../flows/secret-rotation/fields";
import { type LocalSyncConnection } from "./sync-model";

export {
  SelectField,
  SwitchField,
  SyncField,
  TextField,
  useConnectionId,
  useConnectionOptions,
  useSyncForm
};

export type SyncConnectionsContext = {
  projectId: string;
  connections: LocalSyncConnection[];
  addConnection: (connection: LocalSyncConnection) => void;
  redirect?: AppConnectionRedirect;
};

export const SyncConnections = createContext<SyncConnectionsContext>({
  projectId: "",
  connections: [],
  addConnection: () => undefined
});

export type ReviewItems = (readonly [string, ReactNode])[];

export type SyncView = {
  Destination: () => ReactNode;
  Options?: () => ReactNode;
  Source?: () => ReactNode;
  defaults: FieldValues;
  destinationReview: (config: FieldValues) => ReviewItems;
  optionsReview?: (options: FieldValues) => ReviewItems;
};

export const appNameOf = (destination: SecretSync) =>
  APP_CONNECTION_MAP[SECRET_SYNC_CONNECTION_MAP[destination]].name;

export const yesNo = (value: unknown) => (value ? "Yes" : "No");

export const enabledBadge = (enabled: unknown) => (
  <Badge tone={enabled ? "ok" : "outline"}>{enabled ? "Enabled" : "Disabled"}</Badge>
);

export const labelFor = (options: readonly { value: string; label: string }[], value: unknown) =>
  options.find((option) => option.value === value)?.label ?? (value as string | undefined);

export function ConnectionField({ onChange }: { onChange?: () => void }) {
  const { control, getValues, setValue } = useSyncForm();
  const { projectId, connections, addConnection, redirect } = use(SyncConnections);
  const destination = useWatch({ control, name: "destination" }) as SecretSync;
  const app = SECRET_SYNC_CONNECTION_MAP[destination];
  const label = `${appNameOf(destination)} connection`;
  const available = connections.filter(
    (connection, index) =>
      connection.app === app &&
      connections.findIndex((entry) => entry.id === connection.id) === index
  );
  const creation = useConnectionCreation(
    app,
    projectId,
    (connection) => {
      addConnection(connection);
      setValue("connection", connection, { shouldValidate: true, shouldDirty: true });
      onChange?.();
    },
    redirect
  );
  return (
    <Controller
      control={control}
      name="connection"
      render={({ field, fieldState: { error } }) => (
        <SyncField label={label} error={error?.message ?? error?.root?.message}>
          <Combobox
            label={label}
            value={field.value?.id ?? ""}
            onValueChange={(id) => {
              if (id === getValues("connection")?.id) return;
              field.onChange(available.find((connection) => connection.id === id) ?? null);
              onChange?.();
            }}
            options={available.map((connection) => ({
              value: connection.id,
              label: connection.name
            }))}
            placeholder="Select connection..."
            emptyText={`No ${appNameOf(destination)} connections yet.`}
            invalid={Boolean(error)}
            creation={creation}
          />
        </SyncField>
      )}
    />
  );
}

type ComboFieldProps = {
  name: string;
  label: string;
  options: readonly ComboboxOption[];
  placeholder?: string;
  tooltip?: ReactNode;
  description?: ReactNode;
  optional?: boolean;
  disabled?: boolean;
  emptyText?: string;
  mono?: boolean;
  requiresConnection?: boolean;
};

export function ComboField({
  name,
  label,
  options,
  placeholder,
  tooltip,
  description,
  optional,
  disabled,
  emptyText,
  mono,
  requiresConnection = true,
  loading,
  onCreate,
  onSelect
}: ComboFieldProps & {
  loading?: boolean;
  onCreate?: ComponentProps<typeof Combobox>["onCreate"];
  onSelect?: (value: string) => void;
}) {
  const { control } = useSyncForm();
  const connectionId = useConnectionId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <SyncField
          label={label}
          tooltip={tooltip}
          optional={optional}
          description={description}
          error={error?.message}
        >
          <Combobox
            label={label}
            value={field.value === undefined || field.value === null ? "" : String(field.value)}
            onValueChange={(value) => {
              if (value === field.value) return;
              field.onChange(value);
              onSelect?.(value);
            }}
            options={options}
            placeholder={placeholder}
            emptyText={emptyText}
            loading={loading}
            onCreate={onCreate}
            mono={mono}
            disabled={disabled || (requiresConnection && !connectionId)}
            invalid={Boolean(error)}
          />
        </SyncField>
      )}
    />
  );
}

export function MultiComboField({
  name,
  label,
  options,
  placeholder,
  tooltip,
  description,
  optional,
  disabled,
  emptyText,
  mono,
  requiresConnection = true
}: ComboFieldProps) {
  const { control } = useSyncForm();
  const connectionId = useConnectionId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <SyncField
          label={label}
          tooltip={tooltip}
          optional={optional}
          description={description}
          error={error?.message}
        >
          <Combobox
            label={label}
            multiple
            value={(field.value as string[] | undefined) ?? []}
            onValueChange={field.onChange}
            options={options}
            placeholder={placeholder}
            emptyText={emptyText}
            mono={mono}
            disabled={disabled || (requiresConnection && !connectionId)}
            invalid={Boolean(error)}
          />
        </SyncField>
      )}
    />
  );
}
