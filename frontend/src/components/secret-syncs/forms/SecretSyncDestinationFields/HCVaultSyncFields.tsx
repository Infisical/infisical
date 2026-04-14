import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import { FilterableSelect, FormControl, Input, Tooltip } from "@app/components/v2";
import { useHCVaultConnectionListMounts } from "@app/hooks/api/appConnections/hc-vault";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const HCVaultSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.HCVault }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: mounts, isLoading: isMountsLoading } = useHCVaultConnectionListMounts(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.mount", "");
          setValue("destinationConfig.path", "");
        }}
      />

      <Controller
        name="destinationConfig.mount"
        control={control}
        render={({ field: { onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Secrets Engine Mount"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure the Secrets Engine mount exists and that your App Role / Access Token has permission to access it. Infisical currently supports KV Engines version 1 and 2. If you're using Hashicorp Cloud Platform, ensure that you correctly defined your 'namespace' when creating the App Connection."
              >
                <div>
                  <span>Don&#39;t see the mount you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
              isLoading={isMountsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              onChange={(option) =>
                onChange((option as SingleValue<{ value: string }>)?.value ?? null)
              }
              options={mounts?.map((v) => ({ label: v, value: v }))}
              placeholder="Select a Secrets Engine Mount..."
            />
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.path"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            tooltipClassName="max-w-sm"
            tooltipText="The Secrets Engine mount path where secrets should be synced to. If the path does not exist, it will be created."
            isError={Boolean(error)}
            errorText={error?.message}
            label="Path"
          >
            <Input value={value} onChange={onChange} placeholder="dev/example" />
          </FormControl>
        )}
      />
    </>
  );
};
