import { useMemo } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@app/components/v3";
import { useCircleCIConnectionListOrganizations } from "@app/hooks/api/appConnections/circleci";
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
              <Combobox
                isError={Boolean(error)}
                isLoading={isOrganizationsPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={organizations.find((org) => org.name === value) ?? null}
                onValueChange={(option) => {
                  const selectedOrg = option;
                  onChange(selectedOrg?.name ?? "");
                  setValue("destinationConfig.projectId", "");
                  setValue("destinationConfig.projectName", "");
                }}
                options={organizations}
                placeholder="Select an organization..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
                modal
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
              <Combobox
                isError={Boolean(error)}
                emptyMessage={() =>
                  "No projects found. Please create a project in your selected organization."
                }
                isLoading={isOrganizationsPending && Boolean(connectionId)}
                isDisabled={!selectedOrgName}
                value={projects.find((project) => project.id === value) ?? null}
                onValueChange={(option) => {
                  const selectedProject = option;
                  onChange(selectedProject?.id ?? "");
                  setValue("destinationConfig.projectName", selectedProject?.name ?? "");
                }}
                options={projects}
                placeholder="Select a project..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                modal
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
