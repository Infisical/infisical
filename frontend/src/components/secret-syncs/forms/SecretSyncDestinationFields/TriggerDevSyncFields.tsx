import { useEffect, useMemo, useState } from "react";
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
  TTriggerDevEnvironment,
  TTriggerDevOrganization,
  TTriggerDevProject,
  useTriggerDevConnectionListEnvironments,
  useTriggerDevConnectionListProjects
} from "@app/hooks/api/appConnections/trigger-dev";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

const ENVIRONMENT_TYPE_LABELS: Record<string, string> = {
  DEVELOPMENT: "Development",
  STAGING: "Staging",
  PREVIEW: "Preview",
  PRODUCTION: "Production"
};

const getEnvironmentLabel = (environment: TTriggerDevEnvironment) =>
  ENVIRONMENT_TYPE_LABELS[environment.type] ?? environment.slug;

export const TriggerDevSyncFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.TriggerDev }
  >();

  const connectionId = useWatch({ name: "connection.id", control });
  const projectRef = useWatch({ name: "destinationConfig.projectRef", control });

  const { data: projects, isLoading: isProjectsLoading } = useTriggerDevConnectionListProjects(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  // Environments are project-scoped and only include what the connected token can access,
  // so they're fetched lazily once a project is selected.
  const { data: environments, isLoading: isEnvironmentsLoading } =
    useTriggerDevConnectionListEnvironments(connectionId, projectRef, {
      enabled: Boolean(connectionId && projectRef)
    });

  // The PAT can span multiple organizations, so we first scope by organization and then list
  // only that organization's projects. The organization is a UI-only filter — only the
  // (globally unique) project ref is persisted on the sync.
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const organizationOptions = useMemo<TTriggerDevOrganization[]>(() => {
    if (!projects) return [];
    const byId = new Map<string, TTriggerDevOrganization>();
    projects.forEach((project) => {
      if (!byId.has(project.organization.id))
        byId.set(project.organization.id, project.organization);
    });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  // Derive the organization from the persisted project ref (e.g. when editing an existing sync).
  useEffect(() => {
    if (selectedOrgId || !projectRef || !projects) return;
    const project = projects.find((p) => p.id === projectRef);
    if (project) setSelectedOrgId(project.organization.id);
  }, [projectRef, projects, selectedOrgId]);

  const selectedOrganization = organizationOptions.find((org) => org.id === selectedOrgId) ?? null;

  const orgProjects = useMemo(
    () => projects?.filter((project) => project.organization.id === selectedOrgId) ?? [],
    [projects, selectedOrgId]
  );

  return (
    <FieldGroup>
      <SecretSyncConnectionField
        onChange={() => {
          setSelectedOrgId(null);
          setValue("destinationConfig.projectRef", "");
          setValue("destinationConfig.environment", "");
        }}
      />

      <Field>
        <FieldLabel>Organization</FieldLabel>
        <FieldContent>
          <FilterableSelect
            isLoading={isProjectsLoading && Boolean(connectionId)}
            isDisabled={!connectionId}
            value={selectedOrganization}
            onChange={(option) => {
              const selected = option as SingleValue<TTriggerDevOrganization>;
              setSelectedOrgId(selected?.id ?? null);
              setValue("destinationConfig.projectRef", "");
              setValue("destinationConfig.environment", "");
            }}
            options={organizationOptions}
            placeholder="Select an organization..."
            getOptionLabel={(option) => `${option.name} (${option.slug})`}
            getOptionValue={(option) => option.id}
          />
        </FieldContent>
      </Field>

      <Controller
        name="destinationConfig.projectRef"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Project</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isProjectsLoading && Boolean(connectionId)}
                isDisabled={!selectedOrgId}
                value={orgProjects.find((v) => v.id === value) ?? null}
                onChange={(option) => {
                  const selected = option as SingleValue<TTriggerDevProject>;
                  onChange(selected?.id ?? "");
                  setValue("destinationConfig.environment", "");
                }}
                options={orgProjects}
                placeholder={selectedOrgId ? "Select a project..." : "Select an organization first"}
                getOptionLabel={(option) => `${option.name} (${option.id})`}
                getOptionValue={(option) => option.id}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.environment"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Environment</FieldLabel>
            <FieldContent>
              <FilterableSelect
                isLoading={isEnvironmentsLoading && Boolean(connectionId && projectRef)}
                isDisabled={!projectRef}
                value={environments?.find((env) => env.slug === value) ?? null}
                onChange={(option) => {
                  const selected = option as SingleValue<TTriggerDevEnvironment>;
                  onChange(selected?.slug ?? "");
                }}
                options={environments ?? []}
                placeholder={projectRef ? "Select an environment..." : "Select a project first"}
                getOptionLabel={(option) => getEnvironmentLabel(option)}
                getOptionValue={(option) => option.slug}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
