/* eslint-disable no-nested-ternary */
import { useState } from "react";
import { Control, Controller, UseFormReset, UseFormWatch } from "react-hook-form";
import {
  faCheckCircle,
  faChevronDown,
  faFilterCircleXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import {
  Button,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormControl,
  Select,
  SelectItem
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetAuditLogActorFilterOpts } from "@app/hooks/api";
import { eventToNameMap, userAgentTTypeoNameMap } from "@app/hooks/api/auditLogs/constants";
import { ActorType, EventType } from "@app/hooks/api/auditLogs/enums";
import { Actor } from "@app/hooks/api/auditLogs/types";

import { AuditLogFilterFormData } from "./types";

const eventTypes = Object.entries(eventToNameMap).map(([value, label]) => ({ label, value }));
const userAgentTypes = Object.entries(userAgentTTypeoNameMap).map(([value, label]) => ({
  label,
  value
}));

type Props = {
  presets?: {
    actorId?: string;
    eventType?: EventType[];
  };
  className?: string;
  isOrgAuditLogs?: boolean;
  control: Control<AuditLogFilterFormData>;
  reset: UseFormReset<AuditLogFilterFormData>;
  watch: UseFormWatch<AuditLogFilterFormData>;
};

export const LogsFilter = ({
  presets,
  isOrgAuditLogs,
  className,
  control,
  reset,
  watch
}: Props) => {
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  const { currentWorkspace, workspaces } = useWorkspace();
  const { data, isLoading } = useGetAuditLogActorFilterOpts(currentWorkspace?.id ?? "");

  const renderActorSelectItem = (actor: Actor) => {
    switch (actor.type) {
      case ActorType.USER:
        return (
          <SelectItem
            value={`${actor.type}-${actor.metadata.userId}`}
            key={`user-actor-filter-${actor.metadata.userId}`}
          >
            {actor.metadata.email}
          </SelectItem>
        );
      case ActorType.SERVICE:
        return (
          <SelectItem
            value={`${actor.type}-${actor.metadata.serviceId}`}
            key={`service-actor-filter-${actor.metadata.serviceId}`}
          >
            {actor.metadata.name}
          </SelectItem>
        );
      case ActorType.IDENTITY:
        return (
          <SelectItem
            value={`${actor.type}-${actor.metadata.identityId}`}
            key={`identity-filter-${actor.metadata.identityId}`}
          >
            {actor.metadata.name}
          </SelectItem>
        );
      default:
        return (
          <SelectItem value="actor-none" key="actor-none">
            N/A
          </SelectItem>
        );
    }
  };

  const selectedEventTypes = watch("eventType") as EventType[] | undefined;

  return (
    <div
      className={twMerge(
        "sticky top-20 z-10 flex items-center justify-between bg-bunker-800",
        className
      )}
    >
      <div className="flex items-center space-x-2">
        <Controller
          control={control}
          name="eventType"
          render={({ field }) => (
            <FormControl label="Events">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="inline-flex w-full cursor-pointer items-center justify-between rounded-md border border-mineshaft-500 bg-mineshaft-700 px-3 py-2 font-inter text-sm font-normal text-bunker-200 outline-none data-[placeholder]:text-mineshaft-200">
                    {selectedEventTypes?.length === 1
                      ? eventTypes.find((eventType) => eventType.value === selectedEventTypes[0])
                          ?.label
                      : selectedEventTypes?.length === 0
                      ? "All events"
                      : `${selectedEventTypes?.length} events selected`}
                    <FontAwesomeIcon icon={faChevronDown} className="ml-2 text-xs" />
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="z-[100] max-h-80 overflow-hidden">
                  <div className="max-h-80 overflow-y-auto">
                    {eventTypes && eventTypes.length > 0 ? (
                      eventTypes.map((eventType) => {
                        const isSelected = selectedEventTypes?.includes(
                          eventType.value as EventType
                        );

                        return (
                          <DropdownMenuItem
                            onSelect={(event) => eventTypes.length > 1 && event.preventDefault()}
                            onClick={() => {
                              if (selectedEventTypes?.includes(eventType.value as EventType)) {
                                field.onChange(
                                  selectedEventTypes?.filter((e: string) => e !== eventType.value)
                                );
                              } else {
                                field.onChange([...(selectedEventTypes || []), eventType.value]);
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

        {!isLoading && data && data.length > 0 && !presets?.actorId && (
          <Controller
            control={control}
            name="actor"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Actor"
                errorText={error?.message}
                isError={Boolean(error)}
                className="w-40"
              >
                <Select
                  {...(field.value ? { value: field.value } : { placeholder: "Select" })}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full border border-mineshaft-500 bg-mineshaft-700 text-mineshaft-100"
                >
                  {data.map((actor) => renderActorSelectItem(actor))}
                </Select>
              </FormControl>
            )}
          />
        )}
        <Controller
          control={control}
          name="userAgentType"
          render={({ field: { onChange, value, ...field }, fieldState: { error } }) => (
            <FormControl
              label="Source"
              errorText={error?.message}
              isError={Boolean(error)}
              className="w-40"
            >
              <Select
                value={value === undefined ? "all" : value}
                {...field}
                onValueChange={(e) => {
                  if (e === "all") onChange(undefined);
                  else onChange(e);
                }}
                className={twMerge(
                  "w-full border border-mineshaft-500 bg-mineshaft-700 text-mineshaft-100",
                  value === undefined && "text-mineshaft-400"
                )}
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

        {isOrgAuditLogs && workspaces.length > 0 && (
          <Controller
            control={control}
            name="projectId"
            render={({ field: { onChange, value, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Project"
                errorText={error?.message}
                isError={Boolean(error)}
                className="w-40"
              >
                <Select
                  value={value === undefined ? "all" : value}
                  {...field}
                  onValueChange={(e) => {
                    if (e === "all") onChange(undefined);
                    else onChange(e);
                  }}
                  className={twMerge(
                    "w-full border border-mineshaft-500 bg-mineshaft-700 text-mineshaft-100",
                    value === undefined && "text-mineshaft-400"
                  )}
                >
                  <SelectItem value="all" key="all">
                    All projects
                  </SelectItem>
                  {workspaces.map((project) => (
                    <SelectItem value={String(project.id || "")} key={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
        )}
        <Controller
          name="startDate"
          control={control}
          render={({ field: { onChange, ...field }, fieldState: { error } }) => {
            return (
              <FormControl label="Start date" errorText={error?.message} isError={Boolean(error)}>
                <DatePicker
                  value={field.value || undefined}
                  onChange={(date) => {
                    onChange(date);
                    setIsStartDatePickerOpen(false);
                  }}
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
        <Controller
          name="endDate"
          control={control}
          render={({ field: { onChange, ...field }, fieldState: { error } }) => {
            return (
              <FormControl label="End date" errorText={error?.message} isError={Boolean(error)}>
                <DatePicker
                  value={field.value || undefined}
                  onChange={(pickedDate) => {
                    pickedDate?.setHours(23, 59, 59, 999); // we choose the end of today not the start of it (going off of aws cloud watch)
                    onChange(pickedDate);
                    setIsEndDatePickerOpen(false);
                  }}
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
      <Button
        isLoading={false}
        colorSchema="primary"
        variant="outline_bg"
        className="mt-1.5"
        type="submit"
        leftIcon={<FontAwesomeIcon icon={faFilterCircleXmark} />}
        onClick={() =>
          reset({
            eventType: presets?.eventType || [],
            actor: presets?.actorId,
            userAgentType: undefined,
            startDate: undefined,
            endDate: undefined,
            projectId: undefined
          })
        }
      >
        Clear filters
      </Button>
    </div>
  );
};
