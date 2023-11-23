import { useState } from "react";
import { Control, Controller, UseFormReset } from "react-hook-form";
import { faFilterCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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
  control: Control<AuditLogFilterFormData>;
  reset: UseFormReset<AuditLogFilterFormData>;
};

export const LogsFilter = ({ control, reset }: Props) => {
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  const { currentWorkspace } = useWorkspace();
  const { data, isLoading } = useGetAuditLogActorFilterOpts(currentWorkspace?._id ?? "");

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
      case ActorType.SERVICE_V3:
        return (
          <SelectItem
            value={`${actor.type}-${actor.metadata.serviceId}`}
            key={`service-actor-v3-filter-${actor.metadata.serviceId}`}
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
    <div className="flex justify-between items-center sticky top-20 z-10 bg-bunker-800">
      <div className="flex items-center">
        <Controller
          control={control}
          name="eventType"
          render={({ field: { onChange, ...field }, fieldState: { error } }) => (
            <FormControl
              label="Event"
              errorText={error?.message}
              isError={Boolean(error)}
              className="w-40 mr-4"
            >
              <Select
                {...(field.value ? { value: field.value } : { placeholder: "Select" })}
                {...field}
                onValueChange={(e) => onChange(e)}
                className="w-full bg-mineshaft-700 border border-mineshaft-500 text-mineshaft-100"
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
        {!isLoading && data && data.length > 0 && (
          <Controller
            control={control}
            name="actor"
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl
                label="Actor"
                errorText={error?.message}
                isError={Boolean(error)}
                className="w-40 mr-4"
              >
                <Select
                  {...(field.value ? { value: field.value } : { placeholder: "Select" })}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full bg-mineshaft-700 border border-mineshaft-500 text-mineshaft-100"
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
              className="w-40 mr-4"
            >
              <Select
                {...(field.value ? { value: field.value } : { placeholder: "Select" })}
                {...field}
                onValueChange={(e) => onChange(e)}
                className="w-full bg-mineshaft-700 border border-mineshaft-500 text-mineshaft-100"
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
              <FormControl
                label="Start date"
                errorText={error?.message}
                isError={Boolean(error)}
                className="mr-4"
              >
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
                  onChange={(date) => {
                    onChange(date);
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
      <div>
        <Button
          isLoading={false}
          colorSchema="primary"
          variant="outline_bg"
          type="submit"
          leftIcon={<FontAwesomeIcon icon={faFilterCircleXmark} className="mr-2" />}
          onClick={() =>
            reset({
              eventType: undefined,
              actor: undefined,
              userAgentType: undefined,
              startDate: undefined,
              endDate: undefined
            })
          }
        >
          Clear filters
        </Button>
      </div>
    </div>
  );
};
