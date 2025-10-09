import Select, { Props } from "react-select";
import { twMerge } from "tailwind-merge";

import { ClearIndicator, DropdownIndicator, Group, MultiValueRemove, Option } from "./components";

export const FilterableSelect = <T,>({
  isMulti,
  closeMenuOnSelect,
  tabSelectsValue = false,
  groupBy = null,
  getGroupHeaderLabel = null,
  options = [],
  ...props
}: Props<T> & {
  groupBy?: string | null;
  getGroupHeaderLabel?: ((groupValue: any) => string) | null;
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
          twMerge("min-h-9 w-full text-sm", isDisabled && "!pointer-events-auto opacity-50"),
        control: ({ isFocused }) =>
          twMerge(
            isFocused && "ring-2 ring-ring",
            "box-border !min-h-9 w-full rounded-[4px] border border-border bg-input pl-2"
          ),
        input: () => "text-foreground cursor-text pt-0.5",
        loadingIndicator: () => "text-placeholder",
        placeholder: () => "text-placeholder pt-0.5",
        valueContainer: () =>
          twMerge("max-h-[8.2rem] gap-1", isMulti && "thin-scrollbar !overflow-y-auto py-[5px]"),
        singleValue: () => "pt-0.5 text-foreground",
        multiValue: () =>
          "text-background bg-accent text-xs rounded-[4px] items-center [&_svg]:size-[14px] px-1 gap-1",
        multiValueLabel: () => "pt-0.5",
        multiValueRemove: () => "hover:text-danger transition-colors text-background/50",
        indicatorsContainer: () => "cursor-pointer ml-1 py-1.5 gap-2 pr-2",
        clearIndicator: () =>
          twMerge(
            !props.isDisabled && "cursor-pointer hover:text-danger",
            "text-placeholder [&_svg]:size-[16px]"
          ),
        indicatorSeparator: () => "bg-border",
        dropdownIndicator: ({ isDisabled }) =>
          twMerge(
            !isDisabled && "cursor-pointer hover:text-foreground",
            "text-placeholder [&_svg]:size-[18px]"
          ),
        menuList: () => "flex flex-col gap-1",
        menu: () =>
          "rounded-[6px] mt-2 border border-border/50 thin-scrollbar bg-popover p-1 text-sm text-foreground shadow-md",
        groupHeading: () => "ml-3 mt-2 mb-1 text-mineshaft-400 text-sm",
        option: ({ isFocused, isDisabled }) =>
          twMerge(
            isFocused && "bg-foreground/10",
            isDisabled && "pointer-events-none opacity-50",
            "relative flex !cursor-pointer select-none items-center gap-2 rounded-sm px-2 pb-1.5 pt-2 outline-0",
            "[&_svg:not([class*='size-'])]:size-3.5 [&_svg]:pointer-events-none [&_svg]:mb-0.5 [&_svg]:shrink-0"
          ),
        noOptionsMessage: () => "text-foreground/50 p-1 rounded-sm",
        loadingMessage: () => "text-foreground/50 p-1 rounded-sm"
      }}
      {...props}
    />
  );
};
