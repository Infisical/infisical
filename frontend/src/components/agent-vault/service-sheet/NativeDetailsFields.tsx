import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TextArea,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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
                <FieldLabel htmlFor={`${baseId}-tls-enabled`}>
                  Use TLS
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Encrypts the connection from the proxy to the database.{" "}
                      {TLS_OFF_DESCRIPTIONS[serviceType]}
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <Toggle
                  id={`${baseId}-tls-enabled`}
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
                  <FieldLabel htmlFor={`${baseId}-tls-verify`}>
                    Verify Certificate
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        Checks that the server&apos;s certificate is valid for the host and signed
                        by a publicly trusted authority, or by the CA certificate you add. Turn it
                        off only for a self-signed certificate you can&apos;t add.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Toggle
                    id={`${baseId}-tls-verify`}
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
