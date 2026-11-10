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
import { AgentVaultServiceType } from "@app/hooks/api/agentVault";

import { DescriptionField } from "./DescriptionField";
import { hasDatabase, MAX_NATIVE_SERVICE_NAME_LENGTH, TServiceForm } from "./serviceSchema";

const NAME_PLACEHOLDERS: Partial<Record<AgentVaultServiceType, string>> = {
  [AgentVaultServiceType.Postgres]: "orders-db",
  [AgentVaultServiceType.Mysql]: "orders-db",
  [AgentVaultServiceType.Ssh]: "build-server"
};

const DESCRIPTION_PLACEHOLDERS: Record<string, string> = {
  [AgentVaultServiceType.Postgres]: "Read orders and refunds for support questions",
  [AgentVaultServiceType.Mysql]: "Read orders and refunds for support questions",
  [AgentVaultServiceType.Ssh]: "Run builds and read their logs"
};

export const NativeDetailsFields = () => {
  const { control, watch } = useFormContext<TServiceForm>();
  const baseId = useId();
  const serviceType = watch("serviceType");
  const tlsEnabled = watch("tlsEnabled");
  const tlsVerify = watch("tlsVerify");
  const showsDatabase = hasDatabase(serviceType);

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
              <FieldLabel htmlFor={`${baseId}-port`}>Port</FieldLabel>
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

      {showsDatabase && (
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
                  placeholder="orders"
                  autoComplete="off"
                  spellCheck={false}
                  isError={Boolean(fieldState.error)}
                />
                <FieldDescription>
                  {serviceType === AgentVaultServiceType.Mysql
                    ? "The database the agent starts in."
                    : "The only database the agent can connect to through this service."}
                </FieldDescription>
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      )}

      {showsDatabase && (
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
                  onCheckedChange={field.onChange}
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
