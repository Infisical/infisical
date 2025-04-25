import { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { faQuestionCircle, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormControl, Select, SelectItem, Switch, Tooltip } from "@app/components/v2";
import { SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP, SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { SecretSync, useSecretSyncOption } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";
import { AwsParameterStoreSyncOptionsFields } from "./AwsParameterStoreSyncOptionsFields";
import { AwsSecretsManagerSyncOptionsFields } from "./AwsSecretsManagerSyncOptionsFields";

type Props = {
  hideInitialSync?: boolean;
};

export const SecretSyncOptionsFields = ({ hideInitialSync }: Props) => {
  const { control, watch } = useFormContext<TSecretSyncForm>();

  const destination = watch("destination");

  const destinationName = SECRET_SYNC_MAP[destination].name;

  const { syncOption } = useSecretSyncOption(destination);

  let AdditionalSyncOptionsFieldsComponent: ReactNode;

  switch (destination) {
    case SecretSync.AWSParameterStore:
      AdditionalSyncOptionsFieldsComponent = <AwsParameterStoreSyncOptionsFields />;
      break;
    case SecretSync.AWSSecretsManager:
      AdditionalSyncOptionsFieldsComponent = <AwsSecretsManagerSyncOptionsFields />;
      break;
    case SecretSync.GitHub:
    case SecretSync.GCPSecretManager:
    case SecretSync.AzureKeyVault:
    case SecretSync.AzureAppConfiguration:
    case SecretSync.Databricks:
    case SecretSync.Humanitec:
    case SecretSync.TerraformCloud:
    case SecretSync.Camunda:
    case SecretSync.Vercel:
    case SecretSync.Windmill:
    case SecretSync.HCVault:
    case SecretSync.TeamCity:
      AdditionalSyncOptionsFieldsComponent = null;
      break;
    default:
      throw new Error(`Unhandled Additional Sync Options Fields: ${destination}`);
  }

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">Configure how secrets should be synced.</p>
      {!hideInitialSync && (
        <>
          <Controller
            name="syncOptions.initialSyncBehavior"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                tooltipClassName="max-w-lg py-3"
                tooltipText={
                  syncOption?.canImportSecrets ? (
                    <div className="flex flex-col gap-3">
                      <p>
                        Specify how Infisical should resolve the initial sync to {destinationName}.
                        The following options are available:
                      </p>
                      <ul className="flex list-disc flex-col gap-3 pl-4">
                        {Object.values(SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP).map((details) => {
                          const { name, description } = details(destinationName);

                          return (
                            <li key={name}>
                              <p className="text-mineshaft-300">
                                <span className="font-medium text-bunker-200">{name}</span>:{" "}
                                {description}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : undefined
                }
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Initial Sync Behavior"
              >
                <Select
                  isDisabled={!syncOption?.canImportSecrets}
                  value={value}
                  onValueChange={(val) => onChange(val)}
                  className="w-full border border-mineshaft-500"
                  position="popper"
                  placeholder="Select an option..."
                  dropdownContainerClassName="max-w-none"
                >
                  {Object.entries(SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP).map(([key, details]) => {
                    const { name } = details(destinationName);

                    return (
                      <SelectItem value={key} key={key}>
                        {name}
                      </SelectItem>
                    );
                  })}
                </Select>
              </FormControl>
            )}
          />
          {!syncOption?.canImportSecrets && (
            <p className="-mt-2.5 mb-2.5 text-xs text-yellow">
              <FontAwesomeIcon className="mr-1" size="xs" icon={faTriangleExclamation} />
              {destinationName} only supports overwriting destination secrets. Secrets not present
              in Infisical will be removed from the destination.
            </p>
          )}
        </>
      )}
      {AdditionalSyncOptionsFieldsComponent}
      <Controller
        control={control}
        name="syncOptions.disableSecretDeletion"
        render={({ field: { value, onChange }, fieldState: { error } }) => {
          return (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Switch
                className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                id="auto-sync-enabled"
                thumbClassName="bg-mineshaft-800"
                onCheckedChange={onChange}
                isChecked={value}
              >
                <p className="w-[11rem]">
                  Disable Secret Deletion{" "}
                  <Tooltip
                    className="max-w-md"
                    content={
                      <>
                        <p>
                          When enabled, Infisical will <span className="font-semibold">not</span>{" "}
                          remove secrets from the destination during a sync.
                        </p>
                        <p className="mt-4">
                          Enable this option if you intend to manage some secrets manually outside
                          of Infisical.
                        </p>
                      </>
                    }
                  >
                    <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
                  </Tooltip>
                </p>
              </Switch>
            </FormControl>
          );
        }}
      />
      {/* <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            isOptional
            errorText={error?.message}
            label="Prepend Prefix"
          >
            <Input className="uppercase" value={value} onChange={onChange} placeholder="INF_" />
          </FormControl>
        )}
        control={control}
        name="syncOptions.prependPrefix"
      />
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            isOptional
            errorText={error?.message}
            label="Append Suffix"
          >
            <Input className="uppercase" value={value} onChange={onChange} placeholder="_INF" />
          </FormControl>
        )}
        control={control}
        name="syncOptions.appendSuffix"
      /> */}
    </>
  );
};
