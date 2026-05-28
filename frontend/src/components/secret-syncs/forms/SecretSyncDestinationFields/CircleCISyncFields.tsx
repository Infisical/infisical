import { useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";
import {
  TCircleCIOrganization,
  TCircleCIProject,
  useCircleCIConnectionListOrganizations
} from "@app/hooks/api/appConnections/circleci";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const CircleCISyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CircleCI }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const selectedOrgName = useWatch({ name: "destinationConfig.orgName", control });

  const { data: organizations = [], isPending: isOrganizationsPending } =
    useCircleCIConnectionListOrganizations(connectionId, {
      enabled: Boolean(connectionId)
    });

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org.name === selectedOrgName),
    [organizations, selectedOrgName]
  );

  const projects = selectedOrganization?.projects ?? [];

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.orgName", "");
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
        }}
      />

      <Controller
        name="destinationConfig.orgName"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Organization</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isOrganizationsPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={organizations.find((org) => org.name === value) ?? null}
                onChange={(option) => {
                  const selectedOrg = option as SingleValue<TCircleCIOrganization>;
                  onChange(selectedOrg?.name ?? "");
                  setValue("destinationConfig.projectId", "");
                  setValue("destinationConfig.projectName", "");
                }}
                options={organizations}
                placeholder="Select an organization..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.projectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Project</FieldLabel>
            <FieldContent>
              <FilterableSelect
                noOptionsMessage={() =>
                  "No projects found. Please create a project in your selected organization."
                }
                isLoading={isOrganizationsPending && Boolean(connectionId)}
                isDisabled={!selectedOrgName}
                value={projects.find((project) => project.id === value) ?? null}
                onChange={(option) => {
                  const selectedProject = option as SingleValue<TCircleCIProject>;
                  onChange(selectedProject?.id ?? "");
                  setValue("destinationConfig.projectName", selectedProject?.name ?? "");
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
