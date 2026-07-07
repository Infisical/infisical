import { ReactNode, useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { CircleHelp } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP, SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import {
  SecretSync,
  SecretSyncInitialSyncBehavior,
  useSecretSyncOption
} from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";
import { InitialSyncAlerts } from "../SecretSyncInitialSyncBehaviorFields";
import { AwsParameterStoreSyncOptionsFields } from "./AwsParameterStoreSyncOptionsFields";
import { AwsSecretsManagerSyncOptionsFields } from "./AwsSecretsManagerSyncOptionsFields";
import { AzureKeyVaultSyncOptionsFields } from "./AzureKeyVaultSyncOptionsFields";
import { FlyioSyncOptionsFields } from "./FlyioSyncOptionsFields";
import { QoverySyncOptionsFields } from "./QoverySyncOptionsFields";
import { RenderSyncOptionsFields } from "./RenderSyncOptionsFields";
import { SecretSyncKeySchemaField } from "./SecretSyncKeySchemaField";
import { TriggerDevSyncOptionsFields } from "./TriggerDevSyncOptionsFields";

type Props = {
  hideInitialSync?: boolean;
  children?: ReactNode;
};

export const SecretSyncOptionsFields = ({ hideInitialSync, children }: Props) => {
  const { control, watch, setValue } = useFormContext<TSecretSyncForm>();

  const destination = watch("destination");
  const currentSyncOption = watch("syncOptions");
  const vercelSensitive =
    destination === SecretSync.Vercel
      ? Boolean(watch("destinationConfig.sensitive" as never))
      : false;

  const destinationName = SECRET_SYNC_MAP[destination].name;

  const { syncOption } = useSecretSyncOption(destination);

  // Vercel "sensitive" secrets cannot be read back, so importing destination secrets is impossible.
  // Force the initial sync behavior to OverwriteDestination whenever sensitive is enabled.
  useEffect(() => {
    if (
      vercelSensitive &&
      currentSyncOption.initialSyncBehavior !== SecretSyncInitialSyncBehavior.OverwriteDestination
    ) {
      setValue(
        "syncOptions.initialSyncBehavior",
        SecretSyncInitialSyncBehavior.OverwriteDestination
      );
    }
  }, [vercelSensitive, currentSyncOption.initialSyncBehavior, setValue]);

  const importAvailable = Boolean(syncOption?.canImportSecrets) && !vercelSensitive;
  const initialSyncBehaviorEntries = Object.entries(SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP).filter(
    ([key]) => importAvailable || key === SecretSyncInitialSyncBehavior.OverwriteDestination
  );

  let AdditionalSyncOptionsFieldsComponent: ReactNode;

  switch (destination) {
    case SecretSync.AWSParameterStore:
      AdditionalSyncOptionsFieldsComponent = <AwsParameterStoreSyncOptionsFields />;
      break;
    case SecretSync.AWSSecretsManager:
      AdditionalSyncOptionsFieldsComponent = <AwsSecretsManagerSyncOptionsFields />;
      break;
    case SecretSync.Render:
      AdditionalSyncOptionsFieldsComponent = <RenderSyncOptionsFields />;
      break;
    case SecretSync.Flyio:
      AdditionalSyncOptionsFieldsComponent = <FlyioSyncOptionsFields />;
      break;
    case SecretSync.AzureKeyVault:
      AdditionalSyncOptionsFieldsComponent = <AzureKeyVaultSyncOptionsFields />;
      break;
    case SecretSync.TriggerDev:
      AdditionalSyncOptionsFieldsComponent = <TriggerDevSyncOptionsFields />;
      break;
    case SecretSync.Qovery:
      AdditionalSyncOptionsFieldsComponent = <QoverySyncOptionsFields />;
      break;
    case SecretSync.GitHub:
    case SecretSync.GCPSecretManager:
    case SecretSync.AzureAppConfiguration:
    case SecretSync.AzureDevOps:
    case SecretSync.Databricks:
    case SecretSync.Humanitec:
    case SecretSync.TerraformCloud:
    case SecretSync.Camunda:
    case SecretSync.Vercel:
    case SecretSync.Windmill:
    case SecretSync.HCVault:
    case SecretSync.TeamCity:
    case SecretSync.OnePass:
    case SecretSync.OCIVault:
    case SecretSync.Heroku:
    case SecretSync.GitLab:
    case SecretSync.CloudflarePages:
    case SecretSync.CloudflareWorkers:
    case SecretSync.Zabbix:
    case SecretSync.Railway:
    case SecretSync.Checkly:
    case SecretSync.Supabase:
    case SecretSync.DigitalOceanAppPlatform:
    case SecretSync.Netlify:
    case SecretSync.Northflank:
    case SecretSync.Bitbucket:
    case SecretSync.LaravelForge:
    case SecretSync.Chef:
    case SecretSync.OctopusDeploy:
    case SecretSync.CircleCI:
    case SecretSync.AzureEntraIdScim:
    case SecretSync.ExternalInfisical:
    case SecretSync.OVH:
    case SecretSync.Devin:
    case SecretSync.Ona:
    case SecretSync.TravisCI:
    case SecretSync.Snowflake:
    case SecretSync.Cloud66:
      AdditionalSyncOptionsFieldsComponent = null;
      break;
    default:
      throw new Error(`Unhandled Additional Sync Options Fields: ${destination}`);
  }

  return (
    <>
      {!hideInitialSync && (
        <>
          <Controller
            name="syncOptions.initialSyncBehavior"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="initial-sync-behavior" className="flex items-center gap-1.5">
                  Initial sync behavior
                  {syncOption?.canImportSecrets && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CircleHelp className="size-3 cursor-help text-muted" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-lg">
                        <div className="flex flex-col gap-3">
                          <p>
                            Specify how Infisical should resolve the initial sync to{" "}
                            {destinationName}. The following options are available:
                          </p>
                          <ul className="flex list-disc flex-col gap-3 pl-4">
                            {Object.values(SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP).map((details) => {
                              const { name, description } = details(destinationName);
                              return (
                                <li key={name}>
                                  <p>
                                    <span className="font-medium">{name}</span>: {description}
                                  </p>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </FieldLabel>
                <Select value={value} onValueChange={(val) => onChange(val)}>
                  <SelectTrigger
                    id="initial-sync-behavior"
                    isError={Boolean(error)}
                    className="w-full"
                  >
                    <SelectValue placeholder="Select an option..." />
                  </SelectTrigger>
                  <SelectContent>
                    {initialSyncBehaviorEntries.map(([key, details]) => {
                      const { name } = details(destinationName);
                      return (
                        <SelectItem value={key} key={key}>
                          {name}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <InitialSyncAlerts />
        </>
      )}
      {syncOption?.supportsDisableSecretDeletion !== false && (
        <Controller
          control={control}
          name="syncOptions.disableSecretDeletion"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <Field orientation="horizontal">
                <FieldContent>
                  <Label htmlFor="disable-secret-deletion">Disable secret deletion</Label>
                  <FieldDescription>
                    When enabled, Infisical will not remove secrets from {destinationName} during a
                    sync. Use this if you intend to manage some secrets manually outside of
                    Infisical.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="disable-secret-deletion"
                  variant="project"
                  checked={value}
                  onCheckedChange={onChange}
                />
              </Field>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      )}
      {children}
      {syncOption?.supportsKeySchema !== false && <SecretSyncKeySchemaField />}
      {AdditionalSyncOptionsFieldsComponent}
    </>
  );
};
