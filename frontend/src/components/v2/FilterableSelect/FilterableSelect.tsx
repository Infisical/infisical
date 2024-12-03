import Select, { Props } from "react-select";
import { twMerge } from "tailwind-merge";

import { ClearIndicator, DropdownIndicator, MultiValueRemove, Option } from "../Select/components";

export const FilterableSelect = <T,>({
  isMulti,
  closeMenuOnSelect,
  tabSelectsValue = false,
  ...props
}: Props<T>) => (
  <Select
    isMulti={isMulti}
    closeMenuOnSelect={closeMenuOnSelect ?? !isMulti}
    hideSelectedOptions={false}
    unstyled
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
      })
    }}
    tabSelectsValue={tabSelectsValue}
    components={{
      DropdownIndicator,
      ClearIndicator,
      MultiValueRemove,
      Option,
      ...props.components
    }}
    classNames={{
      container: ({ isDisabled }) =>
        twMerge("w-full text-sm font-inter", isDisabled && "!pointer-events-auto opacity-50"),
      control: ({ isFocused, isDisabled }) =>
        twMerge(
          isFocused ? "border-primary-400/50" : "border-mineshaft-600 ",
          `border w-full p-0.5 rounded-md text-mineshaft-200 font-inter bg-mineshaft-900 ${
            isDisabled ? "!cursor-not-allowed" : "hover:border-gray-400 hover:cursor-pointer"
          } `
        ),
      placeholder: () =>
        `${isMulti ? "py-[0.22rem]" : "leading-7"} text-mineshaft-400 text-sm pl-1`,
      input: () => "pl-1",
      valueContainer: () =>
        `px-1 max-h-[8.2rem] ${
          isMulti ? "!overflow-y-auto thin-scrollbar py-1" : "py-[0.1rem]"
        } gap-1`,
      singleValue: () => "leading-7 ml-1",
      multiValue: () => "bg-mineshaft-600 text-sm rounded items-center py-0.5 px-2 gap-1.5",
      multiValueLabel: () => "leading-6 text-sm",
      multiValueRemove: () => "hover:text-red text-bunker-400",
      indicatorsContainer: () => "p-1 gap-1",
      clearIndicator: () => "p-1 hover:text-red text-bunker-400",
      indicatorSeparator: () => "bg-bunker-400",
      dropdownIndicator: () => "text-bunker-200 p-1",
      menuList: () => "flex flex-col gap-1",
      menu: () =>
        "my-2 p-2 border text-sm text-mineshaft-200 thin-scrollbar bg-mineshaft-900 border-mineshaft-600 rounded-md",
      groupHeading: () => "ml-3 mt-2 mb-1 text-mineshaft-400 text-sm",
      option: ({ isFocused, isSelected }) =>
        twMerge(
          isFocused && "bg-mineshaft-700 active:bg-mineshaft-600",
          isSelected && "text-mineshaft-200",
          "hover:cursor-pointer rounded text-xs px-3 py-2"
        ),
      noOptionsMessage: () => "text-mineshaft-400 p-2 rounded-md"
    }}
    {...props}
  />
);
