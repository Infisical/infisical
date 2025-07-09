import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faArrowRight, faCalendar, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
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

import {
  auditLogDateFilterFormSchema,
  AuditLogDateFilterType,
  TAuditLogDateFilterFormData
} from "./types";

type Props = {
  setFilter: (data: TAuditLogDateFilterFormData) => void;
  filter: TAuditLogDateFilterFormData;
};
const RELATIVE_VALUES = ["5m", "30m", "1h", "3h", "12h"];
export const LogsDateFilter = ({ setFilter, filter }: Props) => {
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const [isPopupOpen, setIsPopOpen] = useState(false);

  const { control, watch, handleSubmit, formState } = useForm<TAuditLogDateFilterFormData>({
    resolver: zodResolver(auditLogDateFilterFormSchema),
    values: filter
  });
  const selectType = watch("type");
  const isCustomRelative =
    filter.type === AuditLogDateFilterType.Relative &&
    !RELATIVE_VALUES.includes(filter.relativeModeValue || "");

  const onSubmit = (data: TAuditLogDateFilterFormData) => {
    const endDate = data.type === AuditLogDateFilterType.Relative ? new Date() : data.endDate;
    const startDate =
      data.type === AuditLogDateFilterType.Relative && data.relativeModeValue
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
    <DropdownMenu open={isPopupOpen} onOpenChange={(el) => setIsPopOpen(el)}>
      <div className="mr-2 flex items-center">
        {filter.type === AuditLogDateFilterType.Relative ? (
          <>
            {RELATIVE_VALUES.map((el) => (
              <Button
                variant="outline_bg"
                className={twMerge(
                  "rounded-none px-3 py-2 first:rounded-l-md",
                  filter.type === AuditLogDateFilterType.Relative &&
                    filter.relativeModeValue === el &&
                    "border-primary/40 bg-primary/[0.1]"
                )}
                key={`${el}-relative`}
                onClick={() =>
                  setFilter({
                    relativeModeValue: el,
                    type: AuditLogDateFilterType.Relative,
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
          <>
            <div className="rounded-l-md border border-transparent bg-mineshaft-600 px-3 py-2 text-sm text-bunker-200">
              {format(filter.startDate, "yyyy-MM-dd HH:mm")}
            </div>
            <div className="border border-transparent bg-mineshaft-600 px-3 py-2 text-sm text-bunker-200">
              <FontAwesomeIcon icon={faChevronRight} />
            </div>
            <div className="border border-transparent bg-mineshaft-600 px-3 py-2 text-sm text-bunker-200">
              {format(filter.endDate, "yyyy-MM-dd HH:mm")}
            </div>
          </>
        )}
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline_bg"
            className={twMerge(
              "rounded-none rounded-r-md px-3 py-2",
              (filter.type === AuditLogDateFilterType.Absolute || isCustomRelative) &&
                "border-primary/40 bg-primary/[0.1]"
            )}
          >
            <FontAwesomeIcon icon={faCalendar} />
            {filter.type === AuditLogDateFilterType.Relative && isCustomRelative && (
              <span className="ml-1">({filter.relativeModeValue})</span>
            )}
          </Button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent className="min-w-80 p-4" align="center" alignOffset={16}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <FormControl className="mb-2 w-full">
                <Select
                  value={field.value}
                  onValueChange={(el) => field.onChange(el)}
                  className="w-full"
                >
                  <SelectItem value={AuditLogDateFilterType.Relative}>Relative</SelectItem>
                  <SelectItem value={AuditLogDateFilterType.Absolute}>Absolute</SelectItem>
                </Select>
              </FormControl>
            )}
          />
          {selectType === AuditLogDateFilterType.Relative && (
            <Controller
              control={control}
              name="relativeModeValue"
              render={({ field }) => (
                <FormControl className="mb-0 w-full" helperText="Example: 1h, 1d, 2d">
                  <Input {...field} value={field.value || ""} />
                </FormControl>
              )}
            />
          )}
          {selectType === AuditLogDateFilterType.Absolute && (
            <div className="mb-2 flex h-10 w-full items-center justify-between gap-2">
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
          )}
          <div className="mt-4">
            <Button size="xs" type="submit" isDisabled={!formState.isDirty}>
              Apply
            </Button>
          </div>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
