import { Controller, useFormContext, useWatch } from "react-hook-form";

import { SecretSyncConnectionField } from "@app/components/secret-syncs/forms/SecretSyncConnectionField";
import {
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@app/components/v3";
import {
  useQoveryConnectionListEnvironments,
  useQoveryConnectionListOrganizations,
  useQoveryConnectionListProjects
} from "@app/hooks/api/appConnections/qovery";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { QoveryVariableType } from "@app/hooks/api/secretSyncs/types/qovery-sync";

import { TSecretSyncForm } from "../schemas";

export const QoverySyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.Qovery }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const organizationId = useWatch({ name: "destinationConfig.organizationId", control });
  const projectId = useWatch({ name: "destinationConfig.projectId", control });

  const { data: organizations, isLoading: isOrganizationsLoading } =
    useQoveryConnectionListOrganizations(connectionId, {
      enabled: Boolean(connectionId)
    });

  const { data: projects, isLoading: isProjectsLoading } = useQoveryConnectionListProjects(
    connectionId,
    organizationId,
    {
      enabled: Boolean(connectionId && organizationId)
    }
  );

  const { data: environments, isLoading: isEnvironmentsLoading } =
    useQoveryConnectionListEnvironments(connectionId, projectId, {
      enabled: Boolean(connectionId && projectId)
    });

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.organizationId", "");
          setValue("destinationConfig.organizationName", "");
          setValue("destinationConfig.projectId", "");
          setValue("destinationConfig.projectName", "");
          setValue("destinationConfig.environmentId", "");
          setValue("destinationConfig.environmentName", "");
          setValue("destinationConfig.variableType", QoveryVariableType.Secret);
        }}
      />

      <Controller
        name="destinationConfig.organizationId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Organization</FieldLabel>
            <FieldContent>
              <Combobox
                isLoading={isOrganizationsLoading && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={organizations?.find((org) => org.id === value) ?? null}
                onValueChange={(option) => {
                  const selected = option;
                  onChange(selected?.id ?? "");
                  setValue("destinationConfig.organizationName", selected?.name ?? "");
                  setValue("destinationConfig.projectId", "");
                  setValue("destinationConfig.projectName", "");
                  setValue("destinationConfig.environmentId", "");
                  setValue("destinationConfig.environmentName", "");
                }}
                options={organizations}
                placeholder="Select an organization..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
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
                isLoading={isProjectsLoading && Boolean(connectionId && organizationId)}
                isDisabled={!organizationId}
                value={projects?.find((project) => project.id === value) ?? null}
                onValueChange={(option) => {
                  const selected = option;
                  onChange(selected?.id ?? "");
                  setValue("destinationConfig.projectName", selected?.name ?? "");
                  setValue("destinationConfig.environmentId", "");
                  setValue("destinationConfig.environmentName", "");
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

      <Controller
        name="destinationConfig.environmentId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>
              Environment <span className="text-xs text-muted">(optional)</span>
            </FieldLabel>
            <FieldContent>
              <Combobox
                isLoading={isEnvironmentsLoading && Boolean(connectionId && projectId)}
                isDisabled={!projectId}
                value={environments?.find((environment) => environment.id === value) ?? null}
                onValueChange={(option) => {
                  const selected = option;
                  onChange(selected?.id ?? "");
                  setValue("destinationConfig.environmentName", selected?.name ?? "");
                }}
                onClear={() => {
                  onChange("");
                  setValue("destinationConfig.environmentName", "");
                }}
                options={environments}
                placeholder="Select an environment..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                modal
              />
              <FieldDescription>
                Leave empty to sync at the project level, or select an environment to sync at the
                environment level.
              </FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
