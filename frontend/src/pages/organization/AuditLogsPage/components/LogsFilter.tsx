/* eslint-disable no-nested-ternary */
import { useState } from "react";
import { Control, Controller, UseFormReset, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { faCaretDown, faCheckCircle, faFilterCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import {
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
import { useGetAuditLogActorFilterOpts, useGetUserWorkspaces } from "@app/hooks/api";
import { eventToNameMap, userAgentTTypeoNameMap } from "@app/hooks/api/auditLogs/constants";
import { ActorType, EventType } from "@app/hooks/api/auditLogs/enums";
import { Actor } from "@app/hooks/api/auditLogs/types";
import { ProjectType } from "@app/hooks/api/workspace/types";

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
  setValue: UseFormSetValue<AuditLogFilterFormData>;
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
  setValue,
  watch
}: Props) => {
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  const { data: workspaces = [] } = useGetUserWorkspaces();
  const { currentOrg } = useOrganization();

  const workspacesInOrg = workspaces.filter((ws) => ws.orgId === currentOrg?.id);

  const { data, isPending } = useGetAuditLogActorFilterOpts(workspaces?.[0]?.id ?? "");

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
  const selectedProject = watch("project");

  return (
    <div
      className={twMerge(
        "sticky top-20 z-10 flex flex-wrap items-center justify-between bg-bunker-800",
        className
      )}
    >
      <div className="flex items-center gap-4">
        {isOrgAuditLogs && workspacesInOrg.length > 0 && (
          <Controller
            control={control}
            name="project"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <FormControl
                label="Project"
                errorText={error?.message}
                isError={Boolean(error)}
                className="w-64"
              >
                <FilterableSelect
                  value={value}
                  isClearable
                  onChange={(e) => {
                    if (e === null) {
                      setValue("secretPath", "");
                    }
                    onChange(e);
                  }}
                  placeholder="Select a project..."
                  options={workspacesInOrg.map(({ name, id, type }) => ({ name, id, type }))}
                  getOptionValue={(option) => option.id}
                  getOptionLabel={(option) => option.name}
                />
              </FormControl>
            )}
          />
        )}
        {selectedProject?.type === ProjectType.SecretManager && (
          <Controller
            control={control}
            name="secretPath"
            render={({ field: { onChange, value, ...field } }) => (
              <FormControl label="Secret path" className="w-40">
                <Input {...field} value={value} onChange={(e) => onChange(e.target.value)} />
              </FormControl>
            )}
          />
        )}
      </div>
      <div className="mt-1 flex items-center space-x-2">
        <Controller
          control={control}
          name="eventType"
          render={({ field }) => (
            <FormControl label="Events">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div className="inline-flex w-full cursor-pointer items-center justify-between whitespace-nowrap rounded-md border border-mineshaft-500 bg-mineshaft-700 px-3 py-2 font-inter text-sm font-normal text-bunker-200 outline-none data-[placeholder]:text-mineshaft-200">
                    {selectedEventTypes?.length === 1
                      ? eventTypes.find((eventType) => eventType.value === selectedEventTypes[0])
                          ?.label
                      : selectedEventTypes?.length === 0
                        ? "All events"
                        : `${selectedEventTypes?.length} events selected`}
                    <FontAwesomeIcon icon={faCaretDown} className="ml-2 text-xs" />
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

        {!isPending && data && data.length > 0 && !presets?.actorId && (
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
        <Controller
          name="startDate"
          control={control}
          render={({ field: { onChange, ...field }, fieldState: { error } }) => {
            return (
              <FormControl label="Start date" errorText={error?.message} isError={Boolean(error)}>
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
        <Controller
          name="endDate"
          control={control}
          render={({ field: { onChange, ...field }, fieldState: { error } }) => {
            return (
              <FormControl label="End date" errorText={error?.message} isError={Boolean(error)}>
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
        <Button
          isLoading={false}
          colorSchema="primary"
          variant="outline_bg"
          className="mt-[0.45rem]"
          type="submit"
          leftIcon={<FontAwesomeIcon icon={faFilterCircleXmark} />}
          onClick={() =>
            reset({
              eventType: presets?.eventType || [],
              actor: presets?.actorId,
              userAgentType: undefined,
              startDate: undefined,
              endDate: undefined,
              project: null
            })
          }
        >
          Clear filters
        </Button>
      </div>
    </div>
  );
};
