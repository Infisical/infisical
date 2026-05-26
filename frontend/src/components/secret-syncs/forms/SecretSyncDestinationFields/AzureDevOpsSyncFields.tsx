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
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useGetAzureDevOpsProjects } from "@app/hooks/api/appConnections/azure";
import { AzureDevOpsProject } from "@app/hooks/api/appConnections/azure/types";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const AzureDevOpsSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureDevOps }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: { projects } = { projects: [] }, isLoading: isProjectsLoading } =
    useGetAzureDevOpsProjects(connectionId, {
      enabled: Boolean(connectionId)
    });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.devopsProjectId", "");
        }}
      />

      <Controller
        name="destinationConfig.devopsProjectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Project
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure the project exists in the connection&apos;s Azure DevOps instance URL.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isProjectsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={projects?.find((v) => v.appId === value) ?? null}
                onChange={(option) => {
                  onChange((option as SingleValue<AzureDevOpsProject>)?.appId ?? null);
                  setValue(
                    "destinationConfig.devopsProjectName",
                    (option as SingleValue<AzureDevOpsProject>)?.name ?? ""
                  );
                }}
                options={projects}
                placeholder="Select a project..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
