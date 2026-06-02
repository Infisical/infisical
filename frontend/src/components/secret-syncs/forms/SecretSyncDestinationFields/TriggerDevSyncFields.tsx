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
  FilterableSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  TTriggerDevOrganization,
  TTriggerDevProject,
  useTriggerDevConnectionListProjects
} from "@app/hooks/api/appConnections/trigger-dev";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TriggerDevSyncEnvironment } from "@app/hooks/api/secretSyncs/types/trigger-dev-sync";

import { TSecretSyncForm } from "../schemas";

const TRIGGER_DEV_ENVIRONMENTS = [
  {
    name: "Production",
    value: TriggerDevSyncEnvironment.Production
  },
  {
    name: "Staging",
    value: TriggerDevSyncEnvironment.Staging
  },
  {
    name: "Development",
    value: TriggerDevSyncEnvironment.Development
  },
  {
    name: "Preview",
    value: TriggerDevSyncEnvironment.Preview
  }
];

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

  // The PAT can span multiple organizations, so we first scope by organization and then list
  // only that organization's projects. The organization is a UI-only filter — only the
  // (globally unique) project ref is persisted on the sync.
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const organizationOptions = useMemo<TTriggerDevOrganization[]>(() => {
    if (!projects) return [];
    const byId = new Map<string, TTriggerDevOrganization>();
    projects.forEach((project) => {
      if (!byId.has(project.organization.id)) byId.set(project.organization.id, project.organization);
    });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  // Derive the organization from the persisted project ref (e.g. when editing an existing sync).
  useEffect(() => {
    if (selectedOrgId || !projectRef || !projects) return;
    const project = projects.find((p) => p.id === projectRef);
    if (project) setSelectedOrgId(project.organization.id);
  }, [projectRef, projects, selectedOrgId]);

  const selectedOrganization =
    organizationOptions.find((org) => org.id === selectedOrgId) ?? null;

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
                  onChange(selected?.id ?? null);
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
              <Select value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select an environment..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {TRIGGER_DEV_ENVIRONMENTS.map(({ name, value: envValue }) => (
                    <SelectItem value={envValue} key={envValue}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
