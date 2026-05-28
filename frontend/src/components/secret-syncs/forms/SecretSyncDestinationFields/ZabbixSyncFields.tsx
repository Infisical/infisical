import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  TZabbixHost,
  useZabbixConnectionListHosts,
  ZABBIX_SYNC_SCOPES,
  ZabbixMacroType,
  ZabbixSyncScope
} from "@app/hooks/api/appConnections/zabbix";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const ZabbixSyncFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Zabbix }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const currentScope = watch("destinationConfig.scope");

  const { data: hosts = [], isPending: isHostsPending } = useZabbixConnectionListHosts(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.scope", ZabbixSyncScope.Global);
          setValue("destinationConfig.hostId", "");
          setValue("destinationConfig.hostName", "");
        }}
      />
      <Controller
        name="destinationConfig.scope"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Scope
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-lg">
                  <div className="flex flex-col gap-3">
                    <p>
                      Specify how Infisical should manage secrets from Zabbix. The following options
                      are available:
                    </p>
                    <ul className="flex list-disc flex-col gap-3 pl-4">
                      {Object.values(ZABBIX_SYNC_SCOPES).map(({ name, description }) => (
                        <li key={name}>
                          <p className="text-mineshaft-300">
                            <span className="font-medium text-bunker-200">{name}</span>:{" "}
                            {description}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Select
                value={value}
                onValueChange={(val) => {
                  onChange(val);
                  setValue("destinationConfig.hostId", "");
                  setValue("destinationConfig.hostName", "");
                }}
              >
                <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a scope..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(ZabbixSyncScope).map((scope) => (
                    <SelectItem className="capitalize" value={scope} key={scope}>
                      {scope.replace("-", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      {currentScope === ZabbixSyncScope.Host && (
        <Controller
          name="destinationConfig.hostId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Host</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  isLoading={isHostsPending && Boolean(connectionId)}
                  isDisabled={!connectionId}
                  value={hosts.find((host) => host.hostId === value) ?? null}
                  onChange={(option) => {
                    const selectedOption = option as SingleValue<TZabbixHost>;
                    onChange(selectedOption?.hostId ?? null);

                    if (selectedOption) {
                      setValue("destinationConfig.hostName", selectedOption.host);
                    } else {
                      setValue("destinationConfig.hostName", "");
                    }
                  }}
                  options={hosts}
                  placeholder="Select a host..."
                  getOptionLabel={(option) => option.host}
                  getOptionValue={(option) => option.hostId}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}
      <Controller
        control={control}
        name="destinationConfig.macroType"
        defaultValue={ZabbixMacroType.Secret}
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Macro Type</FieldLabel>
            <FieldContent>
              <Select value={String(value)} onValueChange={(val) => onChange(parseInt(val, 10))}>
                <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a macro type..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={String(ZabbixMacroType.Text)} key="text">
                    Text
                  </SelectItem>
                  <SelectItem value={String(ZabbixMacroType.Secret)} key="secret">
                    Secret
                  </SelectItem>
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
