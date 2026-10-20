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
            <FieldLabel
              id="secret-sync-qovery-organization-id-label"
              htmlFor="secret-sync-qovery-organization-id"
            >
              Organization
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-qovery-organization-id-label"
                aria-describedby={error ? "secret-sync-qovery-organization-id-error" : undefined}
                id="secret-sync-qovery-organization-id"
                isError={Boolean(error)}
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
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldError id="secret-sync-qovery-organization-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.projectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-qovery-project-id-label"
              htmlFor="secret-sync-qovery-project-id"
            >
              Project
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-qovery-project-id-label"
                aria-describedby={error ? "secret-sync-qovery-project-id-error" : undefined}
                id="secret-sync-qovery-project-id"
                isError={Boolean(error)}
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
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldError id="secret-sync-qovery-project-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.environmentId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel
              id="secret-sync-qovery-environment-id-label"
              htmlFor="secret-sync-qovery-environment-id"
            >
              Environment <span className="text-xs text-muted">(optional)</span>
            </FieldLabel>
            <FieldContent>
              <Combobox
                aria-labelledby="secret-sync-qovery-environment-id-label"
                aria-describedby={
                  error
                    ? "secret-sync-qovery-environment-id-description secret-sync-qovery-environment-id-error"
                    : "secret-sync-qovery-environment-id-description"
                }
                id="secret-sync-qovery-environment-id"
                isError={Boolean(error)}
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
                getOptionKeywords={(option) => [option.id]}
                modal
              />
              <FieldDescription id="secret-sync-qovery-environment-id-description">
                Leave empty to sync at the project level, or select an environment to sync at the
                environment level.
              </FieldDescription>
              <FieldError id="secret-sync-qovery-environment-id-error" errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
