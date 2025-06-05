import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Badge,
  FilterableSelect,
  FormControl,
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";
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
    <span>{displayName}</span>{" "}
    <Badge className="h-5 leading-5" variant="success">
      {locationId}
    </Badge>
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
    <>
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
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Project"
            helperText={
              <Tooltip
                className="max-w-md"
                content="Ensure that you've enabled the Secret Manager API and Cloud Resource Manager API on your GCP project. Additionally, make sure that the service account is assigned the appropriate GCP roles."
              >
                <div>
                  <span>Don&#39;t see the project you&#39;re looking for?</span>{" "}
                  <FontAwesomeIcon icon={faCircleInfo} className="text-mineshaft-400" />
                </div>
              </Tooltip>
            }
          >
            <FilterableSelect
              menuPlacement="top"
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
          </FormControl>
        )}
      />
      <Controller
        name="destinationConfig.scope"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error?.message)}
            tooltipText={
              <div className="flex flex-col gap-3">
                <p>
                  Specify how Infisical should sync secrets to GCP. The following options are
                  available:
                </p>
                <ul className="flex list-disc flex-col gap-3 pl-4">
                  {Object.values(GCP_SYNC_SCOPES).map(({ name, description }) => {
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
            tooltipClassName="max-w-lg"
            label="Scope"
          >
            <Select
              value={value}
              onValueChange={(val) => onChange(val)}
              className="w-full border border-mineshaft-500 capitalize"
              position="popper"
              dropdownContainerClassName="max-w-none"
              isDisabled={!projectId}
            >
              {Object.values(GcpSyncScope).map((scope) => {
                return (
                  <SelectItem className="capitalize" value={scope} key={scope}>
                    {scope}
                  </SelectItem>
                );
              })}
            </Select>
          </FormControl>
        )}
      />
      {selectedScope === GcpSyncScope.Region && (
        <Controller
          name="destinationConfig.locationId"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message} label="Region">
              <FilterableSelect
                menuPlacement="top"
                isLoading={areLocationsPending && Boolean(projectId)}
                isDisabled={!projectId}
                value={locations?.find((option) => option.locationId === value) ?? null}
                onChange={(option) =>
                  onChange((option as SingleValue<TGcpLocation>)?.locationId ?? null)
                }
                options={locations}
                placeholder="Select a region..."
                getOptionValue={(option) => option.locationId}
                formatOptionLabel={formatOptionLabel}
              />
            </FormControl>
          )}
        />
      )}
    </>
  );
};
