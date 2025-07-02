import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Select, SelectItem } from "@app/components/v2";
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
    <>
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
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Scope"
            tooltipClassName="max-w-lg py-3"
            tooltipText={
              <div className="flex flex-col gap-3">
                <p>
                  Specify how Infisical should manage secrets from Zabbix. The following options are
                  available:
                </p>
                <ul className="flex list-disc flex-col gap-3 pl-4">
                  {Object.values(ZABBIX_SYNC_SCOPES).map(({ name, description }) => {
                    return (
                      <li key={name}>
                        <p className="text-mineshaft-300">
                          <span className="font-medium text-bunker-200">{name}</span>: {description}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            }
          >
            <Select
              value={value}
              onValueChange={(val) => {
                onChange(val);
                setValue("destinationConfig.hostId", "");
                setValue("destinationConfig.hostName", "");
              }}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              placeholder="Select a scope..."
              dropdownContainerClassName="max-w-none"
            >
              {Object.values(ZabbixSyncScope).map((scope) => (
                <SelectItem className="capitalize" value={scope} key={scope}>
                  {scope.replace("-", " ")}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      {currentScope === ZabbixSyncScope.Host && (
        <Controller
          name="destinationConfig.hostId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message} label="Host">
              <FilterableSelect
                menuPlacement="top"
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
            </FormControl>
          )}
        />
      )}
      <Controller
        control={control}
        name="destinationConfig.macroType"
        defaultValue={ZabbixMacroType.Secret}
        render={({ field: { onChange, value }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} label="Macro Type">
            <Select
              value={String(value)}
              onValueChange={(val) => onChange(parseInt(val, 10))}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              placeholder="Select a macro type..."
              dropdownContainerClassName="max-w-none"
            >
              <SelectItem value={String(ZabbixMacroType.Text)} key="text">
                Text
              </SelectItem>
              <SelectItem value={String(ZabbixMacroType.Secret)} key="secret">
                Secret
              </SelectItem>
            </Select>
          </FormControl>
        )}
      />
    </>
  );
};
