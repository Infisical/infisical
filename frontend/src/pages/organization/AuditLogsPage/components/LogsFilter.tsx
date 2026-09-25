/* eslint-disable no-nested-ternary */
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ListFilter } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Button,
  ButtonBadge,
  Combobox,
  Field,
  FieldError,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { isOrgScopedProduct } from "@app/helpers/project";
import { useScopeVariant } from "@app/hooks";
import { useGetUserProjects } from "@app/hooks/api";
import {
  eventToNameMap,
  projectToEventsMap,
  secretEvents,
  userAgentTypeToNameMap
} from "@app/hooks/api/auditLogs/constants";
import { EventType } from "@app/hooks/api/auditLogs/enums";
import { UserAgentType } from "@app/hooks/api/auth/types";
import { Project } from "@app/hooks/api/projects/types";

import { LogFilterItem } from "./LogFilterItem";
import { auditLogFilterFormSchema, Presets, TAuditLogFilterFormData } from "./types";

const eventTypes = Object.entries(eventToNameMap).map(([value, label]) => ({ label, value }));
const userAgentTypes = Object.entries(userAgentTypeToNameMap).map(([value, label]) => ({
  label,
  value
}));

type Props = {
  presets?: Presets;
  setFilter: (data: TAuditLogFilterFormData) => void;
  filter: TAuditLogFilterFormData;
  project?: Project;
};

const getActiveFilterCount = (filter: TAuditLogFilterFormData) => {
  const fields = [
    "actor",
    "project",
    "eventType",
    "environment",
    "secretPath",
    "userAgentType",
    "secretKey"
  ] as Partial<keyof TAuditLogFilterFormData>[];

  let filterCount = 0;

  // either start or end date should only be counted as one filter
  fields.forEach((field) => {
    const value = filter?.[field];
    if (Array.isArray(value) ? value.length : value) {
      filterCount += 1;
    }
  });

  return filterCount;
};

export const LogsFilter = ({ presets, setFilter, filter, project }: Props) => {
  const { data: workspaces = [] } = useGetUserProjects();
  const { currentOrg } = useOrganization();
  const scopeVariant = useScopeVariant();

  const workspacesInOrg = workspaces.filter((ws) => ws.orgId === currentOrg?.id);

  const { control, watch, setValue, handleSubmit, formState } = useForm<TAuditLogFilterFormData>({
    resolver: zodResolver(auditLogFilterFormSchema),
    defaultValues: {
      project: null,
      environment: null,
      secretKey: "",
      secretPath: "",
      actor: presets?.actorId,
      eventType: filter?.eventType || [],
      userAgentType: null
    },
    values: {
      ...filter,
      environment: filter.environment ?? null,
      userAgentType: filter.userAgentType ?? null,
      secretPath: filter.secretPath ?? "",
      secretKey: filter.secretKey ?? ""
    }
  });
  const selectedEventTypes = watch("eventType") as EventType[] | undefined;
  const selectedProject = project ?? watch("project");

  const currentSelectedEventTypes = selectedEventTypes ?? [];
  const hasSecretEventFilter = currentSelectedEventTypes.some((eventType) =>
    secretEvents.includes(eventType)
  );
  const showSecretsSection =
    !(selectedProject?.type && isOrgScopedProduct(selectedProject.type)) &&
    (hasSecretEventFilter || currentSelectedEventTypes.length === 0);

  const filteredEventTypes = useMemo(() => {
    const projectEvents = project?.type ? projectToEventsMap[project.type] : undefined;
    if (!projectEvents) return eventTypes;

    return eventTypes.filter((v) => projectEvents.includes(v.value as EventType));
  }, [project]);

  const availableEnvironments = useMemo(() => {
    if (!selectedProject) return [];

    return workspacesInOrg.find((ws) => ws.id === selectedProject.id)?.environments ?? [];
  }, [selectedProject, workspacesInOrg]);

  const activeFilterCount = getActiveFilterCount(filter);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton
          variant="outline"
          size="sm"
          className="relative"
          aria-label={`Filter audit logs, ${activeFilterCount} active ${activeFilterCount === 1 ? "filter" : "filters"}`}
        >
          <ListFilter />
          {activeFilterCount > 0 && (
            <ButtonBadge variant="info" isSquare>
              {activeFilterCount}
            </ButtonBadge>
          )}
        </IconButton>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label="Audit log filters"
        className="max-h-(--radix-popover-content-available-height) w-96 max-w-[calc(100vw-1rem)] overflow-y-auto"
      >
        <form onSubmit={handleSubmit(setFilter)} className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Filters</span>
              <Badge isSquare variant="info">
                {activeFilterCount}
              </Badge>
            </div>
            <Button
              onClick={() => {
                setFilter({
                  eventType: presets?.eventType || [],
                  actor: presets?.actorId,
                  userAgentType: null,
                  project: null,
                  secretPath: undefined,
                  secretKey: undefined
                });
              }}
              variant="ghost"
              size="xs"
            >
              Clear Filters
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <LogFilterItem label="Events" className="sm:col-span-2">
              <Controller
                control={control}
                name="eventType"
                render={({ field }) => (
                  <Field>
                    <Combobox
                      aria-label="Events"
                      clearAriaLabel="Clear events"
                      value={filteredEventTypes.filter((eventType) =>
                        field.value.includes(eventType.value as EventType)
                      )}
                      multiple
                      isSelectAll
                      isClearable
                      onValueChange={(options) =>
                        field.onChange(options.map((option) => option.value))
                      }
                      placeholder="All events"
                      options={filteredEventTypes}
                      getOptionValue={(option) => option.value}
                      getOptionLabel={(option) => option.label}
                    />
                  </Field>
                )}
              />
            </LogFilterItem>
            <LogFilterItem label="Source">
              <Controller
                control={control}
                name="userAgentType"
                render={({ field: { onChange, value }, fieldState: { error } }) => (
                  <Field>
                    <Combobox
                      aria-label="Source"
                      clearAriaLabel="Clear source"
                      value={
                        userAgentTypes.find(
                          (userAgentType) => value === (userAgentType.value as UserAgentType)
                        ) ?? null
                      }
                      isClearable
                      onValueChange={(option) => onChange(option?.value ?? null)}
                      placeholder="All sources"
                      options={userAgentTypes}
                      getOptionValue={(option) => option.value}
                      getOptionLabel={(option) => option.label}
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
            </LogFilterItem>
            {!project && (
              <LogFilterItem label="Project">
                <Controller
                  control={control}
                  name="project"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <Field>
                      <Combobox
                        aria-label="Project"
                        clearAriaLabel="Clear project"
                        value={value ?? null}
                        isClearable
                        onValueChange={(e) => {
                          if (e === null) {
                            setValue("secretPath", "");
                            setValue("secretKey", "");
                          }
                          setValue("environment", null, { shouldDirty: true });
                          onChange(e);
                        }}
                        placeholder="All projects"
                        options={workspacesInOrg.map(({ name, id, type }) => ({
                          name,
                          id,
                          type
                        }))}
                        getOptionValue={(option) => option.id}
                        getOptionLabel={(option) => option.name}
                        isError={Boolean(error)}
                      />
                      <FieldError errors={[error]} />
                    </Field>
                  )}
                />
              </LogFilterItem>
            )}
            {showSecretsSection && (
              <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
                <div className="flex items-center gap-3 sm:col-span-2">
                  <p className="text-xs text-muted">Secrets</p>
                  <Separator className="flex-1" />
                </div>
                <LogFilterItem
                  label="Environment"
                  hoverTooltip={
                    !selectedProject
                      ? "Select a project before filtering by environment."
                      : undefined
                  }
                  className={twMerge("sm:col-span-2", !selectedProject && "opacity-50")}
                >
                  <Controller
                    control={control}
                    name="environment"
                    render={({ field: { onChange, value }, fieldState: { error } }) => (
                      <Field>
                        <Combobox
                          aria-label="Environment"
                          clearAriaLabel="Clear environment"
                          value={value ?? null}
                          isClearable
                          isDisabled={!selectedProject}
                          onValueChange={onChange}
                          placeholder="All environments"
                          options={availableEnvironments.map(({ name, slug }) => ({
                            name,
                            slug
                          }))}
                          getOptionValue={(option) => option.slug}
                          getOptionLabel={(option) => option.name}
                          isError={Boolean(error)}
                        />
                        <FieldError errors={[error]} />
                      </Field>
                    )}
                  />
                </LogFilterItem>
                <LogFilterItem
                  label="Secret Path"
                  tooltipText="Enter the exact secret path (wildcards like * are not supported)"
                  hoverTooltip={
                    !selectedProject
                      ? "Select a project before filtering by secret path."
                      : undefined
                  }
                  className={twMerge(!selectedProject && "opacity-50")}
                >
                  <Controller
                    control={control}
                    name="secretPath"
                    render={({ field: { onChange, value, ...field } }) => (
                      <Field>
                        <Input
                          placeholder="Enter secret path"
                          disabled={!selectedProject}
                          {...field}
                          value={value}
                          onChange={(e) => onChange(e.target.value)}
                        />
                      </Field>
                    )}
                  />
                </LogFilterItem>

                <LogFilterItem
                  hoverTooltip={
                    !selectedProject
                      ? "Select a project before filtering by secret key."
                      : undefined
                  }
                  tooltipText="Enter the exact secret key name (wildcards like * are not supported)"
                  className={twMerge(!selectedProject && "opacity-50")}
                  label="Secret Key"
                >
                  <Controller
                    control={control}
                    name="secretKey"
                    render={({ field: { onChange, value, ...field } }) => (
                      <Field>
                        <Input
                          disabled={!selectedProject}
                          {...field}
                          placeholder="Enter secret key"
                          value={value}
                          onChange={(e) =>
                            setValue("secretKey", e.target.value, { shouldDirty: true })
                          }
                        />
                      </Field>
                    )}
                  />
                </LogFilterItem>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button size="sm" type="submit" variant={scopeVariant} isDisabled={!formState.isDirty}>
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
};
