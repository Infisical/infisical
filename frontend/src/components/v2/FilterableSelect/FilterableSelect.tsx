import Select, { Props } from "react-select";
import { twMerge } from "tailwind-merge";

import {
  ClearIndicator,
  DropdownIndicator,
  Group,
  MultiValueRemove,
  Option
} from "../Select/components";

export const FilterableSelect = <T,>({
  isMulti,
  closeMenuOnSelect,
  tabSelectsValue = false,
  groupBy = null,
  getGroupHeaderLabel = null,
  options = [],
  menuListClassName,
  ...props
}: Props<T> & {
  groupBy?: string | null;
  getGroupHeaderLabel?: ((groupValue: any) => string) | null;
  menuListClassName?: string;
}) => {
  let processedOptions = options;

  if (groupBy && Array.isArray(options)) {
    const groupedOptions = options.reduce((acc, option) => {
      const groupValue = option[groupBy];
      const groupKey = groupValue?.toString() || "undefined";

      if (!acc[groupKey]) {
        acc[groupKey] = {
          label: getGroupHeaderLabel ? getGroupHeaderLabel(groupValue) : groupValue,
          options: []
        };
      }

      acc[groupKey].options.push(option);
      return acc;
    }, {});

    processedOptions = Object.values(groupedOptions);
  }

  return (
    <Select
      isMulti={isMulti}
      closeMenuOnSelect={closeMenuOnSelect ?? !isMulti}
      hideSelectedOptions={false}
      unstyled
      options={processedOptions}
      styles={{
        input: (base) => ({
          ...base,
          "input:focus": {
            boxShadow: "none"
          }
        }),
        multiValueLabel: (base) => ({
          ...base,
          whiteSpace: "normal",
          overflow: "visible"
        }),
        control: (base) => ({
          ...base,
          transition: "none"
        }),
        menuPortal: (provided) => ({
          ...provided,
          zIndex: 99999
        })
      }}
      tabSelectsValue={tabSelectsValue}
      components={{
        DropdownIndicator,
        ClearIndicator,
        MultiValueRemove,
        Option,
        Group,
        ...props.components
      }}
      classNames={{
        container: ({ isDisabled }) =>
          twMerge("w-full font-inter text-sm", isDisabled && "pointer-events-auto! opacity-50"),
        control: ({ isFocused, isDisabled }) =>
          twMerge(
            isFocused ? "border-project/50" : "border-border",
            `w-full rounded-md border bg-card p-0.5 font-inter text-foreground ${
              isDisabled ? "cursor-not-allowed!" : "hover:cursor-pointer hover:border-foreground/20"
            } `
          ),
        placeholder: () => `${isMulti ? "py-[0.22rem]" : "leading-7"} text-muted text-sm pl-1`,
        input: () => `pl-1 ${isMulti ? "py-[0.22rem]" : ""}`,
        valueContainer: () =>
          `px-1 max-h-[8.2rem] ${
            isMulti ? "overflow-y-auto! thin-scrollbar py-1" : "py-[0.1rem]"
          } gap-1`,
        singleValue: () => "leading-7 ml-1",
        multiValue: () => "bg-foreground/10 text-sm rounded-sm items-center py-0.5 px-2 gap-1.5",
        multiValueLabel: () => "leading-6 text-sm",
        multiValueRemove: () => "hover:text-danger text-muted",
        indicatorsContainer: () => "p-1 gap-1",
        clearIndicator: () => "p-1 hover:text-danger text-muted",
        indicatorSeparator: () => "bg-muted",
        dropdownIndicator: () => "text-foreground p-1",
        menuList: () => twMerge("flex flex-col gap-1", menuListClassName),
        menu: () =>
          "my-2 p-2 border text-sm text-foreground thin-scrollbar bg-popover border-border rounded-md",
        groupHeading: () => "ml-3 mt-2 mb-1 text-muted text-sm",
        option: ({ isFocused, isSelected }) =>
          twMerge(
            isFocused && "bg-container-hover active:bg-foreground/10",
            isSelected && "text-foreground",
            "rounded-sm px-3 py-2 text-xs hover:cursor-pointer"
          ),
        noOptionsMessage: () => "text-muted p-2 rounded-md",
        loadingMessage: () => "text-muted p-2 rounded-md"
      }}
      {...props}
    />
  );
};
