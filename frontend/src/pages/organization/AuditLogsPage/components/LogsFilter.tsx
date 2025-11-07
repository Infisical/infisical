/* eslint-disable no-nested-ternary */
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { MultiValue, SingleValue } from "react-select";
import { faFilterCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  FilterableSelect,
  FormControl,
  Input
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useGetUserProjects } from "@app/hooks/api";
import {
  eventToNameMap,
  projectToEventsMap,
  secretEvents,
  userAgentTypeToNameMap
} from "@app/hooks/api/auditLogs/constants";
import { EventType } from "@app/hooks/api/auditLogs/enums";
import { UserAgentType } from "@app/hooks/api/auth/types";
import { Project, ProjectType } from "@app/hooks/api/projects/types";

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

  const workspacesInOrg = workspaces.filter((ws) => ws.orgId === currentOrg?.id);

  const { control, watch, resetField, setValue, handleSubmit, formState } =
    useForm<TAuditLogFilterFormData>({
      resolver: zodResolver(auditLogFilterFormSchema),
      defaultValues: {
        project: null,
        environment: undefined,
        secretKey: "",
        secretPath: "",
        actor: presets?.actorId,
        eventType: filter?.eventType || [],
        userAgentType: undefined
      },
      values: filter
    });
  const selectedEventTypes = watch("eventType") as EventType[] | undefined;
  const selectedProject = project ?? watch("project");

  const currentSelectedEventTypes = selectedEventTypes ?? [];
  const hasSecretEventFilter = currentSelectedEventTypes.some((eventType) =>
    secretEvents.includes(eventType)
  );
  const showSecretsSection =
    selectedProject?.type !== ProjectType.PAM &&
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline_bg" colorSchema="primary" className="relative">
          <FontAwesomeIcon icon={faFilterCircleXmark} />
          {activeFilterCount > 0 && (
            <Badge className="absolute -top-2 -right-2" variant="info">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="mt-4 overflow-visible py-4">
        <form onSubmit={handleSubmit(setFilter)}>
          <div className="flex max-w-96 min-w-96 flex-col font-inter">
            <div className="mb-3 flex items-center border-b border-b-mineshaft-500 px-3 pb-2">
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>Filters</span>
                  <Badge isSquare variant="info">
                    {activeFilterCount}
                  </Badge>
                </div>
                <Button
                  onClick={() => {
                    setFilter({
                      eventType: presets?.eventType || [],
                      actor: presets?.actorId,
                      userAgentType: undefined,
                      project: null,
                      secretPath: undefined,
                      secretKey: undefined
                    });
                  }}
                  variant="link"
                  className="text-mineshaft-400"
                  size="xs"
                >
                  Clear filters
                </Button>
              </div>
            </div>

            <div className="px-3">
              <LogFilterItem
                label="Events"
                onClear={() => {
                  setValue("eventType", [], { shouldDirty: true });
                }}
              >
                <Controller
                  control={control}
                  name="eventType"
                  render={({ field }) => (
                    <FormControl>
                      <FilterableSelect
                        value={filteredEventTypes.filter((eventType) =>
                          field.value.includes(eventType.value as EventType)
                        )}
                        isMulti
                        isClearable
                        onChange={(options) =>
                          field.onChange(
                            (options as MultiValue<(typeof filteredEventTypes)[number]>).map(
                              (option) => option.value
                            )
                          )
                        }
                        placeholder="All events"
                        options={filteredEventTypes}
                        getOptionValue={(option) => option.value}
                        getOptionLabel={(option) => option.label}
                      />
                    </FormControl>
                  )}
                />
              </LogFilterItem>
              <LogFilterItem
                label="Source"
                onClear={() => {
                  setValue("userAgentType", undefined, { shouldDirty: true });
                }}
              >
                <Controller
                  control={control}
                  name="userAgentType"
                  render={({ field: { onChange, value }, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error)}
                      className="w-full"
                    >
                      <FilterableSelect
                        value={
                          userAgentTypes.find(
                            (userAgentType) => value === (userAgentType.value as UserAgentType)
                          ) ?? null
                        }
                        isClearable
                        onChange={(option) =>
                          onChange((option as SingleValue<(typeof userAgentTypes)[number]>)?.value)
                        }
                        placeholder="All sources"
                        options={userAgentTypes}
                        getOptionValue={(option) => option.value}
                        getOptionLabel={(option) => option.label}
                      />
                    </FormControl>
                  )}
                />
              </LogFilterItem>
              {!project && (
                <LogFilterItem
                  label="Project"
                  onClear={() => {
                    setValue("project", null, { shouldDirty: true });
                    setValue("environment", undefined, { shouldDirty: true });
                    setValue("secretPath", "", { shouldDirty: true });
                    setValue("secretKey", "", { shouldDirty: true });
                  }}
                >
                  <Controller
                    control={control}
                    name="project"
                    render={({ field: { onChange, value }, fieldState: { error } }) => (
                      <FormControl
                        errorText={error?.message}
                        isError={Boolean(error)}
                        className="mb-0 w-full"
                      >
                        <FilterableSelect
                          value={value}
                          isClearable
                          onChange={(e) => {
                            if (e === null) {
                              setValue("secretPath", "");
                              setValue("secretKey", "");
                            }
                            resetField("environment");
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
                        />
                      </FormControl>
                    )}
                  />
                </LogFilterItem>
              )}
              <AnimatePresence initial={false}>
                {showSecretsSection && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="mt-2 mb-3">
                      <p className="text-xs opacity-60">Secrets</p>
                      <div className="h-px w-full rounded-full bg-mineshaft-500" />
                    </div>
                    <LogFilterItem
                      label="Environment"
                      hoverTooltip={
                        !selectedProject
                          ? "Select a project before filtering by environment."
                          : undefined
                      }
                      className={twMerge(!selectedProject && "opacity-50")}
                      onClear={() => {
                        setValue("environment", undefined, { shouldDirty: true });
                      }}
                    >
                      <Controller
                        control={control}
                        name="environment"
                        render={({ field: { onChange, value }, fieldState: { error } }) => (
                          <FormControl
                            errorText={error?.message}
                            isError={Boolean(error)}
                            className="w-full"
                          >
                            <FilterableSelect
                              value={value}
                              menuPlacement="top"
                              key={value?.name || "filter-environment"}
                              isClearable
                              isDisabled={!selectedProject}
                              onChange={(e) => onChange(e)}
                              placeholder="All environments"
                              options={availableEnvironments.map(({ name, slug }) => ({
                                name,
                                slug
                              }))}
                              getOptionValue={(option) => option.slug}
                              getOptionLabel={(option) => option.name}
                            />
                          </FormControl>
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
                      onClear={() => {
                        setValue("secretPath", "", { shouldDirty: true });
                      }}
                    >
                      <Controller
                        control={control}
                        name="secretPath"
                        render={({ field: { onChange, value, ...field } }) => (
                          <FormControl className="w-full">
                            <Input
                              placeholder="Enter secret path"
                              className="disabled:cursor-not-allowed"
                              isDisabled={!selectedProject}
                              {...field}
                              value={value}
                              onChange={(e) => onChange(e.target.value)}
                            />
                          </FormControl>
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
                      onClear={() => {
                        setValue("secretKey", "", { shouldDirty: true });
                      }}
                    >
                      <Controller
                        control={control}
                        name="secretKey"
                        render={({ field: { onChange, value, ...field } }) => (
                          <FormControl className="w-full">
                            <Input
                              isDisabled={!selectedProject}
                              {...field}
                              placeholder="Enter secret key"
                              className="disabled:cursor-not-allowed"
                              value={value}
                              onChange={(e) =>
                                setValue("secretKey", e.target.value, { shouldDirty: true })
                              }
                            />
                          </FormControl>
                        )}
                      />
                    </LogFilterItem>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="mt-2 px-3">
              <Button size="xs" type="submit" isDisabled={!formState.isDirty}>
                Apply
              </Button>
            </div>
          </div>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
