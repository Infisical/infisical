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

import { hasDatabase, MAX_NATIVE_SERVICE_NAME_LENGTH, TServiceForm } from "./serviceSchema";

const NAME_PLACEHOLDERS: Partial<Record<AgentVaultServiceType, string>> = {
  [AgentVaultServiceType.Postgres]: "orders-db",
  [AgentVaultServiceType.Mysql]: "orders-db",
  [AgentVaultServiceType.Ssh]: "build-server"
};

const TLS_OFF_DESCRIPTIONS: Partial<Record<AgentVaultServiceType, string>> = {
  [AgentVaultServiceType.Postgres]:
    "When off, the proxy still uses TLS if the server offers it, but doesn't check the certificate.",
  [AgentVaultServiceType.Mysql]: "When off, the proxy connects to the server without TLS."
};

export const NativeDetailsFields = () => {
  const { control, watch } = useFormContext<TServiceForm>();
  const baseId = useId();
  const serviceType = watch("serviceType");
  const tlsEnabled = watch("tlsEnabled");
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
              <FieldDescription>
                Use lowercase letters, numbers, and hyphens. The agent connects to the service by
                this name.
              </FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />

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
                <FieldDescription>
                  The host name or IP address the proxy connects to.
                </FieldDescription>
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
                    ? "The database the agent starts in. The account's grants decide which other databases it can switch to."
                    : "The only database the agent can connect to through this service."}
                </FieldDescription>
                <FieldError>{fieldState.error?.message}</FieldError>
              </FieldContent>
            </Field>
          )}
        />
      )}

      {showsDatabase && (
        <div className="flex flex-col gap-3">
          <Controller
            control={control}
            name="tlsEnabled"
            render={({ field }) => (
              <Field orientation="horizontal" className="rounded-md border border-border p-4">
                <FieldContent>
                  <FieldTitle>Use TLS</FieldTitle>
                  <FieldDescription>
                    Encrypt the connection from the proxy to the database.{" "}
                    {TLS_OFF_DESCRIPTIONS[serviceType]}
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
                <Field orientation="horizontal" className="rounded-md border border-border p-4">
                  <FieldContent>
                    <FieldTitle>Verify Certificate</FieldTitle>
                    <FieldDescription>
                      Check that the server&apos;s certificate is valid for the host and signed by a
                      publicly trusted authority, or by the certificate authority below when you add
                      one. Turn this off only for a server with a self-signed certificate you
                      can&apos;t add below.
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
          {tlsEnabled && (
            <Controller
              control={control}
              name="tlsCa"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor={`${baseId}-tls-ca`}>
                    Certificate Authority (optional)
                  </FieldLabel>
                  <FieldContent>
                    <TextArea
                      {...field}
                      id={`${baseId}-tls-ca`}
                      rows={4}
                      className="font-mono"
                      placeholder="-----BEGIN CERTIFICATE-----"
                      spellCheck={false}
                      isError={Boolean(fieldState.error)}
                    />
                    <FieldDescription>
                      The PEM certificate of the authority that signed the server&apos;s
                      certificate, for a server whose certificate isn&apos;t publicly trusted.
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
