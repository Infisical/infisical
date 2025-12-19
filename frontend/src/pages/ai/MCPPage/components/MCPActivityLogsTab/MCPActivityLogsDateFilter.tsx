import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCalendar, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import ms from "ms";
import { twMerge } from "tailwind-merge";

import {
  Button,
  DatePicker,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  FormControl,
  Input,
  Select,
  SelectItem
} from "@app/components/v2";
import { formatDateTime, Timezone } from "@app/helpers/datetime";

import {
  mcpActivityLogDateFilterFormSchema,
  MCPActivityLogDateFilterType,
  TMCPActivityLogDateFilterFormData
} from "./types";

type Props = {
  setFilter: (data: TMCPActivityLogDateFilterFormData) => void;
  filter: TMCPActivityLogDateFilterFormData;
  setTimezone: (timezone: Timezone) => void;
  timezone: Timezone;
};

const RELATIVE_VALUES = ["5m", "30m", "1h", "3h", "12h"];

const RELATIVE_OPTIONS = [
  { label: "Minutes", unit: "m", values: [5, 10, 15, 30, 45] },
  { label: "Hours", unit: "h", values: [1, 2, 3, 6, 8, 12] },
  { label: "Days", unit: "d", values: [1, 2, 3, 4, 5, 6] },
  { label: "Weeks", unit: "w", values: [1, 2, 3, 4] }
];

export const MCPActivityLogsDateFilter = ({ setFilter, filter, timezone, setTimezone }: Props) => {
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const [isPopupOpen, setIsPopOpen] = useState(false);

  const { control, watch, handleSubmit, formState } = useForm<TMCPActivityLogDateFilterFormData>({
    resolver: zodResolver(mcpActivityLogDateFilterFormSchema),
    values: filter
  });
  const selectType = watch("type");
  const isCustomRelative =
    filter.type === MCPActivityLogDateFilterType.Relative &&
    !RELATIVE_VALUES.includes(filter.relativeModeValue || "");

  const onSubmit = (data: TMCPActivityLogDateFilterFormData) => {
    const endDate = data.type === MCPActivityLogDateFilterType.Relative ? new Date() : data.endDate;
    const startDate =
      data.type === MCPActivityLogDateFilterType.Relative && data.relativeModeValue
        ? new Date(Number(new Date()) - ms(data.relativeModeValue))
        : data.startDate;
    setFilter({
      ...data,
      startDate,
      endDate
    });
    setIsPopOpen(false);
  };

  return (
    <>
      <DropdownMenu open={isPopupOpen} onOpenChange={(el) => setIsPopOpen(el)}>
        <div className="flex items-center">
          {filter.type === MCPActivityLogDateFilterType.Relative ? (
            <>
              {RELATIVE_VALUES.map((el) => (
                <Button
                  variant="outline_bg"
                  className={twMerge(
                    "w-[3.82rem] rounded-none px-3 py-2 font-normal first:rounded-l-md",
                    filter.type === MCPActivityLogDateFilterType.Relative &&
                      filter.relativeModeValue === el &&
                      "border-primary/40 bg-primary/10"
                  )}
                  key={`${el}-relative`}
                  onClick={() =>
                    setFilter({
                      relativeModeValue: el,
                      type: MCPActivityLogDateFilterType.Relative,
                      endDate: new Date(),
                      startDate: new Date(Number(new Date()) - ms(el))
                    })
                  }
                >
                  {el}
                </Button>
              ))}
            </>
          ) : (
            <div className="flex w-[19.1rem] items-center justify-between rounded-l-md border border-transparent bg-mineshaft-600 px-5 py-2 text-sm text-bunker-200">
              <div>
                {formatDateTime({
                  timezone,
                  timestamp: filter.startDate,
                  dateFormat: "yyyy/MM/dd HH:mm"
                })}
              </div>
              <div>
                <FontAwesomeIcon className="text-bunker-300" size="sm" icon={faChevronRight} />
              </div>
              <div>
                {formatDateTime({
                  timezone,
                  timestamp: filter.endDate,
                  dateFormat: "yyyy/MM/dd HH:mm"
                })}
              </div>
            </div>
          )}
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline_bg"
              className={twMerge(
                "w-32 rounded-none rounded-r-md px-3 py-2 font-normal",
                (filter.type === MCPActivityLogDateFilterType.Absolute || isCustomRelative) &&
                  "border-primary/40 bg-primary/10"
              )}
            >
              <span>Custom</span> <FontAwesomeIcon className="ml-1" icon={faCalendar} />
              {filter.type === MCPActivityLogDateFilterType.Relative && isCustomRelative && (
                <span className="ml-1">({filter.relativeModeValue})</span>
              )}
            </Button>
          </DropdownMenuTrigger>
        </div>
        <DropdownMenuContent
          className="min-w-[434px]! bg-mineshaft-800 p-4"
          align="end"
          sideOffset={8}
        >
          <form onSubmit={handleSubmit(onSubmit)}>
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <div className="mb-7">
                  <Button
                    onClick={() => field.onChange(MCPActivityLogDateFilterType.Absolute)}
                    variant="outline_bg"
                    className={twMerge(
                      "h-8 rounded-r-none font-normal",
                      field.value === MCPActivityLogDateFilterType.Absolute &&
                        "border-primary/40 bg-primary/10"
                    )}
                  >
                    Absolute
                  </Button>
                  <Button
                    onClick={() => field.onChange(MCPActivityLogDateFilterType.Relative)}
                    variant="outline_bg"
                    className={twMerge(
                      "h-8 rounded-l-none font-normal",
                      field.value === MCPActivityLogDateFilterType.Relative &&
                        "border-primary/40 bg-primary/10"
                    )}
                  >
                    Relative
                  </Button>
                </div>
              )}
            />
            {selectType === MCPActivityLogDateFilterType.Relative && (
              <Controller
                control={control}
                name="relativeModeValue"
                render={({ field, fieldState: { error } }) => {
                  const duration = field.value?.substring(0, field.value.length - 1);
                  const unitOfTime = field.value?.at(-1);
                  return (
                    <div className="flex flex-col gap-4">
                      {RELATIVE_OPTIONS.map(({ label, unit, values }) => (
                        <div key={unit} className="flex items-center gap-2">
                          <div className="w-16">{label}</div>
                          {values.map((v) => {
                            const value = `${v}${unit}`;
                            return (
                              <Button
                                key={value}
                                variant="outline_bg"
                                onClick={() => field.onChange(value)}
                                className={twMerge(
                                  "h-8 w-12",
                                  field.value === value && "border-primary/40 bg-primary/10"
                                )}
                              >
                                {v}
                              </Button>
                            );
                          })}
                        </div>
                      ))}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <FormControl
                            className="mb-0 w-28"
                            label="Duration"
                            isError={Boolean(error)}
                          >
                            <Input
                              type="number"
                              value={duration}
                              onChange={(val) => {
                                const durationVal = val.target.value
                                  ? Number(val.target.value)
                                  : undefined;
                                field.onChange(`${durationVal}${unitOfTime}`);
                              }}
                              max={60}
                              min={1}
                            />
                          </FormControl>
                          <FormControl className="mb-0 w-36" label="Unit of Time">
                            <Select
                              value={unitOfTime}
                              onValueChange={(val) => field.onChange(`${duration}${val}`)}
                              className="w-full"
                              position="popper"
                            >
                              {RELATIVE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.unit} value={opt.unit}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </Select>
                          </FormControl>
                        </div>
                        {error && (
                          <span className="text-opacity-90 text-xs text-red-600">
                            {error.message}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }}
              />
            )}
            {selectType === MCPActivityLogDateFilterType.Absolute && (
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
                        label="Start Date"
                      >
                        <DatePicker
                          value={field.value || undefined}
                          onChange={onChange}
                          timezone={timezone}
                          dateFormat="P"
                          buttonClassName="w-44 h-8 font-normal"
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
                <FontAwesomeIcon
                  icon={faChevronRight}
                  size="xs"
                  className="mt-6 text-mineshaft-400"
                />
                <Controller
                  name="endDate"
                  control={control}
                  render={({ field: { onChange, ...field }, fieldState: { error } }) => {
                    return (
                      <FormControl
                        className="relative top-2"
                        errorText={error?.message}
                        isError={Boolean(error)}
                        label="End Date"
                      >
                        <DatePicker
                          value={field.value || undefined}
                          onChange={onChange}
                          dateFormat="P"
                          buttonClassName="w-44 h-8 font-normal"
                          timezone={timezone}
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
            )}
            <div className="mt-8 w-full justify-end">
              <Button
                size="sm"
                type="submit"
                className="h-9 w-24 font-normal"
                variant="outline_bg"
                isDisabled={!formState.isDirty}
              >
                Apply
              </Button>
            </div>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
      <Select
        value={timezone}
        onValueChange={(val) => setTimezone(val as Timezone)}
        className="w-[10.6rem] border border-mineshaft-500! bg-mineshaft-600! capitalize"
        dropdownContainerClassName="max-w-none"
        position="popper"
        dropdownContainerStyle={{
          width: "100%"
        }}
      >
        {Object.values(Timezone).map((tz) => (
          <SelectItem value={tz} className="capitalize" key={tz}>
            {tz} Timezone
          </SelectItem>
        ))}
      </Select>
    </>
  );
};
