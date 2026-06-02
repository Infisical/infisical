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
import {
  TNorthflankProject,
  TNorthflankSecretGroup,
  useNorthflankConnectionListProjects,
  useNorthflankConnectionListSecretGroups
} from "@app/hooks/api/appConnections/northflank";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const NorthflankSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Northflank }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });

  const { data: projects = [], isPending: isProjectsLoading } = useNorthflankConnectionListProjects(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  const { data: secretGroups = [], isPending: isSecretGroupsLoading } =
    useNorthflankConnectionListSecretGroups(connectionId, projectId, {
      enabled: Boolean(connectionId) && Boolean(projectId)
    });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.secretGroupId", "");
          setValue("destinationConfig.secretGroupName", "");
        }}
      />
      <Controller
        name="destinationConfig.projectId"
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
                  Ensure the project exists in the connection&apos;s Northflank team and the
                  connection has access to it.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isProjectsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={projects.find((p) => p.id === value) ?? null}
                onChange={(option) => {
                  const v = option as SingleValue<TNorthflankProject>;
                  onChange(v?.id ?? null);
                  setValue("destinationConfig.projectName", v?.name ?? "");
                  setValue("destinationConfig.secretGroupId", "");
                  setValue("destinationConfig.secretGroupName", "");
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
      <Controller
        name="destinationConfig.secretGroupId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Secret Group
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-md">
                  Ensure the secret group exists in the connection&apos;s Northflank project and the
                  connection has access to it.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isSecretGroupsLoading && Boolean(projectId)}
                isDisabled={!projectId}
                value={secretGroups.find((sg) => sg.id === value) ?? null}
                onChange={(option) => {
                  const v = option as SingleValue<TNorthflankSecretGroup>;
                  onChange(v?.id ?? null);
                  setValue("destinationConfig.secretGroupName", v?.name ?? "");
                }}
                options={secretGroups}
                placeholder="Select a secret group..."
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
