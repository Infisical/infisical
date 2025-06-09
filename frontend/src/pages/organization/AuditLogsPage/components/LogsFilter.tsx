/* eslint-disable no-nested-ternary */
import { useMemo, useState } from "react";
import {
  Control,
  Controller,
  UseFormGetFieldState,
  UseFormReset,
  UseFormResetField,
  UseFormSetValue,
  UseFormWatch
} from "react-hook-form";
import {
  faArrowRight,
  faCaretDown,
  faCheckCircle,
  faFilterCircleXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Button,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FilterableSelect,
  FormControl,
  Input,
  Select,
  SelectItem
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useGetUserWorkspaces } from "@app/hooks/api";
import {
  eventToNameMap,
  secretEvents,
  userAgentTypeToNameMap
} from "@app/hooks/api/auditLogs/constants";
import { EventType } from "@app/hooks/api/auditLogs/enums";
import { UserAgentType } from "@app/hooks/api/auth/types";

import { LogFilterItem } from "./LogFilterItem";
import { AuditLogFilterFormData, Presets } from "./types";

const eventTypes = Object.entries(eventToNameMap).map(([value, label]) => ({ label, value }));
const userAgentTypes = Object.entries(userAgentTypeToNameMap).map(([value, label]) => ({
  label,
  value
}));

type Props = {
  presets?: Presets;
  control: Control<AuditLogFilterFormData>;
  reset: UseFormReset<AuditLogFilterFormData>;
  resetField: UseFormResetField<AuditLogFilterFormData>;
  watch: UseFormWatch<AuditLogFilterFormData>;
  getFieldState: UseFormGetFieldState<AuditLogFilterFormData>;
  setValue: UseFormSetValue<AuditLogFilterFormData>;
};

const getActiveFilterCount = (
  getFieldState: UseFormGetFieldState<AuditLogFilterFormData>,
  watch: UseFormWatch<AuditLogFilterFormData>
) => {
  const fields = [
    "actor",
    "project",
    "eventType",
    "startDate",
    "endDate",
    "environment",
    "secretPath",
    "userAgentType",
    "secretKey"
  ] as Partial<keyof AuditLogFilterFormData>[];

  let filterCount = 0;

  // either start or end date should only be counted as one filter
  let dateProcessed = false;

  fields.forEach((field) => {
    const fieldState = getFieldState(field);

    if (
      field === "userAgentType" ||
      field === "environment" ||
      field === "secretKey" ||
      field === "secretPath"
    ) {
      const value = watch(field);

      if (value !== undefined && value !== "") {
        filterCount += 1;
      }
    } else if (fieldState.isDirty && !dateProcessed) {
      filterCount += 1;

      if (field === "startDate" || field === "endDate") {
        dateProcessed = true;
      }
    }
  });

  return filterCount;
};

export const LogsFilter = ({
  presets,
  control,
  reset,
  resetField,
  watch,
  getFieldState,
  setValue
}: Props) => {
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  const { data: workspaces = [] } = useGetUserWorkspaces();
  const { currentOrg } = useOrganization();

  const workspacesInOrg = workspaces.filter((ws) => ws.orgId === currentOrg?.id);

  const selectedEventTypes = watch("eventType") as EventType[] | undefined;
  const selectedProject = watch("project");

  const showSecretsSection =
    selectedEventTypes?.some(
      (eventType) => secretEvents.includes(eventType) && eventType !== EventType.GET_SECRETS
    ) || selectedEventTypes?.length === 0;

  const availableEnvironments = useMemo(() => {
    if (!selectedProject) return [];

    return workspacesInOrg.find((ws) => ws.id === selectedProject.id)?.environments ?? [];
  }, [selectedProject, workspacesInOrg]);

  const activeFilterCount = getActiveFilterCount(getFieldState, watch);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline_bg" colorSchema="primary">
          <FontAwesomeIcon icon={faFilterCircleXmark} className="mr-3 px-[0.1rem]" />
          Filters
          {activeFilterCount > 0 && (
            <Badge className="ml-2 px-1.5 py-0.5" variant="primary">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="mt-4 py-4">
        <div className="flex min-w-64 flex-col font-inter">
          <div className="mb-3 flex items-center border-b border-b-mineshaft-500 px-3 pb-2">
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <span>Filters</span>
                <Badge className="px-1.5 py-0.5" variant="primary">
                  {activeFilterCount}
                </Badge>
              </div>
              <Button
                onClick={() => {
                  reset({
                    eventType: presets?.eventType || [],
                    actor: presets?.actorId,
                    userAgentType: undefined,
                    startDate: undefined,
                    endDate: undefined,
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
                resetField("eventType");
              }}
            >
              <Controller
                control={control}
                name="eventType"
                render={({ field }) => (
                  <FormControl>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div className="thin-scrollbar inline-flex w-full cursor-pointer items-center justify-between whitespace-nowrap rounded-md border border-mineshaft-500 bg-mineshaft-700 px-3 py-2 font-inter text-sm font-normal text-bunker-200 outline-none data-[placeholder]:text-mineshaft-200">
                          {selectedEventTypes?.length === 1
                            ? eventTypes.find(
                                (eventType) => eventType.value === selectedEventTypes[0]
                              )?.label
                            : selectedEventTypes?.length === 0
                              ? "All events"
                              : `${selectedEventTypes?.length} events selected`}
                          <FontAwesomeIcon icon={faCaretDown} className="ml-2 text-xs" />
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="thin-scrollbar z-[100] max-h-80 overflow-hidden"
                      >
                        <div className="max-h-80 overflow-y-auto">
                          {eventTypes && eventTypes.length > 0 ? (
                            eventTypes.map((eventType) => {
                              const isSelected = selectedEventTypes?.includes(
                                eventType.value as EventType
                              );

                              return (
                                <DropdownMenuItem
                                  onSelect={(event) =>
                                    eventTypes.length > 1 && event.preventDefault()
                                  }
                                  onClick={() => {
                                    if (
                                      selectedEventTypes?.includes(eventType.value as EventType)
                                    ) {
                                      field.onChange(
                                        selectedEventTypes?.filter(
                                          (e: string) => e !== eventType.value
                                        )
                                      );
                                    } else {
                                      field.onChange([
                                        ...(selectedEventTypes || []),
                                        eventType.value
                                      ]);
                                    }
                                  }}
                                  key={`event-type-${eventType.value}`}
                                  icon={
                                    isSelected ? (
                                      <FontAwesomeIcon
                                        icon={faCheckCircle}
                                        className="pr-0.5 text-primary"
                                      />
                                    ) : (
                                      <div className="pl-[1.01rem]" />
                                    )
                                  }
                                  iconPos="left"
                                  className="w-[28.4rem] text-sm"
                                >
                                  {eventType.label}
                                </DropdownMenuItem>
                              );
                            })
                          ) : (
                            <div />
                          )}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </FormControl>
                )}
              />
            </LogFilterItem>
            <LogFilterItem
              label="Source"
              onClear={() => {
                resetField("userAgentType");
              }}
            >
              <Controller
                control={control}
                name="userAgentType"
                render={({ field: { onChange, value, ...field }, fieldState: { error } }) => (
                  <FormControl
                    errorText={error?.message}
                    isError={Boolean(error)}
                    className="w-full"
                  >
                    <Select
                      value={value === undefined ? "all" : value}
                      {...field}
                      onValueChange={(e) => {
                        if (e === "all") onChange(undefined);
                        else setValue("userAgentType", e as UserAgentType, { shouldDirty: true });
                      }}
                      className={twMerge("w-full border border-mineshaft-500 bg-mineshaft-700")}
                    >
                      <SelectItem value="all" key="all">
                        All sources
                      </SelectItem>
                      {userAgentTypes.map(({ label, value: userAgent }) => (
                        <SelectItem value={userAgent} key={label}>
                          {label}
                        </SelectItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />
            </LogFilterItem>

            <LogFilterItem
              label="Date"
              onClear={() => {
                resetField("startDate");
                resetField("endDate");
              }}
            >
              <div className="flex h-10 w-full items-center justify-between gap-2">
                <Controller
                  name="startDate"
                  control={control}
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => {
                    return (
                      <FormControl
                        className="relative top-2"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <DatePicker
                          value={field.value || undefined}
                          onChange={onChange}
                          dateFormat="P"
                          popUpProps={{
                            open: isStartDatePickerOpen,
                            onOpenChange: setIsStartDatePickerOpen
                          }}
                          popUpContentProps={{}}
                        />
                      </FormControl>
                    );
                  }}
                />

                <div className="flex items-center -space-x-3">
                  <div className="h-[2px] w-[20px] rounded-full bg-mineshaft-500" />
                  <FontAwesomeIcon icon={faArrowRight} className="text-mineshaft-500" />
                </div>

                <Controller
                  name="endDate"
                  control={control}
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => {
                    return (
                      <FormControl
                        className="relative top-2"
                        errorText={error?.message}
                        isError={Boolean(error)}
                      >
                        <DatePicker
                          value={field.value || undefined}
                          onChange={onChange}
                          dateFormat="P"
                          popUpProps={{
                            open: isEndDatePickerOpen,
                            onOpenChange: setIsEndDatePickerOpen
                          }}
                          popUpContentProps={{}}
                        />
                      </FormControl>
                    );
                  }}
                />
              </div>
            </LogFilterItem>
            <AnimatePresence initial={false}>
              {showSecretsSection && (
                <motion.div
                  className="mt-2 overflow-hidden"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="mb-3 mt-2">
                    <p className="text-xs opacity-60">Secrets</p>
                    <div className="h-[1px] w-full rounded-full bg-mineshaft-500" />
                  </div>

                  <LogFilterItem
                    label="Project"
                    onClear={() => {
                      resetField("project");
                      resetField("environment");
                      setValue("secretPath", "");
                      setValue("secretKey", "");
                    }}
                  >
                    <Controller
                      control={control}
                      name="project"
                      render={({ field: { onChange, value }, fieldState: { error } }) => (
                        <FormControl
                          errorText={error?.message}
                          isError={Boolean(error)}
                          className="w-full"
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

                  <LogFilterItem
                    label="Environment"
                    hoverTooltip={
                      !selectedProject
                        ? "Select a project before filtering by environment."
                        : undefined
                    }
                    className={twMerge(!selectedProject && "opacity-50")}
                    onClear={() => {
                      resetField("environment");
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
                    hoverTooltip={
                      !selectedProject
                        ? "Select a project before filtering by secret path."
                        : undefined
                    }
                    className={twMerge(!selectedProject && "opacity-50")}
                    onClear={() => {
                      setValue("secretPath", "");
                    }}
                  >
                    <Controller
                      control={control}
                      name="secretPath"
                      render={({ field: { onChange, value, ...field } }) => (
                        <FormControl
                          tooltipText="Filter audit logs related to events that occurred on a specific secret path."
                          className="w-full"
                        >
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
                    className={twMerge(!selectedProject && "opacity-50")}
                    label="Secret Key"
                    onClear={() => {
                      setValue("secretKey", "");
                    }}
                  >
                    <Controller
                      control={control}
                      name="secretKey"
                      render={({ field: { onChange, value, ...field } }) => (
                        <FormControl
                          tooltipText="Filter audit logs related to a specific secret."
                          className="w-full"
                        >
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
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
