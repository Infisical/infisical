import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  Input,
  TextArea,
  Toggle
} from "@app/components/v3";
import { AgentVaultServiceType, isNativeServiceType } from "@app/hooks/api/agentVault";

import { DescriptionField } from "./DescriptionField";
import {
  defaultNativePorts,
  hasDatabase,
  hasTls,
  MAX_NATIVE_SERVICE_NAME_LENGTH,
  TServiceForm
} from "./serviceSchema";

const NAME_PLACEHOLDERS: Partial<Record<AgentVaultServiceType, string>> = {
  [AgentVaultServiceType.Postgres]: "orders-db",
  [AgentVaultServiceType.Mysql]: "orders-db",
  [AgentVaultServiceType.Cockroachdb]: "orders-db",
  [AgentVaultServiceType.Clickhouse]: "events-db",
  [AgentVaultServiceType.Redis]: "sessions-cache",
  [AgentVaultServiceType.Ssh]: "build-server"
};

const DESCRIPTION_PLACEHOLDERS: Record<string, string> = {
  [AgentVaultServiceType.Postgres]: "Read orders and refunds for support questions",
  [AgentVaultServiceType.Mysql]: "Read orders and refunds for support questions",
  [AgentVaultServiceType.Cockroachdb]: "Read orders and refunds for support questions",
  [AgentVaultServiceType.Clickhouse]: "Query product events for usage reports",
  [AgentVaultServiceType.Redis]: "Look up and clear cached sessions",
  [AgentVaultServiceType.Ssh]: "Run builds and read their logs"
};

// Postgres fixes the database at login. CockroachDB, MySQL and ClickHouse only pick the one queries start in.
const DATABASE_DESCRIPTIONS: Partial<Record<AgentVaultServiceType, string>> = {
  [AgentVaultServiceType.Postgres]:
    "The only database the agent can connect to through this service.",
  [AgentVaultServiceType.Cockroachdb]: "The database the agent starts in.",
  [AgentVaultServiceType.Mysql]: "The database the agent starts in.",
  [AgentVaultServiceType.Clickhouse]: "The database the agent starts in."
};

export const NativeDetailsFields = () => {
  const { control, watch, getValues, setValue } = useFormContext<TServiceForm>();
  const baseId = useId();
  const serviceType = watch("serviceType");
  const tlsEnabled = watch("tlsEnabled");
  const tlsVerify = watch("tlsVerify");
  const isClickhouse = serviceType === AgentVaultServiceType.Clickhouse;

  // A port still at the default for the old TLS setting moves to the new one's; one the admin typed is kept.
  const switchTls = (enabled: boolean) => {
    setValue("tlsEnabled", enabled, { shouldDirty: true });
    if (!isNativeServiceType(serviceType)) return;
    const before = defaultNativePorts(serviceType, !enabled);
    const after = defaultNativePorts(serviceType, enabled);
    (["port", "nativePort"] as const).forEach((name) => {
      if (before[name] && getValues(name).trim() === before[name]) {
        setValue(name, after[name], { shouldDirty: true });
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor={`${baseId}-name`}>Name</FieldLabel>
            <FieldContent>
              <Input
                {...field}
                id={`${baseId}-name`}
                placeholder={NAME_PLACEHOLDERS[serviceType]}
                maxLength={MAX_NATIVE_SERVICE_NAME_LENGTH}
                isError={Boolean(fieldState.error)}
              />
              <FieldDescription>The agent connects by this name.</FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />

      <DescriptionField placeholder={DESCRIPTION_PLACEHOLDERS[serviceType]} />

      <div className="flex items-start gap-3">
        <Controller
          control={control}
          name="host"
          render={({ field, fieldState }) => (
            <Field className="flex-1">
              <FieldLabel htmlFor={`${baseId}-host`}>Host</FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  id={`${baseId}-host`}
                  placeholder={
                    serviceType === AgentVaultServiceType.Ssh
                      ? "server.internal.example.com"
                      : "db.internal.example.com"
                  }
                  autoComplete="off"
                  spellCheck={false}
                  isError={Boolean(fieldState.error)}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="port"
          render={({ field, fieldState }) => (
            <Field className="w-32">
              <FieldLabel htmlFor={`${baseId}-port`}>
                {isClickhouse ? "HTTP Port" : "Port"}
              </FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  id={`${baseId}-port`}
                  inputMode="numeric"
                  autoComplete="off"
                  isError={Boolean(fieldState.error)}
                />
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      </div>

      {isClickhouse && (
        <Controller
          control={control}
          name="nativePort"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={`${baseId}-native-port`}>Native Port (optional)</FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  id={`${baseId}-native-port`}
                  className="w-32"
                  inputMode="numeric"
                  placeholder={defaultNativePorts(serviceType, tlsEnabled).nativePort}
                  autoComplete="off"
                  isError={Boolean(fieldState.error)}
                />
                <FieldDescription>
                  clickhouse-client needs this port. curl, JDBC and Python clients use the HTTP
                  port.
                </FieldDescription>
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      )}

      {hasDatabase(serviceType) && (
        <Controller
          control={control}
          name="database"
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor={`${baseId}-database`}>Database</FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  id={`${baseId}-database`}
                  placeholder={isClickhouse ? "default" : "orders"}
                  autoComplete="off"
                  spellCheck={false}
                  isError={Boolean(fieldState.error)}
                />
                <FieldDescription>{DATABASE_DESCRIPTIONS[serviceType]}</FieldDescription>
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      )}

      {hasTls(serviceType) && (
        <div className="flex flex-col gap-4">
          <Controller
            control={control}
            name="tlsEnabled"
            render={({ field }) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Use TLS</FieldTitle>
                  <FieldDescription>
                    Encrypt the connection from the proxy to the database.
                  </FieldDescription>
                </FieldContent>
                <Toggle
                  id={`${baseId}-tls-enabled`}
                  aria-label="Use TLS"
                  variant="av"
                  checked={field.value}
                  onCheckedChange={switchTls}
                />
              </Field>
            )}
          />
          {tlsEnabled && (
            <Controller
              control={control}
              name="tlsVerify"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>Verify Certificate</FieldTitle>
                    <FieldDescription>
                      Check that the database&apos;s certificate is trusted and matches the host.
                    </FieldDescription>
                  </FieldContent>
                  <Toggle
                    id={`${baseId}-tls-verify`}
                    aria-label="Verify Certificate"
                    variant="av"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </Field>
              )}
            />
          )}
          {/* The proxy only reads the CA certificate while it verifies the server, so it is offered only then. */}
          {tlsEnabled && tlsVerify && (
            <Controller
              control={control}
              name="tlsCa"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor={`${baseId}-tls-ca`}>CA Certificate (optional)</FieldLabel>
                  <FieldContent>
                    <TextArea
                      {...field}
                      id={`${baseId}-tls-ca`}
                      rows={3}
                      className="font-mono"
                      placeholder="-----BEGIN CERTIFICATE-----"
                      spellCheck={false}
                      isError={Boolean(fieldState.error)}
                    />
                    <FieldDescription>
                      Needed only if your database&apos;s certificate isn&apos;t publicly trusted,
                      as with AWS RDS or Cloud SQL.
                    </FieldDescription>
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
          )}
        </div>
      )}
    </div>
  );
};
