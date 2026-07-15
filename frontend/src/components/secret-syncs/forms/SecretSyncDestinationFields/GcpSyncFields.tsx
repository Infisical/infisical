import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info } from "lucide-react";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Badge,
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
import { GCP_SYNC_SCOPES } from "@app/helpers/secretSyncs";
import {
  useGcpConnectionListProjectLocations,
  useGcpConnectionListProjects
} from "@app/hooks/api/appConnections/gcp/queries";
import { TGcpLocation, TGcpProject } from "@app/hooks/api/appConnections/gcp/types";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GcpSyncScope } from "@app/hooks/api/secretSyncs/types/gcp-sync";

import { TSecretSyncForm } from "../schemas";

const formatOptionLabel = ({ displayName, locationId }: TGcpLocation) => (
  <div className="flex w-full flex-row items-center gap-1">
    <span>{displayName}</span> <Badge variant="info">{locationId}</Badge>
  </div>
);

export const GcpSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.GCPSecretManager }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });
  const selectedScope = useWatch({ name: "destinationConfig.scope", control });

  const { data: projects, isPending } = useGcpConnectionListProjects(connectionId, {
    enabled: Boolean(connectionId)
  });

  const { data: locations, isPending: areLocationsPending } = useGcpConnectionListProjectLocations(
    { connectionId, projectId },
    {
      enabled: Boolean(connectionId) && Boolean(projectId)
    }
  );

  useEffect(() => {
    if (!selectedScope) setValue("destinationConfig.scope", GcpSyncScope.Global);
  }, []);

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.locationId", "");
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
                  Ensure that you&apos;ve enabled the Secret Manager API, Cloud Resource Manager
                  API, and Service Usage API on your GCP project. Additionally, make sure that the
                  service account is assigned the appropriate GCP roles.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={projects?.find((project) => project.id === value) ?? null}
                onChange={(option) => {
                  setValue("destinationConfig.locationId", "");
                  onChange((option as SingleValue<TGcpProject>)?.id ?? null);
                }}
                options={projects}
                placeholder="Select a GCP project..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id.toString()}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
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
                      Specify how Infisical should sync secrets to GCP. The following options are
                      available:
                    </p>
                    <ul className="flex list-disc flex-col gap-3 pl-4">
                      {Object.values(GCP_SYNC_SCOPES).map(({ name, description }) => (
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
              <Select value={value} onValueChange={(val) => onChange(val)} disabled={!projectId}>
                <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a scope..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(GcpSyncScope).map((scope) => (
                    <SelectItem className="capitalize" value={scope} key={scope}>
                      {scope}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
      {(selectedScope === GcpSyncScope.Region || selectedScope === GcpSyncScope.Global) && (
        <Controller
          name="destinationConfig.locationId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Region
                {selectedScope === GcpSyncScope.Global && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      Optionally specify a region for user-managed replication. If not set, automatic
                      replication will be used.
                    </TooltipContent>
                  </Tooltip>
                )}
              </FieldLabel>
              <FieldContent>
                <FilterableSelect
                  isLoading={areLocationsPending && Boolean(projectId)}
                  isDisabled={!projectId}
                  isClearable={selectedScope === GcpSyncScope.Global}
                  value={locations?.find((option) => option.locationId === value) ?? null}
                  onChange={(option) =>
                    onChange((option as SingleValue<TGcpLocation>)?.locationId ?? "")
                  }
                  options={locations}
                  placeholder={
                    selectedScope === GcpSyncScope.Global
                      ? "Automatic replication"
                      : "Select a region..."
                  }
                  getOptionValue={(option) => option.locationId}
                  formatOptionLabel={formatOptionLabel}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      )}
    </FieldGroup>
  );
};
