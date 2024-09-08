import { useState } from "react";
import { Control, Controller, UseFormReset } from "react-hook-form";
import { faFilterCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Button, DatePicker, FormControl, Select, SelectItem } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetAuditLogActorFilterOpts } from "@app/hooks/api";
import { eventToNameMap, userAgentTTypeoNameMap } from "@app/hooks/api/auditLogs/constants";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { Actor } from "@app/hooks/api/auditLogs/types";

import { AuditLogFilterFormData } from "./types";

const eventTypes = Object.entries(eventToNameMap).map(([value, label]) => ({ label, value }));
const userAgentTypes = Object.entries(userAgentTTypeoNameMap).map(([value, label]) => ({
  label,
  value
}));

type Props = {
  presetActor?: string;
  className?: string;
  control: Control<AuditLogFilterFormData>;
  reset: UseFormReset<AuditLogFilterFormData>;
};

export const LogsFilter = ({ presetActor, className, control, reset }: Props) => {
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  const { currentWorkspace } = useWorkspace();
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
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl
              label="Event"
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
                {eventTypes.map(({ label, value }) => (
                  <SelectItem value={String(value || "")} key={label}>
                    {label}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
        {!isLoading && data && data.length > 0 && !presetActor && (
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
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl
              label="Source"
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
                {userAgentTypes.map(({ label, value }) => (
                  <SelectItem value={String(value || "")} key={label}>
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
            eventType: undefined,
            actor: presetActor,
            userAgentType: undefined,
            startDate: undefined,
            endDate: undefined
          })
        }
      >
        Clear filters
      </Button>
    </div>
  );
};
