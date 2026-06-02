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
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
    <FieldGroup>
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
          <Field>
            <FieldLabel>
              Secrets Engine Mount
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure the Secrets Engine mount exists and that your App Role / Access Token has
                  permission to access it. Infisical currently supports KV Engines version 1 and 2.
                  If you&apos;re using Hashicorp Cloud Platform, ensure that you correctly defined
                  your &apos;namespace&apos; when creating the App Connection.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isMountsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                onChange={(option) =>
                  onChange((option as SingleValue<{ value: string }>)?.value ?? null)
                }
                options={mounts?.map((v) => ({ label: v, value: v }))}
                placeholder="Select a Secrets Engine Mount..."
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      <Controller
        name="destinationConfig.path"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Path
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  The Secrets Engine mount path where secrets should be synced to. If the path does
                  not exist, it will be created.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <Input
                value={value}
                onChange={onChange}
                placeholder="dev/example"
                isError={Boolean(error)}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
